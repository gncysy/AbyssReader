import { parseAndExecute } from './rule-parser/index.js'
import { getGlobalHttpClient } from './network/index.js'
import { buildUrl, buildHeaders, resolveUrl, cleanIntro } from './utils/url.js'
import { processVariables, executeInitRule, variableStore } from './rule-parser/variable.js'
import type { BookSource, Book, ExploreRule } from '../shared/types.js'

export interface ExploreOptions {
  page?: number
  timeout?: number
}

/**
 * 执行 JS 代码（用于 exploreUrl 中的 @js: 和 <js>）
 */
function evalJs(code: string, context: any): any {
  try {
    // 使用 Function 构造器执行（安全沙箱）
    const fn = new Function(
      'source',
      'baseUrl',
      'page',
      'key',
      'result',
      'java',
      `"use strict"; return (${code})`
    )
    return fn(
      context.source,
      context.baseUrl,
      context.page || 1,
      context.key || '',
      context.result || null,
      context.java || null
    )
  } catch (e: any) {
    console.error('[Explore] JS 执行失败:', e.message)
    return null
  }
}

/**
 * 处理 exploreUrl（支持 <js>、@js:、{{page}}）
 */
function processExploreUrl(exploreUrl: string, options: ExploreOptions, context: any): string {
  if (!exploreUrl) return ''

  let processed = exploreUrl

  // 1. 处理 <js> 标签
  const jsTagMatch = processed.match(/<js>([\s\S]*?)<\/js>/)
  if (jsTagMatch) {
    const code = jsTagMatch[1].trim()
    try {
      const result = evalJs(code, context)
      if (result && typeof result === 'string') {
        processed = processed.replace(/<js>[\s\S]*?<\/js>/, result)
      }
    } catch (e) {
      console.error('[Explore] <js> 执行失败:', e)
    }
  }

  // 2. 处理 @js: 前缀
  if (processed.startsWith('@js:')) {
    const code = processed.substring(4).trim()
    try {
      const result = evalJs(code, context)
      if (result && typeof result === 'string') {
        processed = result
      }
    } catch (e) {
      console.error('[Explore] @js: 执行失败:', e)
    }
  }

  // 3. 替换 {{page}}
  const page = options.page || 1
  processed = processed.replace(/\{\{page\}\}/g, String(page))

  // 4. 替换 {{key}}
  processed = processed.replace(/\{\{key\}\}/g, '')

  return processed
}

/**
 * 解析分类 URL（支持 JSON 数组、换行分隔、JS 动态生成）
 */
export function parseExploreCategories(
  exploreUrl: string,
  source: BookSource,
  options: ExploreOptions = {}
): Array<{ title: string; url: string }> {
  if (!exploreUrl) return []

  const context = {
    source,
    baseUrl: source.url,
    page: options.page || 1,
    key: '',
    result: null,
    java: null,
  }

  // 处理 JS 动态生成
  const processed = processExploreUrl(exploreUrl, options, context)

  // 解析 JSON 数组
  if (processed.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(processed)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item.title && item.url)
          .map((item: any) => ({
            title: String(item.title),
            url: String(item.url),
          }))
      }
    } catch (e) {
      console.warn('[Explore] JSON 解析失败:', e)
    }
  }

  // 解析换行分隔
  if (processed.includes('\n')) {
    const lines = processed.split('\n')
      .filter(line => line.trim() && line.includes('::'))
      .map(line => {
        const parts = line.split('::')
        return {
          title: parts[0].trim(),
          url: parts.slice(1).join('::').trim(),
        }
      })
      .filter(item => item.url)
    if (lines.length > 0) return lines
  }

  // 如果是单个 URL，返回默认分类
  if (processed.startsWith('http://') || processed.startsWith('https://')) {
    return [{ title: '全部', url: processed }]
  }

  return []
}

/**
 * 发现 - 获取书籍列表
 */
export async function explore(
  source: BookSource,
  exploreUrl: string,
  options: ExploreOptions = {}
): Promise<Book[]> {
  const page = options.page || 1
  const timeout = options.timeout || 30000

  // 如果书源没有启用发现，返回空
  if (source.enabledExplore === false) {
    return []
  }

  // 处理 exploreUrl
  const context = {
    source,
    baseUrl: source.url,
    page,
    key: '',
    result: null,
    java: null,
  }

  const processedUrl = processExploreUrl(exploreUrl, options, context)

  // 如果是 JS 生成的 JSON，直接解析
  if (processedUrl.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(processedUrl)
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: `explore_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sourceId: source.id,
          sourceName: source.name,
          name: item.title || item.name || '未命名',
          author: item.author || '未知作者',
          coverUrl: item.coverUrl || null,
          intro: item.intro || null,
          kind: item.kind || null,
          lastChapter: item.lastChapter || null,
          bookUrl: item.url || item.bookUrl || '',
          tocUrl: item.tocUrl || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      }
    } catch (e) {
      console.warn('[Explore] JSON 解析失败:', e)
    }
  }

  // 构建请求 URL
  const finalUrl = buildUrl(processedUrl, source.url, { page: String(page) })

  const httpClient = getGlobalHttpClient()
  const headers = source.header ? buildHeaders(source, {}) : {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }

  try {
    const response = await httpClient.request({
      url: finalUrl,
      method: 'GET',
      headers,
      timeout,
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    const rule = source.ruleExplore
    if (!rule || !rule.bookList) {
      return []
    }

    const html = response.data
    const parseContext = {
      source,
      baseUrl: source.url,
      page,
      key: '',
      json: null,
    }

    // 检查是否为 JSON 响应
    let listResult: any = null
    const contentType = response.headers['content-type'] || ''
    if (contentType.includes('application/json')) {
      try {
        const json = typeof html === 'string' ? JSON.parse(html) : html
        const list = json.data || json.list || json.books || json.items || json
        if (Array.isArray(list)) {
          listResult = list
        } else {
          listResult = parseAndExecute(json, rule.bookList, { ...parseContext, json })
        }
      } catch (e) {
        // 不是 JSON，继续 HTML 解析
      }
    }

    if (!listResult) {
      listResult = parseAndExecute(html, rule.bookList, parseContext)
    }

    if (!listResult || !Array.isArray(listResult)) {
      return []
    }

    const books: Book[] = []
    for (const item of listResult) {
      const book = parseExploreItem(item, source, rule)
      if (book) {
        books.push(book)
      }
    }

    return books
  } catch (error: any) {
    throw new Error(`发现失败 (${source.name}): ${error.message}`)
  }
}

/**
 * 解析单个发现项
 */
function parseExploreItem(item: any, source: BookSource, rule: ExploreRule): Book | null {
  try {
    const context = { source, baseUrl: source.url, item }

    const name = parseAndExecute(item, rule.name || '', context)
    if (!name) return null

    const bookUrl = parseAndExecute(item, rule.bookUrl || '', context)
    if (!bookUrl) return null

    const author = parseAndExecute(item, rule.author || '', context) || '未知作者'
    const coverUrl = parseAndExecute(item, rule.coverUrl || '', context)
    const intro = parseAndExecute(item, rule.intro || '', context)
    const kind = parseAndExecute(item, rule.kind || '', context)
    const lastChapter = parseAndExecute(item, rule.lastChapter || '', context)

    const resolvedBookUrl = resolveUrl(String(bookUrl), source.url)

    return {
      id: resolvedBookUrl || `explore_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: intro ? cleanIntro(String(intro)) : null,
      kind: kind ? String(kind).trim() : null,
      lastChapter: lastChapter ? String(lastChapter).trim() : null,
      bookUrl: resolvedBookUrl,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return null
  }
}

