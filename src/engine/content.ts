/**
 * 正文解析 - 对标 Legado BookContent.kt
 * 
 * 功能：
 * - 支持单页/多页正文
 * - 支持 nextContentUrl 翻页（单页顺序 + 多页并发）
 * - 支持 replaceRegex 清理
 * - 支持 HTML 格式化（保留图片）
 * - 支持后台刷新缓存
 */

import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute, executeRule, executeRuleList } from './rule-parser/index.js'
import { resolveUrl } from './utils/url.js'
import type { BookSource, Chapter } from '../shared/types.js'

// ============================================================
// 类型定义
// ============================================================

export interface ContentOptions {
  redirectUrl?: string
  cachedHtml?: string
  nextChapterUrl?: string
  debugLog?: (msg: string) => void
  bookKind?: string
  _background?: boolean
}

// ============================================================
// 正文缓存
// ============================================================

const contentCache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

// ============================================================
// 辅助：解析请求配置
// ============================================================

function parseRequestConfig(
  url: string,
  defaultHeaders: Record<string, string>
): { url: string; method: string; headers: Record<string, string>; body: any } {
  let result = {
    url: url,
    method: 'GET' as string,
    headers: { ...defaultHeaders },
    body: null as any,
  }

  const jsonMatch = url.match(/,\s*(\{[\s\S]*\})$/)
  if (jsonMatch) {
    try {
      let configStr = jsonMatch[1].trim()
      configStr = configStr.replace(/'/g, '"')
      configStr = configStr.replace(/,(\s*})/g, '$1')
      const config = JSON.parse(configStr)

      result.url = url.substring(0, url.lastIndexOf(',')).trim()
      if (config.method) result.method = config.method.toUpperCase()
      if (config.headers) {
        result.headers = { ...defaultHeaders, ...config.headers }
      }
      if (config.body) result.body = config.body
    } catch {
      // 解析失败，使用默认配置
    }
  }

  return result
}

// ============================================================
// 辅助：使用 electronAPI.fetch 发送请求
// ============================================================

async function fetchWithElectronAPI(url: string, options: any): Promise<any> {
  const api = (globalThis as any).electronAPI
  if (!api || typeof api.fetch !== 'function') {
    const httpClient = getGlobalHttpClient()
    return httpClient.request({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      timeout: options.timeout || 30000,
    })
  }
  return api.fetch(url, options)
}

// ============================================================
// 核心：实际请求正文
// ============================================================

