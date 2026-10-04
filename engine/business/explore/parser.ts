// ============================================
// 发现页书籍解析 — 纯函数 + 接口注入
// 所有环境能力（HTTP、JS 执行）通过参数注入，不依赖全局单例
// ============================================

import { getElements, getString, getStringList, resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource, ParseContext, JsRuntime } from '../../types.js'
import type { HttpClient } from '../../network/client.js'
import { parseSearchItem, parseInfoItem } from '../search/parser.js'
import { getExploreCategories } from './categories.js'
import type { ExploreKind } from './categories.js'
import type { RuleEvaluator } from '../book/info-parser.js'

export { getExploreCategories }
export type { ExploreKind }

const DEFAULT_TIMEOUT_MS = 30000

function createRuleEvaluator(): RuleEvaluator {
  return {
    getString: (content, rule, ctx) => getString(content, rule, ctx),
    getStringList: (content, rule, ctx) => getStringList(content, rule, ctx),
    getElements: (content, rule, ctx) => getElements(content, rule, ctx),
  }
}

function getRuleString(rule: Record<string, unknown> | null | undefined, key: string): string {
  if (!rule) return ''
  const val = rule[key]
  return typeof val === 'string' ? val : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 判断字符串是否是 Legado 的 {{...}} JS 模板。
 */
function isJsTemplate(str: string): boolean {
  const trimmed = str.trim()
  return trimmed.startsWith('{{') && trimmed.endsWith('}}')
}

/**
 * 剥离 {{...}} 外壳，返回内部 JS 代码。
 * 若不是 {{...}} 包裹，返回 null。
 */
function stripJsTemplate(str: string): string | null {
  const trimmed = str.trim()
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) return null
  return trimmed.substring(2, trimmed.length - 2)
}

/**
 * 执行 exploreUrl 顶层 JS。
 * 对齐 Legado：整个 exploreUrl 是 @js: / <js> / {{...}} 时，
 * 执行 JS 并解析返回值为分类列表。
 */
async function executeTopLevelExploreJs(
  source: EngineBookSource,
  jsCode: string,
  runtime: JsRuntime | null,
): Promise<ExploreKind[]> {
  if (!runtime) return []
  try {
    const ctx = {
      source,
      baseUrl: source.bookSourceUrl || '',
      result: '',
      book: {},
      key: '',
      page: 1,
    }
    const result = await runtime.execute(jsCode, ctx)
    if (!result) return []

    let parsed: unknown
    if (typeof result === 'string') {
      const trimmed = result.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try { parsed = JSON.parse(trimmed) } catch { return [] }
      } else {
        return []
      }
    } else {
      parsed = result
    }

    // 支持返回数组或 { categories: [...] } 对象
    let items: unknown[] | null = null
    if (Array.isArray(parsed)) {
      items = parsed
    } else if (isRecord(parsed)) {
      const arr = parsed.categories || parsed.data || parsed.list
      if (Array.isArray(arr)) items = arr
    }
    if (!items) return []

    const output: ExploreKind[] = []
    for (const item of items) {
      if (!isRecord(item)) continue
      const title = typeof item.title === 'string' ? item.title
        : typeof item.name === 'string' ? item.name
        : ''
      if (!title) continue

      const rawUrl = typeof item.url === 'string' ? item.url
        : typeof item.value === 'string' ? item.value
        : null
      const action = typeof item.action === 'string' ? item.action : null

      let type: ExploreKind['type']
      const rawType = item.type
      if (rawType === 'text' || rawType === 'button' || rawType === 'toggle' || rawType === 'select' || rawType === 'url') {
        type = rawType
      } else if (rawUrl === null || rawUrl === '') {
        type = 'text'
      } else if (isJsTemplate(rawUrl)) {
        type = 'button'
      } else {
        type = 'url'
      }

      let finalAction = action
      let finalUrl: string | null = rawUrl
      if (type === 'button' && finalUrl && isJsTemplate(finalUrl) && !finalAction) {
        finalAction = finalUrl
        finalUrl = null
      }

      output.push({
        title,
        url: finalUrl,
        type,
        action: finalAction,
        chars: Array.isArray(item.chars) ? item.chars.map(String) : null,
        default: typeof item.default === 'string' ? item.default : null,
        viewName: typeof item.viewName === 'string' ? item.viewName : null,
        style: isRecord(item.style) ? (item.style as ExploreKind['style']) : null,
      })
    }
    return output
  } catch {
    return []
  }
}

