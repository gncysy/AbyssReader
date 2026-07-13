/**
 * 书籍详情解析 - 对标 Legado BookInfo.kt
 * 
 * 功能：
 * - 支持 init 初始化规则
 * - 自动获取 name、author、kind、wordCount、lastChapter、intro、coverUrl、tocUrl
 * - 支持 canReName 重命名
 * - 支持 tocUrl 自动补全
 */

import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute, executeRule } from './rule-parser/index.js'
import { resolveUrl, cleanIntro, isJsonResponse, safeParseJson } from './utils/url.js'
import type { Book, BookSource } from '../shared/types.js'

// ============================================================
// 类型定义
// ============================================================

export interface BookInfoOptions {
  redirectUrl?: string
  cachedHtml?: string
  canReName?: boolean
  debugLog?: (msg: string) => void
}

// ============================================================
// 主函数
// ============================================================

export async function getBookInfo(
  source: BookSource,
  bookUrl: string,
  options: BookInfoOptions = {}
): Promise<Book | null> {
  if (!bookUrl || typeof bookUrl !== 'string' || !bookUrl.trim()) {
    console.warn('[BookInfo] bookUrl 无效')
    return null
  }

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleBookInfo

  if (!rule) {
    console.warn('[BookInfo] 书源缺少 ruleBookInfo')
    return null
  }

  const { redirectUrl = bookUrl, cachedHtml, canReName = false, debugLog } = options

  // ===== 1. 获取 HTML =====
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({
        url: bookUrl,
        method: 'GET',
        headers,
        timeout: 30000,
      })

      if (response.status < 200 || response.status >= 300) {
        console.warn('[BookInfo] HTTP 失败:', response.status)
        return null
      }

      html = response.data
      if (response.url && response.url !== bookUrl) {
        finalRedirectUrl = response.url
      }
    } catch (err: any) {
      console.warn('[BookInfo] 请求失败:', err.message)
      return null
    }
  }

  if (!html || typeof html !== 'string') {
    return null
  }

  // ===== 2. 构建上下文 =====
  const bookObj = { bookUrl, name: '', tocUrl: '' }
  const baseContext = {
    source,
    baseUrl: source.url,
    bookUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
    src: html,
    book: bookObj,
  }

  // ===== 3. 执行 init 规则 =====
  if (rule.init) {
    debugLog?.('[BookInfo] 执行 init 规则')
    try {
      const initResult = parseAndExecute(html, rule.init, baseContext)
      if (initResult && typeof initResult === 'string') {
        html = initResult
        baseContext.result = initResult
        baseContext.src = initResult
      }
    } catch (err) {
      console.warn('[BookInfo] init 规则执行失败:', err)
    }
  }

  // ===== 4. 提取各字段 =====
  const context = { ...baseContext, result: html, src: html }

  // 书名
  debugLog?.('[BookInfo] 获取书名')
  let name = executeRule(html, rule.name || '', context)
  if (name && typeof name === 'string') {
    name = name.trim()
  } else {
    name = ''
  }

  // 如果书名无效且 canReName 为 false，尝试用默认值
  if (!name && !canReName) {
    // 从标题获取
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      name = titleMatch[1].trim()
    }
  }

  if (!name) {
    name = '未命名'
  }

  // 作者
  debugLog?.('[BookInfo] 获取作者')
  let author = executeRule(html, rule.author || '', context)
  if (author && typeof author === 'string') {
    author = author.trim()
  } else {
    author = '未知作者'
  }

  // 分类
  debugLog?.('[BookInfo] 获取分类')
  let kind = executeRule(html, rule.kind || '', context)
  if (kind && typeof kind === 'string') {
    kind = kind.trim()
  } else {
    kind = ""
  }

  // 字数
  debugLog?.('[BookInfo] 获取字数')
  let wordCount = executeRule(html, rule.wordCount || '', context)
  if (wordCount && typeof wordCount === 'string') {
    wordCount = wordCount.trim()
  } else {
    wordCount = ""
  }

  // 最新章节
  debugLog?.('[BookInfo] 获取最新章节')
  let lastChapter = executeRule(html, rule.lastChapter || '', context)
  if (lastChapter && typeof lastChapter === 'string') {
    lastChapter = lastChapter.trim()
  } else {
    lastChapter = ""
  }

  // 简介
  debugLog?.('[BookInfo] 获取简介')
  let intro = executeRule(html, rule.intro || '', context)
  if (intro && typeof intro === 'string') {
    intro = cleanIntro(intro)
  } else {
    intro = ""
  }

  // 封面
  debugLog?.('[BookInfo] 获取封面')
  let coverUrl = executeRule(html, rule.coverUrl || '', context)
  if (coverUrl && typeof coverUrl === 'string') {
    coverUrl = resolveUrl(coverUrl.trim(), finalRedirectUrl)
  } else {
    coverUrl = ""
  }

  // 目录 URL
  debugLog?.('[BookInfo] 获取目录链接')
  let tocUrl = executeRule(html, rule.tocUrl || '', context)
  if (tocUrl && typeof tocUrl === 'string' && tocUrl.trim()) {
    tocUrl = resolveUrl(tocUrl.trim(), finalRedirectUrl)
  } else {
    // 如果 tocUrl 无效，用 bookUrl
    tocUrl = bookUrl
  }

  // ===== 5. 返回结果 =====
  return {
    id: bookUrl,
    sourceId: source.id,
    sourceName: source.name,
    name: String(name),
    author: String(author),
    coverUrl: coverUrl || null,
    intro: intro || null,
    kind: kind || null,
    lastChapter: lastChapter || null,
    bookUrl: bookUrl,
    tocUrl: tocUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

