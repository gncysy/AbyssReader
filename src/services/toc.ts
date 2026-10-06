// ============================================
// 目录服务 — 对齐 Legado BookChapterList + WebBook
// ============================================

import { parseTocPage, parseTocJson, dedupChapters } from '@engine/business/book/index.js'
import type { RuleEvaluator } from '@engine/business/book/index.js'
import { analyzeUrl } from '@engine/url/index.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { getString, getStringList, getElements } from '@engine/parser/index.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
import { cache as cacheService } from './cache.js'
import { fetchWithWebviewFallback } from './fetch.js'
import { logInfo, logError } from '@engine/log/index.js'
import { handleError } from '@/utils/error-handler.js'
import { engine } from './engine.js'
import { shouldExecuteInDeno, evaluateRule } from './rule-evaluator.js'
import type { Book, BookSource, Chapter } from '@/types'
import type { EngineBookSource, EngineChapter } from '@engine/types.js'
import { NETWORK, READER } from '@/constants/index.js'

const MAX_CONCURRENT_PAGES = 5
const PAGE_RETRY_COUNT = 1

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function toChapter(ch: EngineChapter): Chapter {
  return ch as unknown as Chapter
}

function normalizeChapter(raw: unknown, idx: number, _redirectUrl: string): Chapter | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const rawTitle = obj.title ?? obj.name ?? obj.chapterName ?? ''
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle || '').trim()
  if (!title) return null

  const rawUrl = obj.url ?? obj.href ?? ''
  const urlStr = typeof rawUrl === 'string' ? rawUrl.trim() : String(rawUrl || '').trim()

  const rawIndex = obj.index ?? obj.id ?? idx
  void (typeof rawIndex === 'number' ? rawIndex : parseInt(String(rawIndex), 10))

  const isVip = !!(obj.isVip ?? obj.is_vip ?? false)
  const isPay = !!(obj.isPay ?? obj.is_pay ?? false)

  return {
    id: idx,
    title,
    url: urlStr,
    index: idx,
    isVip,
    isPay,
  }
}

function normalizeChapterList(response: unknown, redirectUrl: string): Chapter[] {
  let arr: unknown[] = []

  if (Array.isArray(response)) {
    arr = response
  } else if (typeof response === 'string') {
    const trimmed = response.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) arr = parsed
      } catch {
        // ignore
      }
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        arr = [parsed]
      } catch {
        try {
          const parsed = JSON.parse('[' + trimmed + ']') as unknown
          if (Array.isArray(parsed)) arr = parsed
        } catch {
          // ignore
        }
      }
    }
  } else if (response !== null && response !== undefined && typeof response === 'object') {
    arr = [response]
  }

  const result: Chapter[] = []
  for (let i = 0; i < arr.length; i++) {
    const ch = normalizeChapter(arr[i], i, redirectUrl)
    if (ch) result.push(ch)
  }
  return result
}

function createRuleEvaluator(): RuleEvaluator {
  return {
    getString: (content, rule, ctx) => getString(content, rule, ctx),
    getStringList: (content, rule, ctx) => getStringList(content, rule, ctx),
    getElements: (content, rule, ctx) => getElements(content, rule, ctx),
  }
}

export async function loadTocFromCache(source: BookSource, book?: Book): Promise<Chapter[] | null> {
  if (!book) return null
  try {
    const raw = await cacheService.getToc(getTocCacheKey(source, book))
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Chapter[]
    }
  } catch {
    // ignore
  }
  return null
}

export async function saveTocToCache(source: BookSource, book: Book, chs: Chapter[]): Promise<void> {
  try { await cacheService.putToc(getTocCacheKey(source, book), JSON.stringify(chs)) } catch {
    // ignore
  }
}

export function getTocCacheKey(source: BookSource, book: Book): string {
  return 'toc__' + (source.bookSourceUrl || '') + '__' + (book.tocUrl || book.bookUrl || '')
}

