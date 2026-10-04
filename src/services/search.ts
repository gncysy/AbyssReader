// ============================================
// 搜索服务 — 对齐 Legado 搜索解析
// ============================================

import { parseSearchItem, parseInfoItem, matchesBookUrlPattern } from '@engine/business/search/parser.js'
import { analyzeUrl } from '@engine/url/index.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { getElements, getString, getStringList } from '@engine/parser/index.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
import { logError } from '@engine/log/index.js'
import { handleError } from '@/utils/error-handler.js'
import { shouldExecuteInDeno, evaluateRule } from './rule-evaluator.js'
import { fetchWithWebviewFallback } from './fetch.js'
import type { Book, BookSource } from '@/types'
import type { EngineBook, EngineBookSource, ParseContext } from '@engine/types.js'
import type { RuleEvaluator } from '@engine/business/book/index.js'
import { NETWORK } from '@/constants/index.js'

interface SearchOptions {
  page?: number | undefined
  signal?: AbortSignal | undefined
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null | undefined
  shouldBreak?: ((size: number) => boolean) | null | undefined
}

export interface BatchSearchOptions {
  page?: number
  signal?: AbortSignal
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function toBook(engineBook: EngineBook): Book {
  return engineBook as unknown as Book
}

function createRuleEvaluator(): RuleEvaluator {
  return {
    getString: (content, rule, ctx) => getString(content, rule, ctx),
    getStringList: (content, rule, ctx) => getStringList(content, rule, ctx),
    getElements: (content, rule, ctx) => getElements(content, rule, ctx),
  }
}

export async function search(
  source: BookSource,
  keyword: string,
  options: SearchOptions = {},
): Promise<Book[]> {
  const page = options.page || 1
  const searchUrl = source.searchUrl || ''
  if (!searchUrl) {
    logError('search', 'frontend', '[搜索] searchUrl 为空')
    return []
  }

  const engineSource = toEngineBookSource(source)
  const runtime = getJsRuntime()
  const headerMap = await parseSourceHeader(engineSource, runtime)
  const urlAnalysis = await analyzeUrl(searchUrl, {
    key: keyword, page, source: engineSource, baseUrl: source.bookSourceUrl || '', headerMap,
  })

  try {
    const html = await fetchWithWebviewFallback(urlAnalysis.url, {
      method: urlAnalysis.method,
      headers: urlAnalysis.headers,
      body: urlAnalysis.body,
      source,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })

    if (!html) return []

    const baseUrl = source.bookSourceUrl || ''
    const rule = source.ruleSearch
    if (!rule || !rule.bookList) return []

    const ctx: ParseContext = { source: engineSource, baseUrl, key: keyword, page, book: {} }
    const evaluator = createRuleEvaluator()

    if (source.bookUrlPattern && matchesBookUrlPattern(urlAnalysis.url, source.bookUrlPattern)) {
      const book = await parseInfoItem(engineSource, baseUrl, html, keyword, page, evaluator)
      return book ? [toBook(book)] : []
    }

    let listRule = rule.bookList || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    let collections: unknown[]
    if (shouldExecuteInDeno(listRule)) {
      const result = await evaluateRule(listRule, html, ctx)
      collections = Array.isArray(result) ? result : []
    } else {
      collections = await getElements(html, listRule, ctx)
    }

    if (!Array.isArray(collections) || collections.length === 0) {
      if (!source.bookUrlPattern) {
        const book = await parseInfoItem(engineSource, baseUrl, html, keyword, page, evaluator)
        return book ? [toBook(book)] : []
      }
      return []
    }

    const books: Book[] = []
    for (const item of collections) {
      if (options.signal?.aborted) break

      const engineBook = await parseSearchItem(
        item, engineSource, baseUrl,
        rule.name || '',
        rule.author || '',
        rule.kind || '',
        rule.coverUrl || '',
        rule.wordCount || '',
        rule.intro || '',
        rule.lastChapter || '',
        rule.bookUrl || '',
        keyword,
        page,
        evaluator,
        options.filter ?? null
      )

      if (engineBook) {
        books.push(toBook(engineBook))
      }
    }

    const seen = new Set<string>()
    const uniqueBooks: Book[] = []
    for (const book of books) {
      const key = `${book.name}|${book.author}`
      if (!seen.has(key)) { seen.add(key); uniqueBooks.push(book) }
    }
    if (reverse) uniqueBooks.reverse()
    return uniqueBooks
  } catch (err) {
    handleError(err, {
      module: 'search',
      operation: 'search',
      sourceUrl: source.bookSourceUrl,
      userMessage: '搜索失败，请检查书源或网络',
    })
    return []
  }
}

export async function batchSearch(
  sources: BookSource[],
  keyword: string,
  options: BatchSearchOptions = {},
): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>()
  const concurrency = options.concurrency || NETWORK.CONCURRENCY
  const queue = [...sources]
  const total = sources.length
  let done = 0

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const source = queue.shift()
      if (!source) break
      const key = `${source.bookSourceName || source.bookSourceUrl || 'unknown'}::${source.bookSourceUrl || ''}`
      try {
        const searchOptions: SearchOptions = {}
        if (options.signal !== undefined) searchOptions.signal = options.signal
        if (options.page !== undefined) searchOptions.page = options.page
        results.set(key, await search(source, keyword, searchOptions))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('search', 'frontend', `[批量搜索] ${source.bookSourceName || source.bookSourceUrl || ''} 失败: ${msg}`)
        results.set(key, [])
      }
      done++
      if (options.onProgress) {
        try { options.onProgress(done, total) } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          logError('search', 'frontend', `[批量搜索] 进度回调异常: ${msg}`)
        }
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) workers.push(worker())
  await Promise.all(workers)
  return results
}
