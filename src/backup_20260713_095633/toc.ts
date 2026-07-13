import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute } from './rule-parser/index.js'
import { resolveUrl, isJsonResponse, safeParseJson } from './utils/url.js'
import { isJsSource, executeJsToc } from './utils/js-source.js'
import type { BookSource, Chapter } from '../shared/types.js'

export async function getToc(
  source: BookSource,
  tocUrl: string,
  options?: {
    redirectUrl?: string
    cachedHtml?: string
  }
): Promise<Chapter[]> {
  const httpClient = getGlobalHttpClient()
  const rule = source.ruleToc

  if (!rule || !rule.chapterList) {
    return []
  }

  const { redirectUrl = tocUrl, cachedHtml } = options || {}

  // ===== JS书源 =====
  if (isJsSource(source)) {
    try {
      const result = await executeJsToc(source, tocUrl)
      if (result && Array.isArray(result)) {
        return result.map((item: any, index: number) => ({
          id: typeof item.id === 'number' ? item.id : index,
          title: String(item.title || '无标题'),
          url: String(item.url || ''),
          index: typeof item.index === 'number' ? item.index : index,
          isVip: !!item.isVip,
          isPay: !!item.isPay,
          content: item.content ? String(item.content) : null,
          updateTime: item.updateTime ? String(item.updateTime) : undefined,
        }))
      }
      return []
    } catch (error: any) {
      console.error('[Toc] JS书源获取目录失败:', error.message)
      return []
    }
  }

  // ===== 规则书源 =====
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    const response = await httpClient.request({
      url: tocUrl,
      method: 'GET',
      headers: source.header ? JSON.parse(source.header) : {},
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      return []
    }

    html = response.data
    if (response.url && response.url !== tocUrl) {
      finalRedirectUrl = response.url
    }
  }

  const context = {
    source,
    baseUrl: source.url,
    tocUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
  }

  // 获取目录列表
  let chapterList = parseAndExecute(html, rule.chapterList, context)
  if (!chapterList || !Array.isArray(chapterList)) {
    return []
  }

  // 解析每个章节
  const chapters: Chapter[] = []
  let isVolumeActive = false
  let currentVolume = ''

  for (let i = 0; i < chapterList.length; i++) {
    const item = chapterList[i]
    const itemContext = { ...context, result: item }

    // 检测卷名
    if (rule.isVolume) {
      const volume = parseAndExecute(item, rule.isVolume || '', itemContext)
      if (volume && typeof volume === 'string' && volume.trim()) {
        isVolumeActive = true
        currentVolume = volume.trim()
        continue
      }
    }

    const title = parseAndExecute(item, rule.chapterName || '', itemContext) || '无标题'
    const url = parseAndExecute(item, rule.chapterUrl || '', itemContext)
    const isVip = parseAndExecute(item, rule.isVip || '', itemContext)
    const isPay = parseAndExecute(item, rule.isPay || '', itemContext)
    const updateTime = parseAndExecute(item, rule.updateTime || '', itemContext)

    if (!url) continue

    let chapterTitle = String(title).trim()
    if (isVolumeActive && currentVolume) {
      chapterTitle = `${currentVolume} ${chapterTitle}`
    }

    chapters.push({
      id: i,
      title: chapterTitle,
      url: resolveUrl(String(url), finalRedirectUrl),
      index: i,
      isVip: isVip === 'true' || isVip === true,
      isPay: isPay === 'true' || isPay === true,
      content: null,
      updateTime: updateTime ? String(updateTime) : undefined,
    })
  }

  // 获取下一页目录
  if (rule.nextTocUrl) {
    const nextUrls = parseAndExecute(html, rule.nextTocUrl, context)
    if (nextUrls) {
      const urlList = Array.isArray(nextUrls) ? nextUrls : [nextUrls]
      const validUrls = urlList
        .map(u => resolveUrl(String(u), finalRedirectUrl))
        .filter(u => u && u !== tocUrl)

      if (validUrls.length === 1) {
        // 单页：递归获取
        try {
          const nextChapters = await getToc(source, validUrls[0], {
            redirectUrl: finalRedirectUrl,
          })
          chapters.push(...nextChapters)
        } catch (err) {
          console.warn('[Toc] 获取下一页目录失败:', err)
        }
      } else if (validUrls.length > 1) {
        // 多页：并发获取
        const promises = validUrls.map(async url => {
          try {
            return await getToc(source, url, { redirectUrl: finalRedirectUrl })
          } catch {
            return [] as Chapter[]
          }
        })
        const results = await Promise.all(promises)
        for (const result of results) {
          chapters.push(...result)
        }
      }
    }
  }

  // 去重并重新编号
  const seen = new Set<string>()
  const unique: Chapter[] = []
  for (const ch of chapters) {
    if (!seen.has(ch.url)) {
      seen.add(ch.url)
      unique.push(ch)
    }
  }

  unique.forEach((ch, idx) => {
    ch.index = idx
    ch.id = idx
  })

  console.log('[Toc] 返回章节数:', unique.length)
  return unique
}