async function runPreUpdateJs(source: BookSource, book: Book): Promise<void> {
  const preUpdateJs = source.ruleToc?.preUpdateJs
  if (!preUpdateJs || !preUpdateJs.trim()) return

  try {
    logInfo('engine', 'frontend', '[目录] 执行 preUpdateJs')
    await engine.executeJs(preUpdateJs, {
      source,
      baseUrl: source.bookSourceUrl || '',
      book: book || {},
      result: '',
    })
    logInfo('engine', 'frontend', '[目录] preUpdateJs 执行完成')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('engine', 'frontend', `[目录] preUpdateJs 执行失败: ${msg}`)
  }
}

async function executeHeaderRule(source: BookSource): Promise<Record<string, string>> {
  const runtime = getJsRuntime()
  const headers = await parseSourceHeader(toEngineBookSource(source), runtime)
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 15; V2304A Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36'
  }
  return headers
}

interface FetchPageResult {
  html: string
  redirectUrl: string
}

async function fetchPageOnce(
  url: string,
  headers: Record<string, string>,
  source: BookSource,
  book: Book,
  method: 'GET' | 'POST' = 'GET',
  body: string | null = null,
): Promise<FetchPageResult | null> {
  try {
    const needsAnalyze = url.includes('@js:') || url.includes('<js>') || url.includes('{{') || url.includes(',{')
    if (needsAnalyze) {
      const analysis = await analyzeUrl(url, {
        source: toEngineBookSource(source),
        book: (book || {}) as unknown as Record<string, unknown>,
        baseUrl: source.bookSourceUrl || '',
        headerMap: headers,
      })
      let bodyStr: string | null = null
      if (analysis.method === 'POST' && analysis.body) bodyStr = typeof analysis.body === 'string' ? analysis.body : JSON.stringify(analysis.body)
      const html = await fetchWithWebviewFallback(analysis.url, {
        method: analysis.method,
        headers: analysis.headers,
        body: bodyStr,
        source,
        timeout: NETWORK.DEFAULT_TIMEOUT,
      })
      if (!html) return null
      return { html, redirectUrl: analysis.url }
    }

    const html = await fetchWithWebviewFallback(url, {
      method,
      headers,
      body,
      source,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })
    if (!html) return null
    return { html, redirectUrl: url }
  } catch {
    return null
  }
}

