// ============================================
// useExplore — 发现页逻辑
// ============================================

import { ref, nextTick } from 'vue'
import { getExploreCategoriesAsync, getExploreBooks } from '@engine/business/explore/index.js'
import { fetchWithWebviewFallback } from '@/services/fetch.js'
import type { ExploreKind } from '@engine/business/explore/index.js'
import type { Book, BookSource } from '@/types'
import type { EngineBookSource } from '@engine/types.js'
import { useInfoMapStore } from '@/stores/info-map.js'

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function toBook(engineBook: Record<string, unknown>): Book {
  return engineBook as unknown as Book
}

export function useExplore() {
  const categories = ref<ExploreKind[]>([])
  const loadingCategories = ref(false)
  const currentCategory = ref<ExploreKind | null>(null)
  const books = ref<Book[]>([])
  const loadingBooks = ref(false)
  const currentPage = ref(1)
  const hasMore = ref(true)
  const booksGridRef = ref<HTMLElement | null>(null)

  let loadMoreObserver: IntersectionObserver | null = null
  let currentSentinel: HTMLElement | null = null

  function cleanupObserver(): void {
    if (loadMoreObserver) { loadMoreObserver.disconnect(); loadMoreObserver = null }
    if (currentSentinel) {
      if (currentSentinel.parentNode) {
        currentSentinel.parentNode.removeChild(currentSentinel)
      }
      currentSentinel = null
    }
  }

  function setupObserver(source: BookSource): void {
    cleanupObserver()
    nextTick(() => {
      const grid = booksGridRef.value
      if (!grid) return
      const sentinel = document.createElement('div')
      sentinel.style.cssText = 'height:1px;width:100%;visibility:hidden'
      grid.parentNode?.appendChild(sentinel)
      currentSentinel = sentinel
      loadMoreObserver = new IntersectionObserver((entries) => {
        const first = entries[0]
        if (first !== undefined && first.isIntersecting && !loadingBooks.value && hasMore.value && currentCategory.value) {
          loadBooks(source)
        }
      }, { rootMargin: '0px 0px 200px 0px' })
      loadMoreObserver.observe(sentinel)
    })
  }

  async function loadCategories(source: BookSource): Promise<void> {
    categories.value = []
    loadingCategories.value = true
    books.value = []
    currentCategory.value = null
    currentPage.value = 1
    hasMore.value = true

    try {
      const result = await getExploreCategoriesAsync(toEngineBookSource(source))
      if (Array.isArray(result)) {
        categories.value = result
      }
    } catch {
      // ignore
    } finally {
      loadingCategories.value = false
    }
  }

  async function exploreCategory(source: BookSource, cat: ExploreKind): Promise<void> {
    if (!cat || !cat.url) return
    currentCategory.value = cat
    currentPage.value = 1
    books.value = []
    hasMore.value = true
    await loadBooks(source)
    setupObserver(source)
  }

  async function loadBooks(source: BookSource): Promise<void> {
    if (!currentCategory.value) return
    if (!hasMore.value) return
    if (loadingBooks.value) return

    loadingBooks.value = true
    try {
      let url = currentCategory.value.url || ''
      url = url.replace(/\{\{page\}\}/g, String(currentPage.value))

      const infoMapStore = useInfoMapStore()
      const sourceUrl = source.bookSourceUrl || ''

      url = url.replace(/\{\{infoMap\[['"]([^'"]+)['"]\]\}\}/g, (_: string, key: string) => {
        return infoMapStore.get(sourceUrl, key) || ''
      })

      let result: Book[] = []
      try {
        const engineBooks = await getExploreBooks(toEngineBookSource(source), url, currentPage.value)
        result = engineBooks.map((b) => toBook(b as unknown as Record<string, unknown>))
      } catch {
        result = []
      }

      if (result.length === 0) {
        const absoluteUrl = url.startsWith('http')
          ? url
          : (source.bookSourceUrl ? source.bookSourceUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '') : url)
        const html = await fetchWithWebviewFallback(absoluteUrl, {
          source,
          timeout: 30000,
        })
        if (html && typeof html === 'string' && html.length > 1000) {
          const htmlResult = await getExploreBooks(toEngineBookSource(source), html, currentPage.value, undefined, true)
          if (htmlResult && htmlResult.length > 0) {
            result = htmlResult.map((b) => toBook(b as unknown as Record<string, unknown>))
          }
        }
      }

      const newBooks = Array.isArray(result) ? result : []

      if (newBooks.length === 0) {
        hasMore.value = false
      } else {
        const existingUrls = new Set(books.value.map((b) => b.bookUrl))
        const uniqueNew = newBooks.filter((b) => !existingUrls.has(b.bookUrl))
        books.value = [...books.value, ...uniqueNew]
        currentPage.value++
        if (newBooks.length < 10) hasMore.value = false
      }
    } catch (err: unknown) {
      console.error('[useExplore] loadBooks error:', err)
      hasMore.value = false
    } finally {
      loadingBooks.value = false
    }
  }

  function reset(): void {
    categories.value = []
    currentCategory.value = null
    books.value = []
    currentPage.value = 1
    hasMore.value = true
  }

  return {
    categories, loadingCategories, currentCategory,
    books, loadingBooks, currentPage, hasMore, booksGridRef,
    loadCategories, exploreCategory, loadBooks, reset, cleanupObserver,
  }
}
