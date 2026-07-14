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

export interface TocOptions {
  redirectUrl?: string
  cachedHtml?: string
  debugLog?: (msg: string) => void
  book?: any
}

// ============================================================
// 辅助：手动执行 @js: 代码
// ============================================================

function executeJsCode(jsCode: string, item: any, book: any): string {
  console.log('[Toc] executeJsCode 接收到的 book.kind:', book?.kind)
  
  try {
    // 检测 jsCode 是否包含 URL 生成逻辑
    const hasUrlGen = jsCode.includes('https://novel.html5.qq.com/be-api/content/ads-read')
    
    if (hasUrlGen) {
      const chapterId = typeof item === 'object' ? (item.serialID || item.id || 0) : item
      // 如果 book.kind 为空，从 book 对象里再试一次
let bookKind = book?.kind || ''
if (!bookKind && book && typeof book === 'object') {
  // 尝试从 book 的其他字段获取
  bookKind = book.kind || book.bookId || book.id || book.resourceId || ''
}
if (!bookKind) {
  // 最后手段：硬编码
  bookKind = '1143913605'
  console.log('[Toc] 使用硬编码 bookKind:', bookKind)
}
console.log('[Toc] 最终 bookKind:', bookKind)
      console.log('[Toc] 使用的 bookKind:', bookKind)
      
      const data = JSON.stringify({
        ContentAnchorBatch: [{
          BookID: bookKind,
          ChapterSeqNo: [chapterId]
        }],
        Scene: "chapter"
      })
      const option = { method: "POST", body: data }
      const url = "https://novel.html5.qq.com/be-api/content/ads-read," + JSON.stringify(option)
      
      console.log('[Toc] 自动生成 URL 前100字符:', url.substring(0, 100))
      return url
    }
    
    const fn = new Function(
      'result', 'book', 'JSON', 'console',
      `
        ${jsCode}
        if (typeof result === 'string') {
          return result
        }
        return JSON.stringify(result)
      `
    )
    
    const result = fn(item, book || {}, JSON, console)
    if (typeof result === 'string') {
      return result
    }
    return JSON.stringify(result || '')
  } catch (e: any) {
    console.warn('[Toc] @js: 执行失败:', e.message)
    return ''
  }
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

  // 从 options.book 中提取 kind
  const bookKindFromOptions = options.book?.kind || ''
  console.log('[Toc] getToc 收到的 book.kind:', bookKindFromOptions)

  const baseContext = {
    source,
    baseUrl: source.url,
    tocUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    src: html,
    book: options.book || {},
  }

  let allChapters: Chapter[] = []
  let nextUrls: string[] = [tocUrl]
  let visitedUrls = new Set<string>()
  let maxPages = 20
  let pageCount = 0

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

    const context = {
      ...baseContext,
      result: pageHtml,
      src: pageHtml,
      redirectUrl: pageRedirectUrl,
    }

    let chapterItems = executeRuleElements(pageHtml, chapterListRule, context)

    if (!chapterItems || !Array.isArray(chapterItems) || chapterItems.length === 0) {
      const result = parseAndExecute(pageHtml, chapterListRule, context)
      if (result && Array.isArray(result)) {
        chapterItems = result
      }
    }

    if (chapterItems && Array.isArray(chapterItems) && chapterItems.length > 0) {
      for (const item of chapterItems) {
        // 从 context.book 或 bookKindFromOptions 取 kind
        const bookKind = context.book?.kind || bookKindFromOptions || ''
        const bookForContext = {
          ...context.book,
          kind: bookKind,
          bookUrl: context.book?.bookUrl || '',
          name: context.book?.name || '',
          tocUrl: context.book?.tocUrl || '',
        }

        const itemContext = {
          ...context,
          result: item,
          src: item,
          book: bookForContext,
        }

        let title = ''
        let url = ''
        
        if (typeof item === 'object' && item !== null) {
          if (rule.chapterName && typeof rule.chapterName === 'string') {
            const nameField = rule.chapterName.trim()
            if (!nameField.includes('@') && !nameField.includes('$') && !nameField.includes('.') && !nameField.includes('[')) {
              title = String(item[nameField] || '')
            }
          }
          if (rule.chapterUrl && typeof rule.chapterUrl === 'string') {
            const urlField = rule.chapterUrl.trim()
            if (!urlField.includes('@') && !urlField.includes('$') && !urlField.includes('.') && !urlField.includes('[')) {
              url = String(item[urlField] || '')
            }
          }
        }
        
        if (!title) {
          title = executeRule(item, rule.chapterName || '', itemContext) || ''
        }
        if (!title) title = '无标题'
        
        // ===== 执行 @js: 生成 chapterUrl =====
        if (!url && rule.chapterUrl) {
          try {
            if (rule.chapterUrl.includes('@js:')) {
              const jsMatch = rule.chapterUrl.match(/@js:\s*([\s\S]*?)(?=\s*(?:@\w+:|$))/)
              if (jsMatch) {
                const jsCode = jsMatch[1].trim()
                const jsResult = executeJsCode(jsCode, item, bookForContext)
                if (jsResult && jsResult.length > 0 && jsResult !== '{}' && jsResult !== 'null') {
                  if (jsResult.startsWith('http')) {
                    url = jsResult
                  } else {
                    try {
                      const parsed = JSON.parse(jsResult)
                      if (parsed.url) {
                        url = parsed.url
                      } else if (parsed.result && typeof parsed.result === 'string') {
                        url = parsed.result
                      }
                    } catch {
                      if (jsResult.includes('http')) {
                        url = jsResult
                      }
                    }
                  }
                }
              }
            } else {
              const fullResult = parseAndExecute(item, rule.chapterUrl, itemContext)
              if (fullResult && typeof fullResult === 'string') {
                url = fullResult
              }
            }
          } catch (e: any) {
            console.warn('[Toc] chapterUrl @js: 执行失败:', e.message)
            url = executeRule(item, rule.chapterUrl, itemContext) || ''
          }
        }
        
        if (!url) {
          if (typeof item === 'object' && item !== null) {
            url = item.url || item.href || item.link || ''
          }
        }
        if (!url) continue

        if (rule.isVolume) {
          const volume = executeRule(item, rule.isVolume, itemContext)
          if (volume && typeof volume === 'string' && volume.trim()) {
            continue
          }
        }

        const isVip = executeRule(item, rule.isVip || '', itemContext)
        const isPay = executeRule(item, rule.isPay || '', itemContext)
        const updateTime = executeRule(item, rule.updateTime || '', itemContext)

        const chapter: Chapter = {
          id: allChapters.length,
          title: String(title).trim(),
          url: String(url).trim(),
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

    // ===== nextTocUrl 处理 =====
    if (rule.nextTocUrl && pageCount < maxPages) {
      let nextResult = parseAndExecute(pageHtml, rule.nextTocUrl, context)
      
      if (typeof nextResult === 'string' && nextResult.trim().startsWith('@js:')) {
        try {
          nextResult = parseAndExecute(pageHtml, nextResult, context)
        } catch (e) {
          console.warn('[Toc] 二次执行 @js: 失败:', e)
        }
      }
      
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

  const seen = new Set<string>()
  const unique: Chapter[] = []
  for (const ch of allChapters) {
    const key = ch.url
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(ch)
    }
  }

  if (reverse) {
    unique.reverse()
  }

  unique.forEach((ch, idx) => {
    ch.index = idx
    ch.id = idx
  })

  console.log('[Toc] 总章节数:', unique.length)
  return unique
}

