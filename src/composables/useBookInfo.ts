// ============================================
// useBookInfo — 书籍详情加载 & 缓存（带 TTL）
// ============================================

import { reactive, ref } from 'vue'
import { getString } from '@engine/parser/index.js'
import { fetchWithWebviewFallback } from '@/services/fetch.js'
import { logError } from '@engine/log/index.js'
import type { Book, BookSource } from '@/types'
import type { EngineBookSource, ParseContext } from '@engine/types.js'

const CACHE_TTL = 30 * 60 * 1000 // 30 分钟

interface BookInfoCache {
  intro: string | null
  kind: string | null
  lastChapter: string | null
  wordCount: string | null
  tocUrl: string | null
  coverUrl: string | null
  timestamp: number
}

const globalBookInfoCache = reactive(new Map<string, BookInfoCache>())

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function isHtmlContent(str: string): boolean {
  return str.startsWith('<') && str.includes('>') && str.length > 100
}

function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string' && val.length > 0 && !isHtmlContent(val)) return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>
    if (typeof obj.src === 'string') return obj.src
    if (typeof obj.href === 'string') return obj.href
    if (typeof obj.getAttribute === 'function') {
      const getAttr = obj.getAttribute as (name: string) => string | null
      const src = getAttr('src')
      if (src) return src
      const href = getAttr('href')
      if (href) return href
    }
  }
  return null
}

interface RuleBookInfoLike {
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  coverUrl?: string | null
  tocUrl?: string | null
  wordCount?: string | null
  [key: string]: unknown
}

function isRuleBookInfo(value: unknown): value is RuleBookInfoLike {
  return value !== null && typeof value === 'object'
}

export function useBookInfo() {
  const loadedIntro = ref<string | null>(null)
  const loadedKind = ref<string | null>(null)
  const loadedLastChapter = ref<string | null>(null)
  const loadedWordCount = ref<string | null>(null)
  const loadedTocUrl = ref<string | null>(null)
  const loadedCover = ref<string | null>(null)

  async function loadBookInfo(book: Book, source: BookSource): Promise<void> {
    if (!book || !source) return
    const cacheKey = book.bookUrl
    const cached = globalBookInfoCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      loadedIntro.value = cached.intro
      loadedKind.value = cached.kind
      loadedLastChapter.value = cached.lastChapter
      loadedWordCount.value = cached.wordCount
      loadedTocUrl.value = cached.tocUrl
      // 修复：缓存的封面为 null 时，不覆盖 book.coverUrl
      // 避免书架已有封面被详情页缓存覆盖为 null
      if (cached.coverUrl) {
        loadedCover.value = cached.coverUrl
        if (!book.coverUrl) {
          book.coverUrl = cached.coverUrl
        }
      } else {
        // 缓存的封面为 null，尝试使用 book.coverUrl
        loadedCover.value = book.customCoverUrl || book.coverUrl || null
      }
      return
    }

    try {
      const html = await fetchWithWebviewFallback(book.bookUrl, {
        source,
        timeout: 30000,
      })

      if (!html) return

      const ruleRaw = source.ruleBookInfo
      if (!isRuleBookInfo(ruleRaw)) return

      const engineSource = toEngineBookSource(source)
      const ctx: ParseContext = { source: engineSource, baseUrl: book.bookUrl, result: html }

      if (ruleRaw.intro) {
        loadedIntro.value = safeString(await getString(html, ruleRaw.intro, ctx))
      }
      if (ruleRaw.kind) {
        loadedKind.value = safeString(await getString(html, ruleRaw.kind, ctx))
      }
      if (ruleRaw.lastChapter) {
        loadedLastChapter.value = safeString(await getString(html, ruleRaw.lastChapter, ctx))
      }
      if (ruleRaw.wordCount) {
        loadedWordCount.value = safeString(await getString(html, ruleRaw.wordCount, ctx))
      }
      if (ruleRaw.coverUrl) {
        const rawCover = await getString(html, ruleRaw.coverUrl, ctx)
        const coverStr = safeString(rawCover)
        if (coverStr) {
          try {
            const resolved = coverStr.startsWith('http') ? coverStr : new URL(coverStr, book.bookUrl).href
            loadedCover.value = resolved
            book.coverUrl = resolved
          } catch {
            loadedCover.value = coverStr
            book.coverUrl = coverStr
          }
        }
      }
      if (ruleRaw.tocUrl && ruleRaw.tocUrl !== '{{baseUrl}}') {
        const raw = await getString(html, ruleRaw.tocUrl, { ...ctx, isUrl: true })
        loadedTocUrl.value = safeString(raw)
      } else {
        loadedTocUrl.value = book.bookUrl
      }

      // 修复：如果详情页没解析到封面，使用 book 上已有的封面
      if (!loadedCover.value) {
        loadedCover.value = book.customCoverUrl || book.coverUrl || null
      }

      globalBookInfoCache.set(cacheKey, {
        intro: loadedIntro.value,
        kind: loadedKind.value,
        lastChapter: loadedLastChapter.value,
        wordCount: loadedWordCount.value,
        tocUrl: loadedTocUrl.value,
        coverUrl: loadedCover.value,
        timestamp: Date.now(),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logError('bookshelf', 'frontend', `[详情] 加载失败: ${msg}`)
    }
  }

  return { loadedIntro, loadedKind, loadedLastChapter, loadedWordCount, loadedTocUrl, loadedCover, loadBookInfo }
}
