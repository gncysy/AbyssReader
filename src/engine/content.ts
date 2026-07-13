/**
 * 正文解析 - 对标 Legado BookContent.kt
 * 
 * 功能：
 * - 支持单页/多页正文
 * - 支持 nextContentUrl 翻页（单页顺序 + 多页并发）
 * - 支持 replaceRegex 清理
 * - 支持 HTML 格式化（保留图片）
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
}

// ============================================================
// 正文缓存
// ============================================================

const contentCache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

// ============================================================
// 主函数
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

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleContent

  if (!rule || !rule.content) {
    console.warn('[Content] 书源缺少 ruleContent.content')
    return '书源缺少正文规则'
  }

  const { redirectUrl = chapterUrl, cachedHtml, nextChapterUrl, debugLog } = options

  // ===== 检查缓存 =====
  const cacheKey = chapterUrl
  const cached = contentCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    debugLog?.(`[Content] 缓存命中: ${chapterUrl}`)
    return cached.content
  }

  // ===== 1. 获取 HTML =====
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({
        url: chapterUrl,
        method: 'GET',
        headers,
        timeout: 30000,
      })

      if (response.status < 200 || response.status >= 300) {
        console.warn('[Content] HTTP 失败:', response.status)
        return `HTTP ${response.status}`
      }

      html = response.data
      if (response.url && response.url !== chapterUrl) {
        finalRedirectUrl = response.url
      }
    } catch (err: any) {
      console.warn('[Content] 请求失败:', err.message)
      return `请求失败: ${err.message}`
    }
  }

  if (!html || typeof html !== 'string') {
    return '内容为空'
  }

  // ===== 2. 构建上下文 =====
  const baseContext = {
    source,
    baseUrl: source.url,
    chapterUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    src: html,
    nextChapterUrl,
  }

  // ===== 3. 获取正文（支持翻页） =====
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

    // 获取当前页 HTML
    let pageHtml = html
    let pageRedirectUrl = finalRedirectUrl

    if (currentUrl !== chapterUrl) {
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
        console.warn('[Content] 翻页请求失败:', currentUrl, err)
        continue
      }
    }

    // 解析正文
    const context = {
      ...baseContext,
      result: pageHtml,
      src: pageHtml,
      redirectUrl: pageRedirectUrl,
    }

    let content = executeRule(pageHtml, rule.content, context)
    
    if (content === null || content === undefined || content === '') {
      // 尝试用 parseAndExecute
      content = parseAndExecute(pageHtml, rule.content, context)
    }

    if (content && typeof content === 'string' && content.trim()) {
      allContent.push(content.trim())
      debugLog?.(`[Content] 页 ${pageCount} 获取到 ${content.length} 字符`)
    }

    // 获取下一页 URL
    if (rule.nextContentUrl && pageCount < maxPages) {
      const nextResult = parseAndExecute(pageHtml, rule.nextContentUrl, context)
      if (nextResult) {
        const urls = Array.isArray(nextResult) ? nextResult : [nextResult]
        for (const u of urls) {
          if (u && typeof u === 'string' && u.trim()) {
            const absUrl = resolveUrl(u.trim(), pageRedirectUrl)
            if (absUrl && !visitedUrls.has(absUrl) && absUrl !== currentUrl) {
              // 检查是否与下一章 URL 相同
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

  // ===== 4. 合并正文 =====
  let finalContent = allContent.join('\n\n')

  if (!finalContent || !finalContent.trim()) {
    debugLog?.(`[Content] 正文为空`)
    return '正文内容为空'
  }

  // ===== 5. 应用 replaceRegex 清理 =====
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

  // ===== 6. 简单格式化 =====
  finalContent = finalContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '') // 移除 HTML 标签
    .replace(/\s+/g, ' ')
    .trim()

  // ===== 7. 缓存 =====
  contentCache.set(cacheKey, { content: finalContent, timestamp: Date.now() })

  debugLog?.(`[Content] 最终内容长度: ${finalContent.length}`)
  return finalContent
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
}
