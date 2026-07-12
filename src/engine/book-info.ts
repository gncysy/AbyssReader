import { parseAndExecute } from './rule-parser/index.js'
import { createHttpClientForSource } from './network/index.js'
import {
  resolveUrl,
  cleanIntro,
  buildHeaders,
  isJsonResponse,
  safeParseJson,
} from './utils/url.js'
import { isJsSource, executeJsBookInfo } from './utils/js-source.js'
import type { Book, BookSource } from '../shared/types.js'

export async function getBookInfo(source: BookSource, bookUrl: string): Promise<Book | null> {
  if (isJsSource(source)) {
    try {
      const result = await executeJsBookInfo(source, bookUrl)
      if (result) {
        return {
          id: result.id || bookUrl || `js_${Date.now()}`,
          sourceId: source.id,
          sourceName: source.name,
          name: result.name || '未命名',
          author: result.author || '未知作者',
          coverUrl: result.coverUrl || null,
          intro: result.intro || null,
          kind: result.kind || null,
          lastChapter: result.lastChapter || null,
          bookUrl: result.bookUrl || bookUrl,
          tocUrl: result.tocUrl || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
      return null
    } catch (error: any) {
      console.error('[BookInfo] JS书源获取详情失败:', error.message)
      return null
    }
  }

  const httpClient = createHttpClientForSource(source.id)

  const rule = source.ruleBookInfo
  if (!rule) {
    return null
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }

    if (source.header) {
      try {
        const h = typeof source.header === 'string' ? JSON.parse(source.header) : source.header
        Object.assign(headers, h)
      } catch {}
    }

    const response = await httpClient.request({
      url: bookUrl,
      method: 'GET',
      headers,
      timeout: 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = response.data
    const context = { source, baseUrl: source.url, bookUrl, java: require("./platform/java-bridge.js").buildJavaAPI() }

    // ===== 检查 Content-Type =====
    if (isJsonResponse(response.headers)) {
      const json = safeParseJson(html)
      if (json) {
        const bookData = json.data || json.book || json
        const name = bookData.name || bookData.title || bookData.bookName
        if (name) {
          return {
            id: bookUrl || `json_${Date.now()}`,
            sourceId: source.id,
            sourceName: source.name,
            name: String(name).trim(),
            author: String(bookData.author || bookData.writer || '未知作者').trim(),
            coverUrl: bookData.coverUrl || bookData.cover || bookData.img || null,
            intro: bookData.intro || bookData.description || null,
            kind: bookData.kind || bookData.category || null,
            lastChapter: bookData.lastChapter || bookData.latestChapter || null,
            bookUrl: bookUrl,
            tocUrl: bookData.tocUrl || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }
        // 否则用规则解析JSON
        const parsedName = parseAndExecute(json, rule.name || '', { source, baseUrl: source.url, bookUrl, json })
        if (!parsedName) return null
        const parsedAuthor = parseAndExecute(json, rule.author || '', { source, baseUrl: source.url, bookUrl, json }) || '未知作者'
        const parsedCoverUrl = parseAndExecute(json, rule.coverUrl || '', { source, baseUrl: source.url, bookUrl, json })
        const parsedIntro = parseAndExecute(json, rule.intro || '', { source, baseUrl: source.url, bookUrl, json })
        const parsedKind = parseAndExecute(json, rule.kind || '', { source, baseUrl: source.url, bookUrl, json })
        const parsedLastChapter = parseAndExecute(json, rule.lastChapter || '', { source, baseUrl: source.url, bookUrl, json })
        const parsedTocUrl = parseAndExecute(json, rule.tocUrl || '', { source, baseUrl: source.url, bookUrl, json })
        return {
          id: bookUrl,
          sourceId: source.id,
          sourceName: source.name,
          name: String(parsedName).trim(),
          author: String(parsedAuthor).trim(),
          coverUrl: parsedCoverUrl ? resolveUrl(String(parsedCoverUrl), source.url) : null,
          intro: parsedIntro ? cleanIntro(String(parsedIntro)) : null,
          kind: parsedKind ? String(parsedKind).trim() : null,
          lastChapter: parsedLastChapter ? String(parsedLastChapter).trim() : null,
          bookUrl: bookUrl,
          tocUrl: parsedTocUrl ? resolveUrl(String(parsedTocUrl), source.url) : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    }

    // ===== HTML 解析 =====
    const name = parseAndExecute(html, rule.name || '', context)
    if (!name) return null

    const author = parseAndExecute(html, rule.author || '', context) || '未知作者'
    const coverUrl = parseAndExecute(html, rule.coverUrl || '', context)
    const intro = parseAndExecute(html, rule.intro || '', context)
    const kind = parseAndExecute(html, rule.kind || '', context)
    const lastChapter = parseAndExecute(html, rule.lastChapter || '', context)
    const tocUrl = parseAndExecute(html, rule.tocUrl || '', context)

    return {
      id: bookUrl,
      sourceId: source.id,
      sourceName: source.name,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: intro ? cleanIntro(String(intro)) : null,
      kind: kind ? String(kind).trim() : null,
      lastChapter: lastChapter ? String(lastChapter).trim() : null,
      bookUrl: bookUrl,
      tocUrl: tocUrl ? resolveUrl(String(tocUrl), source.url) : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error: any) {
    throw new Error(`获取书籍详情失败 (${source.name}): ${error.message}`)
  }
}
