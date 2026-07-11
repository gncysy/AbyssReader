import * as cheerio from 'cheerio'
import { parseAndExecute } from './rule-parser/index.js'
import { getGlobalHttpClient } from './network/index.js'
import {
  parseRequestConfig,
  buildUrl,
  buildHeaders,
  resolveUrl,
  isJsonResponse,
  safeParseJson,
} from './utils/url.js'
import { isJsSource, executeJsContent } from './utils/js-source.js'
import { CACHE, NETWORK } from '../shared/constants.js'
import type { BookSource, Chapter } from '../shared/types.js'

const CACHE_CONFIG = {
  TTL: CACHE.CHAPTER_TTL,
  MAX_SIZE: CACHE.MAX_CHAPTERS,
  CLEANUP_RATIO: CACHE.CLEANUP_RATIO,
  MIN_CLEANUP: CACHE.MIN_CLEANUP,
}

const contentCache = new Map<string, { content: string; timestamp: number; size: number }>()
let cacheHits = 0
let cacheMisses = 0

export async function getContent(source: BookSource, chapterUrl: string): Promise<string> {
  const cached = contentCache.get(chapterUrl)
  if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.TTL) {
    cacheHits++
    return cached.content
  }
  cacheMisses++

  if (isJsSource(source)) {
    try {
      const result = await executeJsContent(source, chapterUrl)
      if (result && typeof result === 'string') {
        const finalContent = result
        contentCache.set(chapterUrl, {
          content: finalContent,
          timestamp: Date.now(),
          size: finalContent.length,
        })
        return finalContent
      }
      return '未能获取正文内容'
    } catch (error: any) {
      console.error('[Content] JS书源获取正文失败:', error.message)
      return '获取正文失败'
    }
  }

  const httpClient = getGlobalHttpClient()

  const rule = source.ruleContent
  if (!rule || !rule.content) {
    return '书源缺少正文规则'
  }

  try {
    let allContent = ''
    let currentUrl: string | null = chapterUrl
    let maxPages = 5
    let pageCount = 0

    while (currentUrl && pageCount < maxPages) {
      pageCount++
      const config = parseRequestConfig(currentUrl)
      const url = buildUrl(config.url, source.url, {})
      const headers = buildHeaders(source, config.headers)

      const response = await httpClient.request({
        url,
        method: config.method,
        headers,
        body: config.body,
        charset: config.charset || 'utf-8',
        timeout: NETWORK.DEFAULT_TIMEOUT,
      })

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}`)
      }

      let html = response.data
      const context = { source, baseUrl: source.url }

      let content: string = ''

      if (isJsonResponse(response.headers)) {
        const json = safeParseJson(html)
        if (json) {
          const text = json.content || json.text || json.body || json.data
          if (typeof text === 'string' && text.length > 0) {
            content = text
          } else {
            const result = parseAndExecute(json, rule.content, { ...context, json })
            if (typeof result === 'string') {
              content = result
            } else if (result !== null && result !== undefined) {
              content = String(result)
            }
          }
        }
      }

      if (!content) {
        const result = parseAndExecute(html, rule.content, context)
        if (typeof result === 'string') {
          content = result
        } else if (result !== null && result !== undefined) {
          content = String(result)
        }
      }

      if (content) {
        let cleanedContent: string
        if (typeof content === 'string') {
          cleanedContent = cleanContent(content)
        } else {
          cleanedContent = cleanContent(String(content))
        }

        if (rule.replaceRegex && cleanedContent) {
          cleanedContent = applyReplaceRules(cleanedContent, rule.replaceRegex)
        }

        allContent += cleanedContent
      }

      let nextUrl: string | null = null
      if (rule.nextContentUrl) {
        const context = { source, baseUrl: source.url }
        const nextResult = parseAndExecute(html, rule.nextContentUrl, context)
        if (nextResult && typeof nextResult === 'string') {
          nextUrl = resolveUrl(nextResult, source.url)
        }
      }
      currentUrl = nextUrl
    }

    const finalContent = allContent || '正文内容为空'

    const contentSize = finalContent.length
    contentCache.set(chapterUrl, {
      content: finalContent,
      timestamp: Date.now(),
      size: contentSize,
    })

    if (contentCache.size > CACHE_CONFIG.MAX_SIZE) {
      cleanCache()
    }

    return finalContent
  } catch (error: any) {
    throw new Error(`获取正文失败: ${error.message}`)
  }
}

function cleanCache(): void {
  const entries = Array.from(contentCache.entries())
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

  const toDelete = Math.max(
    Math.floor(contentCache.size * CACHE_CONFIG.CLEANUP_RATIO),
    CACHE_CONFIG.MIN_CLEANUP
  )

  for (const [key] of entries.slice(0, toDelete)) {
    contentCache.delete(key)
  }

  console.log(`[Cache] 清理 ${toDelete} 条缓存，当前大小 ${contentCache.size}`)
}

export function getCacheStats() {
  return {
    size: contentCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate:
      cacheHits + cacheMisses > 0
        ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) + '%'
        : 'N/A',
    totalSize: Array.from(contentCache.values()).reduce((sum, v) => sum + v.size, 0),
  }
}

export function cleanExpiredCache(): number {
  const now = Date.now()
  let cleaned = 0
  for (const [key, value] of contentCache) {
    if (now - value.timestamp > CACHE_CONFIG.TTL) {
      contentCache.delete(key)
      cleaned++
    }
  }
  return cleaned
}

export async function preloadChapters(
  source: BookSource,
  chapters: Chapter[],
  currentIndex: number
): Promise<void> {
  const preloadRange = CACHE.PRELOAD_RANGE
  const start = Math.min(currentIndex + 1, chapters.length - 1)
  const end = Math.min(start + preloadRange, chapters.length)

  if (start >= end) return

  const urls: string[] = []
  for (let i = start; i < end; i++) {
    const chapter = chapters[i]
    if (chapter && chapter.url && !contentCache.has(chapter.url)) {
      urls.push(chapter.url)
    }
  }

  if (urls.length === 0) return

  const concurrency = 2
  const promises: Promise<void>[] = []
  const queue = [...urls]

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

function cleanContent(html: string): string {
  if (!html) return ''

  const $ = cheerio.load(html, { xml: false })
  $('script, style').remove()
  $('br').replaceWith('\n')
  $('p, div, h1, h2, h3, h4, h5, h6').each((i, el) => {
    $(el).append('\n')
  })

  let result = $('body').text()
  result = result.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()

  return result
}

function applyReplaceRules(content: string, rules: string): string {
  if (!rules || !content) return content

  const cleanRules = rules.split('##')
  let result = content

  for (let i = 0; i < cleanRules.length; i += 2) {
    if (cleanRules[i + 1] !== undefined) {
      try {
        const regex = new RegExp(cleanRules[i], 'g')
        result = result.replace(regex, cleanRules[i + 1])
      } catch {
        // 正则无效，跳过
      }
    }
  }

  return result
}
