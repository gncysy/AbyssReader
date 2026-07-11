import { parseAndExecute } from './rule-parser/index.js'
import { createHttpClientForSource } from './network/index.js'
import {
  parseRequestConfig,
  buildUrl,
  buildHeaders,
  resolveUrl,
  cleanIntro,
  isJsonResponse,
  safeParseJson
} from './utils/url.js'
import { isJsSource, executeJsSearch } from './utils/js-source.js'
import type { Book, BookSource } from '../shared/types.js'

export interface SearchOptions {
  page?: number
  timeout?: number
}

export async function search(
  source: BookSource,
  keyword: string,
  options: SearchOptions = {}
): Promise<Book[]> {
  const page = options.page || 1

  // ===== JS书源支持 =====
  if (isJsSource(source)) {
    try {
      const result = await executeJsSearch(source, keyword, page)
      if (result && Array.isArray(result)) {
        return result.map((item: any) => ({
          id: item.id || item.bookUrl || `js_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sourceId: source.id,
          sourceName: source.name,
          name: item.name || '未命名',
          author: item.author || '未知作者',
          coverUrl: item.coverUrl || null,
          intro: item.intro || null,
          kind: item.kind || null,
          lastChapter: item.lastChapter || null,
          bookUrl: item.bookUrl || item.url || '',
          tocUrl: item.tocUrl || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      }
      return []
    } catch (error: any) {
      console.error('[Search] JS书源搜索失败:', error.message)
      return []
    }
  }

  // ===== 规则书源 =====
  const httpClient = createHttpClientForSource(source.id)

  // 限流：每个书源独立
  const rateLimitMap = new Map<string, { lastRequest: number }>();
  
  function getRateLimiter(sourceId: string) {
    if (!rateLimitMap.has(sourceId)) {
      rateLimitMap.set(sourceId, { lastRequest: 0 });
    }
    return rateLimitMap.get(sourceId)!;
  }
  
  async function rateLimitedRequest(url: string, options: any) {
    const rate = source.concurrentRate || 0;
    const limiter = getRateLimiter(source.id);
    const now = Date.now();
    const waitTime = Math.max(0, rate - (now - limiter.lastRequest));
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    limiter.lastRequest = Date.now();
    return await httpClient.request({ url, ...options });
  }

  let searchUrl = source.searchUrl || ''
  if (!searchUrl) {
    return []
  }

  // 替换变量
  searchUrl = searchUrl
    .replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
    .replace(/\{\{page\}\}/g, String(page))

  const config = parseRequestConfig(searchUrl)
  const finalUrl = buildUrl(config.url, source.url, { key: keyword, page: String(page) })
  const headers = buildHeaders(source, config.headers)

  try {
    const response = await rateLimitedRequest(finalUrl, {
      method: config.method,
      headers,
      body: config.body,
      charset: config.charset || 'utf-8',
      timeout: options.timeout || 30000,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    const rule = source.ruleSearch
    if (!rule || !rule.bookList) {
      return []
    }

    let html = response.data
    let listResult: any = null

    // ===== 检查 Content-Type =====
    if (isJsonResponse(response.headers)) {
      const json = safeParseJson(html)
      if (json) {
        const list = json.data || json.list || json.books || json.items || json
        if (Array.isArray(list)) {
          listResult = list
        } else {
          const context = { source, baseUrl: source.url, key: keyword, page: page, json }
          listResult = parseAndExecute(json, rule.bookList, context)
        }
      }
    }

    if (listResult === null) {
      const context = { source, baseUrl: source.url, key: keyword, page: page }
      listResult = parseAndExecute(html, rule.bookList, context)
    }

    if (!listResult || !Array.isArray(listResult)) {
      return []
    }

    const books: Book[] = []
    for (const item of listResult) {
      const book = parseBookItem(item, source, rule)
      if (book) {
        books.push(book)
      }
    }

    return books
  } catch (error: any) {
    const errorMessage = error.response?.status
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.code === 'ECONNABORTED'
      ? '请求超时，请检查网络'
      : error.message || '未知错误'
    throw new Error(`搜索失败 (${source.name}): ${errorMessage}`)
  }
}

function parseBookItem(item: any, source: BookSource, rule: any): Book | null {
  try {
    const context = { source, baseUrl: source.url }

    const name = parseAndExecute(item, rule.name || '', context)
    if (!name) return null

    const author = parseAndExecute(item, rule.author || '', context) || '未知作者'
    const coverUrl = parseAndExecute(item, rule.coverUrl || rule.cover || '', context)
    const intro = parseAndExecute(item, rule.intro || '', context)
    const bookUrl = parseAndExecute(item, rule.bookUrl || '', context)
    const lastChapter = parseAndExecute(item, rule.lastChapter || '', context)
    const kind = parseAndExecute(item, rule.kind || '', context)

    // 应用 replaceRegex 链式替换
    let finalName = String(name).trim()
    let finalAuthor = String(author).trim()
    let finalIntro = intro ? String(intro).trim() : null
    let finalKind = kind ? String(kind).trim() : null
    let finalLastChapter = lastChapter ? String(lastChapter).trim() : null

    if (rule.replaceRegex) {
      const cleanRules = rule.replaceRegex.split('##')
      for (let i = 0; i < cleanRules.length; i += 2) {
        if (cleanRules[i + 1] !== undefined) {
          try {
            const regex = new RegExp(cleanRules[i], 'g')
            finalName = finalName.replace(regex, cleanRules[i + 1])
            finalAuthor = finalAuthor.replace(regex, cleanRules[i + 1])
            if (finalIntro) finalIntro = finalIntro.replace(regex, cleanRules[i + 1])
            if (finalKind) finalKind = finalKind.replace(regex, cleanRules[i + 1])
            if (finalLastChapter) finalLastChapter = finalLastChapter.replace(regex, cleanRules[i + 1])
          } catch {}
        }
      }
    }

    // 处理 bookUrl
    let resolvedBookUrl = bookUrl || ''
    if (!resolvedBookUrl) {
      if (item.source_id) {
        resolvedBookUrl = item.source_id
      } else if (item.id) {
        resolvedBookUrl = item.id
      } else {
        const nameSlug = String(name).trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
        resolvedBookUrl = `book_${Date.now()}_${nameSlug}`
      }
    }
    resolvedBookUrl = resolveUrl(resolvedBookUrl, source.url)

    return {
      id: resolvedBookUrl || `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
      name: finalName,
      author: finalAuthor,
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: finalIntro ? cleanIntro(finalIntro) : null,
      kind: finalKind,
      lastChapter: finalLastChapter,
      bookUrl: resolvedBookUrl,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return null
  }
}

export async function batchSearch(
  sources: BookSource[],
  keyword: string,
  options: SearchOptions = {}
): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = 5
  const queue = [...sources]
  const promises: Promise<void>[] = []

  const worker = async () => {
    while (queue.length > 0) {
      const source = queue.shift()
      if (!source) break
      try {
        const books = await search(source, keyword, options)
        results.set(source.id, books)
      } catch (error) {
        console.error(`[Search] ${source.name} 搜索失败:`, error)
        results.set(source.id, [])
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, sources.length); i++) {
    promises.push(worker())
  }

  await Promise.all(promises)
  return results
}
