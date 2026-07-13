/**
 * 目录解析 - 对标 Legado BookChapterList.kt
 * 
 * 功能：
 * - 支持单页/多页目录
 * - 支持 nextTocUrl 翻页（单页顺序 + 多页并发）
 * - 支持章节去重
 * - 支持 - 前缀反转
 * - 支持 VIP 标记
 */

import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute, executeRule, executeRuleList, executeRuleElements } from './rule-parser/index.js'
import { resolveUrl, isJsonResponse, safeParseJson } from './utils/url.js'
import type { BookSource, Chapter } from '../shared/types.js'

// ============================================================
// 类型定义
// ============================================================

export interface TocOptions {
  redirectUrl?: string
  cachedHtml?: string
  debugLog?: (msg: string) => void
}

// ============================================================
// 主函数
// ============================================================

export async function getToc(
  source: BookSource,
  tocUrl: string,
  options: TocOptions = {}
): Promise<Chapter[]> {
  if (!tocUrl || typeof tocUrl !== 'string' || tocUrl === '') {
    console.warn('[Toc] tocUrl 无效:', tocUrl)
    return []
  }

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleToc

  if (!rule || !rule.chapterList) {
    console.warn('[Toc] 书源缺少 ruleToc.chapterList')
    return []
  }

  const { redirectUrl = tocUrl, cachedHtml, debugLog } = options

  // ===== 1. 获取 HTML =====
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({
        url: tocUrl,
        method: 'GET',
        headers,
        timeout: 30000,
      })

      if (response.status < 200 || response.status >= 300) {
        console.warn('[Toc] HTTP 失败:', response.status)
        return []
      }

      html = response.data
      if (response.url && response.url !== tocUrl) {
        finalRedirectUrl = response.url
      }
    } catch (err: any) {
      console.warn('[Toc] 请求失败:', err.message)
      return []
    }
  }

  if (!html || typeof html !== 'string') {
    return []
  }

  // ===== 2. 构建上下文 =====
  const baseContext = {
    source,
    baseUrl: source.url,
    tocUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    src: html,
  }

  // ===== 3. 获取目录列表（支持翻页） =====
  let allChapters: Chapter[] = []
  let nextUrls: string[] = [tocUrl]
  let visitedUrls = new Set<string>()
  let maxPages = 20
  let pageCount = 0

  // 检测是否反转
  let chapterListRule = rule.chapterList || ''
  let reverse = false
  
  if (chapterListRule.startsWith('-')) {
    reverse = true
    chapterListRule = chapterListRule.substring(1)
  } else if (chapterListRule.startsWith('+')) {
    chapterListRule = chapterListRule.substring(1)
  }

  while (nextUrls.length > 0 && pageCount < maxPages) {
    pageCount++
    const currentUrl = nextUrls.shift()!
    
    if (visitedUrls.has(currentUrl)) continue
    visitedUrls.add(currentUrl)

    // 获取当前页 HTML
    let pageHtml = html
    let pageRedirectUrl = finalRedirectUrl

    if (currentUrl !== tocUrl) {
      try {
        const headers = source.header ? JSON.parse(source.header) : {}
        const response = await httpClient.request({
          url: currentUrl,
          method: 'GET',
          headers,
          timeout: 30000,
        })
        if (response.status >= 200 && response.status < 300) {
          pageHtml = response.data
          pageRedirectUrl = response.url || currentUrl
        } else {
          continue
        }
      } catch (err) {
        console.warn('[Toc] 翻页请求失败:', currentUrl, err)
        continue
      }
    }

    // 解析当前页
    const context = {
      ...baseContext,
      result: pageHtml,
      src: pageHtml,
      redirectUrl: pageRedirectUrl,
    }

    // 获取目录列表
    let chapterItems = executeRuleElements(pageHtml, chapterListRule, context)
    
    if (!chapterItems || !Array.isArray(chapterItems) || chapterItems.length === 0) {
      // 尝试用 parseAndExecute
      const result = parseAndExecute(pageHtml, chapterListRule, context)
      if (result && Array.isArray(result)) {
        chapterItems = result
      }
    }

    if (chapterItems && Array.isArray(chapterItems) && chapterItems.length > 0) {
      // 解析每个章节
      for (const item of chapterItems) {
        const itemContext = {
          ...context,
          result: item,
          src: item,
        }

        // 检测卷名
        if (rule.isVolume) {
          const volume = executeRule(item, rule.isVolume, itemContext)
          if (volume && typeof volume === 'string' && volume.trim()) {
            // 卷名作为独立项不添加，但记录用于后续章节
            continue
          }
        }

        const title = executeRule(item, rule.chapterName || '', itemContext) || '无标题'
        const url = executeRule(item, rule.chapterUrl || '', itemContext)
        
        if (!url || typeof url !== 'string' || !url.trim()) {
          // 如果章节没有 URL，尝试从 item 中获取
          const fallbackUrl = item.url || item.href || item.link || ''
          if (fallbackUrl) {
            const chapter: Chapter = {
              id: allChapters.length,
              title: String(title).trim(),
              url: resolveUrl(String(fallbackUrl), pageRedirectUrl),
              index: allChapters.length,
              isVip: false,
              isPay: false,
              content: null,
            }
            allChapters.push(chapter)
          }
          continue
        }

        const isVip = executeRule(item, rule.isVip || '', itemContext)
        const isPay = executeRule(item, rule.isPay || '', itemContext)
        const updateTime = executeRule(item, rule.updateTime || '', itemContext)

        let chapterTitle = String(title).trim()
        if (!chapterTitle) chapterTitle = '无标题'

        const chapter: Chapter = {
          id: allChapters.length,
          title: chapterTitle,
          url: resolveUrl(String(url), pageRedirectUrl),
          index: allChapters.length,
          isVip: String(isVip).includes("true"),
          isPay: String(isPay).includes("true"),
          content: null,
          updateTime: updateTime ? String(updateTime) : undefined,
        }
        allChapters.push(chapter)
      }

      debugLog?.(`[Toc] 页 ${pageCount} 解析到 ${chapterItems.length} 个章节`)
    }

    // 获取下一页 URL
    if (rule.nextTocUrl && pageCount < maxPages) {
      const nextResult = parseAndExecute(pageHtml, rule.nextTocUrl, context)
      if (nextResult) {
        const urls = Array.isArray(nextResult) ? nextResult : [nextResult]
        for (const u of urls) {
          if (u && typeof u === 'string' && u.trim()) {
            const absUrl = resolveUrl(u.trim(), pageRedirectUrl)
            if (absUrl && !visitedUrls.has(absUrl) && absUrl !== currentUrl) {
              nextUrls.push(absUrl)
            }
          }
        }
      }
    }
  }

  // ===== 4. 去重 =====
  const seen = new Set<string>()
  const unique: Chapter[] = []
  for (const ch of allChapters) {
    const key = ch.url
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(ch)
    }
  }

  // ===== 5. 反转（如果需要） =====
  if (reverse) {
    unique.reverse()
  }

  // ===== 6. 重新编号 =====
  unique.forEach((ch, idx) => {
    ch.index = idx
    ch.id = idx
  })

  debugLog?.(`[Toc] 总章节数: ${unique.length}`)
  console.log('[Toc] 返回章节数:', unique.length)
  return unique
}




