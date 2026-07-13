import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute } from './rule-parser/index.js'
import { resolveUrl } from './utils/url.js'
import { isJsSource, executeJsContent } from './utils/js-source.js'
import type { BookSource, Chapter } from '../shared/types.js'

const contentCache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

export async function getContent(
  source: BookSource,
  chapterUrl: string,
  options?: {
    redirectUrl?: string
    cachedHtml?: string
    nextChapterUrl?: string
  }
): Promise<string> {
  const httpClient = getGlobalHttpClient()
  const rule = source.ruleContent

  if (!rule || !rule.content) {
    return '书源缺少正文规则'
  }

  const cacheKey = chapterUrl
  const cached = contentCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content
  }

  const { redirectUrl = chapterUrl, cachedHtml, nextChapterUrl } = options || {}

  if (isJsSource(source)) {
    try {
      const result = await executeJsContent(source, chapterUrl)
      if (result && typeof result === 'string') {
        contentCache.set(cacheKey, { content: result, timestamp: Date.now() })
        return result
      }
      return '未能获取正文内容'
    } catch (error: any) {
      console.error('[Content] JS书源获取正文失败:', error.message)
      return '获取正文失败'
    }
  }

  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    const response = await httpClient.request({
      url: chapterUrl,
      method: 'GET',
      headers: source.header ? JSON.parse(source.header) : {},
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    html = response.data
    if (response.url && response.url !== chapterUrl) {
      finalRedirectUrl = response.url
    }
  }

  const context = {
    source,
    baseUrl: source.url,
    chapterUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    nextChapterUrl,
  }

  let content = parseAndExecute(html, rule.content, context)
  if (!content || typeof content !== 'string') {
    return '正文内容为空'
  }

  if (rule.replaceRegex) {
    content = parseAndExecute(content, rule.replaceRegex, context) || content
  }

  let nextUrls: string[] = []
  if (rule.nextContentUrl) {
    const result = parseAndExecute(html, rule.nextContentUrl, context)
    if (result) {
      if (Array.isArray(result)) {
        nextUrls = result.map(r => resolveUrl(String(r), finalRedirectUrl))
      } else if (typeof result === 'string') {
        const url = resolveUrl(result, finalRedirectUrl)
        if (url) nextUrls.push(url)
      }
    }
  }

  let finalContent = content

  if (nextUrls.length === 1) {
    const nextUrl = nextUrls[0]
    if (nextUrl && nextUrl !== chapterUrl && nextUrl !== nextChapterUrl) {
      try {
        const nextContent = await getContent(source, nextUrl, {
          redirectUrl: finalRedirectUrl,
          nextChapterUrl,
        })
        if (nextContent && nextContent !== '正文内容为空') {
          finalContent += '\n' + nextContent
        }
      } catch (err) {
        console.warn('[Content] 获取下一页失败:', err)
      }
    }
  } else if (nextUrls.length > 1) {
    const promises = nextUrls
      .filter(url => url && url !== chapterUrl && url !== nextChapterUrl)
      .map(async url => {
        try {
          return await getContent(source, url, {
            redirectUrl: finalRedirectUrl,
            nextChapterUrl,
          })
        } catch {
          return ''
        }
      })

    const results = await Promise.all(promises)
    for (const result of results) {
      if (result && result !== '正文内容为空') {
        finalContent += '\n' + result
      }
    }
  }

  contentCache.set(cacheKey, { content: finalContent, timestamp: Date.now() })
  return finalContent
}

export async function preloadChapters(
  source: BookSource,
  chapters: Chapter[],
  currentIndex: number
): Promise<void> {
  const preloadRange = 3
  const start = Math.min(currentIndex + 1, chapters.length - 1)
  const end = Math.min(start + preloadRange, chapters.length)

  if (start >= end) return

  const urls: string[] = []
  for (let i = start; i < end; i++) {
    const chapter = chapters[i]
    if (chapter && chapter.url) {
      urls.push(chapter.url)
    }
  }

  if (urls.length === 0) return

  const concurrency = 2
  const queue = [...urls]
  const promises: Promise<void>[] = []

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift()
      if (!url) break
      try {
        await getContent(source, url)
      } catch {
        // 预加载失败忽略
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
    promises.push(worker())
  }

  await Promise.allSettled(promises)
}

export function getCacheStats() {
  return {
    size: contentCache.size,
  }
}

export function cleanExpiredCache(): number {
  const now = Date.now()
  let cleaned = 0
  for (const [key, value] of contentCache) {
    if (now - value.timestamp > CACHE_TTL) {
      contentCache.delete(key)
      cleaned++
    }
  }
  return cleaned
}

export function clearContentCache(): void {
  contentCache.clear()
}
