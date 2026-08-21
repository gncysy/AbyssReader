// ============================================
// 目录服务 — 对齐 Legado BookChapterList + WebBook
// ============================================

import { parseTocPage, parseTocJson, dedupChapters } from '@engine/business/book/index.js'
import { analyzeUrl } from '@engine/url/index.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
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

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function toChapter(ch: EngineChapter): Chapter {
  return ch as unknown as Chapter
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
  const headers = await parseSourceHeader(toEngineBookSource(source))
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 15; V2304A Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36'
  }
  return headers
}

async function fetchPage(
  url: string,
  headers: Record<string, string>,
  source: BookSource,
  book: Book,
  method: 'GET' | 'POST' = 'GET',
  body: string | null = null,
): Promise<{ html: string; redirectUrl: string } | null> {
  try {
    const needsAnalyze = url.includes('@js:') || url.includes('<js>') || url.includes('{{') || url.includes(',{')
    if (needsAnalyze) {
      const analysis = await analyzeUrl(url, {
        source: toEngineBookSource(source),
        book: book || {},
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

export async function fetchToc(
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

  if (book) {
    const cached = await loadTocFromCache(source, book)
    if (cached) {
      logInfo('engine', 'frontend', `[目录] 从缓存加载 ${cached.length} 章`)
      return cached
    }
  }

  logInfo('engine', 'frontend', `[目录] 开始 url=${tocUrl.substring(0, 100)}`)

  const headers = await executeHeaderRule(source)
  const bookData = book || { name: '', author: '', bookUrl: tocUrl }

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
      pageChapters = Array.isArray(response) ? (response as Chapter[]) : []
    } else {
      const parsed = await parseTocPage(
        bookData as Record<string, unknown>,
        tocUrl, redirectUrl, html, tocRuleObj, listRule, engineSource, true
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
      const pageResults = await concurrentMap(
        uniqueNextUrls.slice(0, READER.MAX_TOC_PAGES),
        async (nextUrl) => {
          const nextResult = await fetchPage(nextUrl, headers, source, bookData)
          if (!nextResult) return [] as Chapter[]
          if (shouldExecuteInDeno(listRule)) {
            const response = await evaluateRule(listRule, nextResult.html, {
              source: engineSource,
              baseUrl: source.bookSourceUrl,
              book: bookData,
              redirectUrl: nextResult.redirectUrl,
            }, { forceDeno: true })
            return Array.isArray(response) ? (response as Chapter[]) : []
          }
          const { chapters: np } = await parseTocPage(
            bookData as Record<string, unknown>,
            nextUrl, nextResult.redirectUrl, nextResult.html, tocRuleObj, listRule, engineSource,
            uniqueNextUrls.length > 1
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
      // 修复：移除无条件的 reverse()。reverse 已在上方按书源规则处理
      finalChapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })

      if (book) {
        await saveTocToCache(source, book, finalChapters)
      }

      logInfo('engine', 'frontend', `[目录] 完成 ${finalChapters.length} 章`)
      return finalChapters
    }
    return []
  } catch (err) {
    handleError(err, {
      module: 'engine',
      operation: 'fetchToc',
      sourceUrl: source.bookSourceUrl,
      userMessage: '获取目录失败，请检查书源或网络',
    })
    return []
  }
}
