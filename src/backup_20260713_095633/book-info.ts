import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute, putVariable, getVariable } from './rule-parser/index.js'
import { resolveUrl, cleanIntro, isJsonResponse, safeParseJson } from './utils/url.js'
import type { Book, BookSource } from '../shared/types.js'

export async function getBookInfo(
  source: BookSource,
  bookUrl: string,
  options?: {
    redirectUrl?: string
    canReName?: boolean
    cachedHtml?: string
  }
): Promise<Book | null> {
  const httpClient = getGlobalHttpClient()
  const rule = source.ruleBookInfo

  if (!rule || !rule.name) {
    console.warn('[BookInfo] 书源缺少 ruleBookInfo')
    return null
  }

  const { redirectUrl = bookUrl, canReName = false, cachedHtml } = options || {}

  // 1. 获取 HTML
  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    const response = await httpClient.request({
      url: bookUrl,
      method: 'GET',
      headers: source.header ? JSON.parse(source.header) : {},
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    html = response.data
    // 如果有重定向，使用最终 URL
    if (response.url && response.url !== bookUrl) {
      finalRedirectUrl = response.url
    }
  }

  const context = {
    source,
    baseUrl: source.url,
    bookUrl,
    redirectUrl: finalRedirectUrl,
    result: html,
  }

  // 2. 处理 init 规则（如果存在）
  let currentContent = html

  if (rule.init) {
    console.log('[BookInfo] 执行 init 规则')
    try {
      const initResult = parseAndExecute(currentContent, rule.init, context)
      if (initResult && typeof initResult === 'string') {
        currentContent = initResult
        context.result = initResult
      }
    } catch (err) {
      console.warn('[BookInfo] init 规则执行失败:', err)
    }
  }

  // 3. 提取各字段
  const finalContext = { ...context, result: currentContent }

  const name = parseAndExecute(currentContent, rule.name || '', finalContext)
  const finalName = name ? String(name).trim() : ''

  const author = parseAndExecute(currentContent, rule.author || '', finalContext)
  const finalAuthor = author ? String(author).trim() : ''

  const coverUrl = parseAndExecute(currentContent, rule.coverUrl || '', finalContext)
  const finalCoverUrl = coverUrl ? resolveUrl(String(coverUrl), finalRedirectUrl) : null

  const intro = parseAndExecute(currentContent, rule.intro || '', finalContext)
  const finalIntro = intro ? cleanIntro(String(intro)) : null

  const kind = parseAndExecute(currentContent, rule.kind || '', finalContext)
  const finalKind = kind ? String(kind).trim() : null

  const lastChapter = parseAndExecute(currentContent, rule.lastChapter || '', finalContext)
  const finalLastChapter = lastChapter ? String(lastChapter).trim() : null

  const wordCount = parseAndExecute(currentContent, rule.wordCount || '', finalContext)
  const finalWordCount = wordCount ? String(wordCount).trim() : null

  let tocUrl = parseAndExecute(currentContent, rule.tocUrl || '', finalContext)
  const finalTocUrl = tocUrl ? resolveUrl(String(tocUrl), finalRedirectUrl) : bookUrl

  // 4. 构建 Book 对象
  return {
    id: bookUrl,
    sourceId: source.id,
    sourceName: source.name,
    name: finalName || '未命名',
    author: finalAuthor || '未知作者',
    coverUrl: finalCoverUrl,
    intro: finalIntro,
    kind: finalKind,
    lastChapter: finalLastChapter,
    bookUrl: bookUrl,
    tocUrl: finalTocUrl,
    content: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