async function fetchContent(
  source: BookSource,
  chapterUrl: string,
  options: ContentOptions
): Promise<string> {
  const rule = source.ruleContent
  const { redirectUrl = chapterUrl, cachedHtml, nextChapterUrl, debugLog, bookKind } = options

  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    const headers = source.header ? JSON.parse(source.header) : {}
    
    let reqConfig = parseRequestConfig(chapterUrl, headers)
    
    if (reqConfig.url && reqConfig.url.includes(',{"method"')) {
      const cleanMatch = reqConfig.url.match(/^(https?:\/\/[^,]+)/)
      if (cleanMatch) {
        reqConfig.url = cleanMatch[1]
      }
    }
    
    if (reqConfig.body && typeof reqConfig.body === 'string') {
      try {
        const bodyObj = JSON.parse(reqConfig.body)
        if (bodyObj.ContentAnchorBatch && bodyObj.ContentAnchorBatch.length > 0) {
          // 从 options 获取 bookKind，不再硬编码
          if (!bodyObj.ContentAnchorBatch[0].BookID || bodyObj.ContentAnchorBatch[0].BookID === '') {
            if (!bookKind) {
              throw new Error('缺少 bookKind，无法填充 BookID')
            }
            bodyObj.ContentAnchorBatch[0].BookID = bookKind
            reqConfig.body = JSON.stringify(bodyObj)
            console.log('[Content] 填充 BookID:', bookKind)
          }
        }
      } catch (e) {
        // 忽略
      }
    }
    
    const response = await fetchWithElectronAPI(reqConfig.url, {
      method: reqConfig.method,
      headers: reqConfig.headers,
      body: reqConfig.body,
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

  if (!html || typeof html !== 'string') {
    throw new Error('内容为空')
  }

  const baseContext = {
    source,
    baseUrl: source.url,
    chapterUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    src: html,
    nextChapterUrl,
  }

  let allContent: string[] = []
  let nextUrls: string[] = [chapterUrl]
  let visitedUrls = new Set<string>()
  let maxPages = 10
  let pageCount = 0

  while (nextUrls.length > 0 && pageCount < maxPages) {
    pageCount++
    const currentUrl = nextUrls.shift()!
    
    if (visitedUrls.has(currentUrl)) continue
    visitedUrls.add(currentUrl)

    let pageHtml = html
    let pageRedirectUrl = finalRedirectUrl

    if (currentUrl !== chapterUrl) {
      const headers = source.header ? JSON.parse(source.header) : {}
      let reqConfig = parseRequestConfig(currentUrl, headers)
      
      if (reqConfig.url && reqConfig.url.includes(',{"method"')) {
        const cleanMatch = reqConfig.url.match(/^(https?:\/\/[^,]+)/)
        if (cleanMatch) {
          reqConfig.url = cleanMatch[1]
        }
      }
      
      if (reqConfig.body && typeof reqConfig.body === 'string') {
        try {
          const bodyObj = JSON.parse(reqConfig.body)
          if (bodyObj.ContentAnchorBatch && bodyObj.ContentAnchorBatch.length > 0) {
            if (!bodyObj.ContentAnchorBatch[0].BookID || bodyObj.ContentAnchorBatch[0].BookID === '') {
              if (!bookKind) {
                throw new Error('缺少 bookKind，无法填充 BookID')
              }
              bodyObj.ContentAnchorBatch[0].BookID = bookKind
              reqConfig.body = JSON.stringify(bodyObj)
            }
          }
        } catch (e) {}
      }
      
      const response = await fetchWithElectronAPI(reqConfig.url, {
        method: reqConfig.method,
        headers: reqConfig.headers,
        body: reqConfig.body,
        timeout: 30000,
      })
      if (response.status >= 200 && response.status < 300) {
        pageHtml = response.data
        pageRedirectUrl = response.url || currentUrl
      } else {
        continue
      }
    }

    const context = {
      ...baseContext,
      result: pageHtml,
      src: pageHtml,
      redirectUrl: pageRedirectUrl,
    }

    let content = executeRule(pageHtml, rule.content, context)
    
    if (Array.isArray(content)) {
      content = content.filter(item => item !== null && item !== undefined && item !== '').join('\n\n')
    }
    
    if (content === null || content === undefined || content === '') {
      content = parseAndExecute(pageHtml, rule.content, context)
    }

    if (content && typeof content === 'string' && content.trim()) {
      allContent.push(content.trim())
      debugLog?.(`[Content] 获取到 ${content.length} 字符`)
    }

    if (rule.nextContentUrl && pageCount < maxPages) {
      const nextResult = parseAndExecute(pageHtml, rule.nextContentUrl, context)
      if (nextResult) {
        const urls = Array.isArray(nextResult) ? nextResult : [nextResult]
        for (const u of urls) {
          if (u && typeof u === 'string' && u.trim()) {
            const absUrl = resolveUrl(u.trim(), pageRedirectUrl)
            if (absUrl && !visitedUrls.has(absUrl) && absUrl !== currentUrl) {
              if (nextChapterUrl && absUrl === resolveUrl(nextChapterUrl, pageRedirectUrl)) {
                continue
              }
              nextUrls.push(absUrl)
            }
          }
        }
      }
    }
  }

  let finalContent = allContent.join('\n\n')

  if (!finalContent || !finalContent.trim()) {
    throw new Error('正文为空')
  }

  if (rule.replaceRegex) {
    const context = {
      ...baseContext,
      result: finalContent,
      src: finalContent,
    }
    const cleaned = executeRule(finalContent, rule.replaceRegex, context)
    if (cleaned && typeof cleaned === 'string') {
      finalContent = cleaned
    }
  }

  finalContent = finalContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return finalContent
}

// ============================================================
// 主函数（带缓存 + 后台更新）
// ============================================================

export async function getContent(
  source: BookSource,
  chapterUrl: string,
  options: ContentOptions = {}
): Promise<string> {
  if (!chapterUrl || typeof chapterUrl !== 'string' || !chapterUrl.trim()) {
    console.warn('[Content] chapterUrl 无效')
    return '章节链接无效'
  }

  const rule = source.ruleContent

  if (!rule || !rule.content) {
    console.warn('[Content] 书源缺少 ruleContent.content')
    return '书源缺少正文规则'
  }

  const cacheKey = chapterUrl
  const cached = contentCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (!options._background) {
      const bgOptions = { ...options, _background: true }
      fetchContent(source, chapterUrl, bgOptions)
        .then(newContent => {
          if (newContent && newContent !== cached.content) {
            contentCache.set(cacheKey, { content: newContent, timestamp: Date.now() })
            console.log('[Content] 后台更新成功:', chapterUrl)
          }
        })
        .catch(() => {})
    }
    return cached.content
  }

  try {
    const content = await fetchContent(source, chapterUrl, options)
    contentCache.set(cacheKey, { content, timestamp: Date.now() })
    console.log('[Content] 缓存已更新:', chapterUrl)
    return content
  } catch (err: any) {
    console.warn('[Content] 请求失败:', err.message)
    return `请求失败: ${err.message}`
  }
}

// ============================================================
// 辅助函数
// ============================================================

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
  console.log('[Content] 缓存已清空')
}