/**
 * 解析发现页分类。
 * 完整对齐 Legado 的 4 种形态：
 * 1. @js: / <js> → 执行 JS
 * 2. {{...}} → 执行 JS（新）
 * 3. 同步解析 JSON / `::` 文本
 */
export async function getExploreCategoriesAsync(
  source: EngineBookSource,
  runtime: JsRuntime | null,
): Promise<ExploreKind[]> {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []
  const trimmed = exploreUrl.trim()

  // 形态 1：@js: / <js>
  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    const jsCode = trimmed.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '')
    return executeTopLevelExploreJs(source, jsCode, runtime)
  }

  // 形态 2：{{...}}（新增）
  const innerJs = stripJsTemplate(trimmed)
  if (innerJs !== null) {
    return executeTopLevelExploreJs(source, innerJs, runtime)
  }

  // 形态 3：同步解析
  return getExploreCategories(source)
}

/**
 * 兼容旧接口：仅同步解析分类。
 */
export async function executeExploreJs(
  source: EngineBookSource,
  jsCode: string,
  runtime: JsRuntime | null,
): Promise<ExploreKind[]> {
  return executeTopLevelExploreJs(source, jsCode, runtime)
}

export async function getExploreBooks(
  source: EngineBookSource,
  categoryUrlOrHtml: string,
  page: number,
  httpClient: HttpClient,
  runtime: JsRuntime | null,
  isHtml = false,
): Promise<EngineBook[]> {
  if (!categoryUrlOrHtml) return []

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
      const headers = await parseSourceHeaderInline(source, runtime)
      const response = await httpClient.request({ url, method: 'GET', headers, timeout: DEFAULT_TIMEOUT_MS })
      if (response.status < 200 || response.status >= 300) return []
      html = response.data as string
      baseUrl = response.url || source.bookSourceUrl || ''
    } catch {
      return []
    }
  }

  const exploreRule = isRecord(source.ruleExplore) ? source.ruleExplore : null
  const searchRule = isRecord(source.ruleSearch) ? source.ruleSearch : null

  let rule: Record<string, unknown> | null = exploreRule
  if (!rule) {
    rule = searchRule
  }
  if (!rule) return []

  let listRule = getRuleString(rule, 'bookList')
  if (!listRule && exploreRule !== null && exploreRule !== searchRule) {
    return []
  }

  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const ctx: ParseContext = { source, baseUrl, page, book: {}, key: '' }
  const collections = await getElements(html, listRule, ctx)
  const evaluator = createRuleEvaluator()

  if (!Array.isArray(collections) || collections.length === 0) {
    if (!source.bookUrlPattern) {
      const book = await parseInfoItem(source, baseUrl, html, '', page, evaluator)
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
      '', page,
      evaluator,
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

async function parseSourceHeaderInline(
  source: EngineBookSource,
  runtime: JsRuntime | null,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (!source.header) return result
    if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
      if (!runtime) return result
      const headerResult = await runtime.execute(source.header, {
        source,
        baseUrl: source.bookSourceUrl || '',
        result: '',
        book: {},
      })
      try {
        const parsed = JSON.parse(headerResult) as Record<string, unknown>
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined) {
            result[key] = String(value)
          }
        }
      } catch {
        try {
          const parsed = JSON.parse(headerResult.replace(/'/g, '"')) as Record<string, unknown>
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined) {
              result[key] = String(value)
            }
          }
        } catch {
          // ignore
        }
      }
    } else {
      try {
        const parsed = JSON.parse(source.header) as Record<string, unknown>
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined) {
            result[key] = String(value)
          }
        }
      } catch {
        try {
          const parsed = JSON.parse((source.header || '{}').replace(/'/g, '"')) as Record<string, unknown>
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined) {
              result[key] = String(value)
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return result
}
