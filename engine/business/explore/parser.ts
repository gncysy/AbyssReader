// ============================================
// 发现页书籍解析 — 纯函数 + 可注入 HttpClient
// ============================================

import { getElements, resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource, ParseContext } from '../../types.js'
import type { HttpClient } from '../../network/client.js'
import { getGlobalHttpClient } from '../../network/client.js'
import { parseSearchItem, parseInfoItem } from '../search/parser.js'
import { getExploreCategories } from './categories.js'
import type { ExploreKind } from './categories.js'

export { getExploreCategories }
export type { ExploreKind }

function getRuleString(rule: Record<string, unknown> | null | undefined, key: string): string {
  if (!rule) return ''
  const val = rule[key]
  return typeof val === 'string' ? val : ''
}

export async function executeExploreJs(source: EngineBookSource, jsCode: string): Promise<ExploreKind[]> {
  try {
    const { getJsRuntime } = await import('../../parser/js-executor.js')
    const runtime = getJsRuntime()
    if (!runtime) return []

    const ctx = { source, baseUrl: source.bookSourceUrl || '', result: '', book: {}, key: '', page: 1 }
    const result = await runtime.execute(jsCode, ctx)
    if (!result) return []

    let parsed: unknown
    if (typeof result === 'string') {
      const trimmed = result.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { parsed = JSON.parse(trimmed) } catch { return [] }
      } else { return [] }
    } else { parsed = result }

    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object'
      )
      .map((item) => ({
        title: String(item.title || ''),
        url: typeof item.url === 'string' ? item.url : null,
        type: (item.type || 'url') as ExploreKind['type'],
        action: typeof item.action === 'string' ? item.action : null,
        chars: Array.isArray(item.chars) ? item.chars.map(String) : null,
        default: typeof item.default === 'string' ? item.default : null,
        viewName: typeof item.viewName === 'string' ? item.viewName : null,
        style: item.style && typeof item.style === 'object' ? { ...(item.style as Record<string, unknown>) } : null,
      }))
      .filter((k) => k.title)
  } catch { return [] }
}

export async function getExploreCategoriesAsync(source: EngineBookSource): Promise<ExploreKind[]> {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []
  const trimmed = exploreUrl.trim()
  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    const jsCode = trimmed.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '')
    return executeExploreJs(source, jsCode)
  }
  return getExploreCategories(source)
}

export async function getExploreBooks(
  source: EngineBookSource,
  categoryUrlOrHtml: string,
  page = 1,
  httpClient?: HttpClient,
  isHtml = false
): Promise<EngineBook[]> {
  if (!categoryUrlOrHtml) return []
  const client = httpClient || getGlobalHttpClient()

  let html: string
  let baseUrl: string

  if (isHtml) {
    html = categoryUrlOrHtml
    baseUrl = source.bookSourceUrl || ''
  } else {
    let url = categoryUrlOrHtml.replace(/\{\{page\}\}/g, String(page))
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = resolveUrl(url, source.bookSourceUrl)
    }

    try {
      const { parseSourceHeader } = await import('../source/helper.js')
      const headers = await parseSourceHeader(source)
      const response = await client.request({ url, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return []
      html = response.data as string
      baseUrl = response.url || source.bookSourceUrl || ''
    } catch {
      return []
    }
  }

  const exploreRule = source.ruleExplore as Record<string, unknown> | null
  const searchRule = source.ruleSearch as Record<string, unknown> | null

  // 修复：优先使用 exploreRule，仅当 exploreRule 不存在时才回退到 searchRule
  // 如果 exploreRule 存在但缺少 bookList，返回空数组并记录日志，而不是静默回退
  let rule: Record<string, unknown> | null = exploreRule
  if (!rule) {
    rule = searchRule
  }
  if (!rule) return []

  let listRule = getRuleString(rule, 'bookList')
  if (!listRule && exploreRule !== null && exploreRule !== searchRule) {
    // exploreRule 存在但缺少 bookList，这是配置错误，不应回退
    return []
  }

  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const ctx: ParseContext = { source, baseUrl, page, book: {}, key: '' }
  const collections = await getElements(html, listRule, ctx)

  if (!Array.isArray(collections) || collections.length === 0) {
    if (!source.bookUrlPattern) {
      const book = await parseInfoItem(source, baseUrl, html, '', page)
      return book ? [book] : []
    }
    return []
  }

  const books: EngineBook[] = []
  for (const item of collections) {
    const book = await parseSearchItem(
      item, source, baseUrl,
      getRuleString(rule, 'name'),
      getRuleString(rule, 'author'),
      getRuleString(rule, 'kind'),
      getRuleString(rule, 'coverUrl'),
      getRuleString(rule, 'wordCount'),
      getRuleString(rule, 'intro'),
      getRuleString(rule, 'lastChapter'),
      getRuleString(rule, 'bookUrl'),
      '', page
    )
    if (book) books.push(book)
  }

  const seen = new Set<string>()
  const uniqueBooks: EngineBook[] = []
  for (const book of books) {
    const key = `${book.name}|${book.author}`
    if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
  }
  if (reverse) uniqueBooks.reverse()
  return uniqueBooks
}
