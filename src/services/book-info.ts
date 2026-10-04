// ============================================
// 书籍信息获取服务 — view → engine 的桥梁
// ============================================

import { parseBookInfo } from '@engine/business/book/index.js'
import type { RuleEvaluator } from '@engine/business/book/index.js'
import { getString, getStringList, getElements } from '@engine/parser/index.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { fetchWithWebviewFallback } from './fetch.js'
import type { Book, BookSource } from '@/types'
import type { EngineBookSource } from '@engine/types.js'
import { NETWORK } from '@/constants/index.js'

const INFO_CACHE_TTL = 30 * 60 * 1000
const INFO_CACHE_MAX = 100

interface CachedInfo {
  book: Book | null
  timestamp: number
}

// 修复：新增内存缓存，同一本书反复打开不重复请求
const infoCache = new Map<string, CachedInfo>()

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function createRuleEvaluator(): RuleEvaluator {
  return {
    getString: (content, rule, ctx) => getString(content, rule, ctx),
    getStringList: (content, rule, ctx) => getStringList(content, rule, ctx),
    getElements: (content, rule, ctx) => getElements(content, rule, ctx),
  }
}

function cacheKey(url: string, sourceUrl: string): string {
  return sourceUrl + '::' + url
}

function pruneCache(): void {
  if (infoCache.size <= INFO_CACHE_MAX) return
  const now = Date.now()
  // 先删过期
  for (const [k, v] of infoCache) {
    if (now - v.timestamp > INFO_CACHE_TTL) infoCache.delete(k)
  }
  // 若仍超量，删最早的
  if (infoCache.size > INFO_CACHE_MAX) {
    const entries = [...infoCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    const excess = infoCache.size - INFO_CACHE_MAX
    for (let i = 0; i < excess; i++) {
      const entry = entries[i]
      if (entry) infoCache.delete(entry[0])
    }
  }
}

export async function fetchBookInfoForAdd(
  url: string,
  source: BookSource,
  options: { skipCache?: boolean } = {},
): Promise<Book | null> {
  const key = cacheKey(url, source.bookSourceUrl || '')

  if (!options.skipCache) {
    const cached = infoCache.get(key)
    if (cached && Date.now() - cached.timestamp < INFO_CACHE_TTL) {
      return cached.book
    }
  }

  const runtime = getJsRuntime()
  const headers = await parseSourceHeader(toEngineBookSource(source), runtime)
  const html = await fetchWithWebviewFallback(url, {
    source,
    headers,
    timeout: NETWORK.DEFAULT_TIMEOUT,
  })
  if (!html) {
    infoCache.set(key, { book: null, timestamp: Date.now() })
    pruneCache()
    return null
  }

  const info = await parseBookInfo(
    toEngineBookSource(source),
    html,
    url,
    createRuleEvaluator(),
  )
  if (!info || !info.name) {
    infoCache.set(key, { book: null, timestamp: Date.now() })
    pruneCache()
    return null
  }

  const book: Book = {
    ...info,
    bookUrl: url,
    origin: source.bookSourceUrl || '',
    originName: source.bookSourceName || '',
  } as Book

  infoCache.set(key, { book, timestamp: Date.now() })
  pruneCache()
  return book
}

/**
 * 清理缓存（供测试或数据刷新时使用）。
 */
export function clearBookInfoCache(): void {
  infoCache.clear()
}