async function fetchPage(
  url: string,
  headers: Record<string, string>,
  source: BookSource,
  book: Book,
  method: 'GET' | 'POST' = 'GET',
  body: string | null = null,
): Promise<FetchPageResult | null> {
  let lastResult: FetchPageResult | null = null
  for (let attempt = 0; attempt <= PAGE_RETRY_COUNT; attempt++) {
    const result = await fetchPageOnce(url, headers, source, book, method, body)
    if (result) return result
    lastResult = result
    if (attempt < PAGE_RETRY_COUNT) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return lastResult
}

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = []
  const queue = [...items]

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      results.push(await fn(item))
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

/**
 * 只走网络抓取目录，不查缓存。
 *
 * SWR 模式下的 revalidate 路径。
 * 拉取完成后会自动写缓存。
 */
export async function fetchTocFromNetwork(
  source: BookSource, tocUrl: string, book?: Book,
): Promise<Chapter[]> {
  if (!tocUrl) {
    logError('engine', 'frontend', '[目录] tocUrl 为空')
    return []
  }
  const tocRule = source.ruleToc
  if (!tocRule || !tocRule.chapterList) {
    logError('engine', 'frontend', '[目录] 书源缺少目录规则')
    return []
  }

  if (book) {
    await runPreUpdateJs(source, book)
  }

  logInfo('engine', 'frontend', `[目录] 网络拉取 url=${tocUrl.substring(0, 100)}`)

  const headers = await executeHeaderRule(source)
  const bookData = book || { name: '', author: '', bookUrl: tocUrl }
  const evaluator = createRuleEvaluator()

  let listRule = tocRule.chapterList || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const chapterList: Chapter[] = []
  const nextUrlList = new Set<string>()

  try {
    const result = await fetchPage(tocUrl, headers, source, bookData)
    if (!result) return []
    const { html, redirectUrl } = result

    let pageChapters: Chapter[] = []
    let nextUrls: string[] = []

    const engineSource = toEngineBookSource(source)
    const tocRuleObj = tocRule as unknown as Record<string, unknown>

    if (shouldExecuteInDeno(listRule)) {
      const response = await evaluateRule(listRule, html, {
        source: engineSource,
        baseUrl: source.bookSourceUrl,
        book: bookData,
        redirectUrl,
      }, { forceDeno: true })
      pageChapters = normalizeChapterList(response, redirectUrl)
    } else {
      const parsed = await parseTocPage(
        bookData as unknown as Record<string, unknown>,
        tocUrl, redirectUrl, html, tocRuleObj, listRule, engineSource, true, evaluator
      )
      pageChapters = parsed.chapters.map(toChapter)
      nextUrls = parsed.nextUrls
    }

    if (reverse && pageChapters.length > 0) {
      pageChapters.reverse()
    }

    chapterList.push(...pageChapters)
    nextUrlList.add(redirectUrl)

    const uniqueNextUrls: string[] = []
    for (const u of nextUrls) {
      if (u && !nextUrlList.has(u)) {
        nextUrlList.add(u)
        uniqueNextUrls.push(u)
      }
    }

    if (uniqueNextUrls.length > 0) {
      const localPageSet = new Set<string>()
      const pageResults = await concurrentMap(
        uniqueNextUrls.slice(0, READER.MAX_TOC_PAGES),
        async (nextUrl) => {
          if (localPageSet.has(nextUrl)) return [] as Chapter[]
          localPageSet.add(nextUrl)
          const nextResult = await fetchPage(nextUrl, headers, source, bookData)
          if (!nextResult) return [] as Chapter[]
          if (shouldExecuteInDeno(listRule)) {
            const response = await evaluateRule(listRule, nextResult.html, {
              source: engineSource,
              baseUrl: source.bookSourceUrl,
              book: bookData,
              redirectUrl: nextResult.redirectUrl,
            }, { forceDeno: true })
            return normalizeChapterList(response, nextResult.redirectUrl)
          }
          const { chapters: np } = await parseTocPage(
            bookData as unknown as Record<string, unknown>,
            nextUrl, nextResult.redirectUrl, nextResult.html, tocRuleObj, listRule, engineSource,
            uniqueNextUrls.length > 1, evaluator
          )
          return np.map(toChapter)
        },
        MAX_CONCURRENT_PAGES
      )
      for (const chs of pageResults) chapterList.push(...chs)
    }

    if (chapterList.length === 0) {
      const jsonChapters = parseTocJson(html, redirectUrl)
      chapterList.push(...jsonChapters.map(toChapter))
    }

    if (chapterList.length > 0) {
      const deduped = dedupChapters(chapterList as unknown as EngineChapter[])
      const finalChapters = deduped.map(toChapter)
      finalChapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })

      if (book) {
        await saveTocToCache(source, book, finalChapters)
      }

      logInfo('engine', 'frontend', `[目录] 网络完成 ${finalChapters.length} 章`)
      return finalChapters
    }
    return []
  } catch (err) {
    handleError(err, {
      module: 'engine',
      operation: 'fetchTocFromNetwork',
      sourceUrl: source.bookSourceUrl,
      userMessage: '获取目录失败，请检查书源或网络',
    })
    return []
  }
}

/**
 * 兼容旧接口：先查缓存，缓存命中直接返回；未命中走网络。
 *
 * 这个语义是"cache-first"，调用方若需要 SWR 行为，
 * 用 loadTocFromCache + fetchTocFromNetwork 组合。
 */
export async function fetchToc(
  source: BookSource, tocUrl: string, book?: Book,
): Promise<Chapter[]> {
  if (book) {
    const cached = await loadTocFromCache(source, book)
    if (cached) {
      logInfo('engine', 'frontend', `[目录] 从缓存加载 ${cached.length} 章`)
      return cached
    }
  }
  return fetchTocFromNetwork(source, tocUrl, book)
}
