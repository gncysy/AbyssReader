// ============================================
// useSearch — 搜索状态管理（流式输出）
// ============================================

import { ref } from 'vue'
import { search } from '@/services/search.js'
import type { Book, BookSource } from '@/types'
import { NETWORK } from '@/constants/index.js'

interface DoSearchOptions {
  page?: number | undefined
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null | undefined
  shouldBreak?: ((size: number) => boolean) | null | undefined
  concurrency?: number | undefined
  onProgress?: ((done: number, total: number) => void) | undefined
}

export function useSearch() {
  const loading = ref(false)
  const completedCount = ref(0)
  const totalSources = ref(0)
  const searchResults = ref<Record<string, Book[]>>({})

  let abortController: AbortController = new AbortController()

  function cancelSearch(): void {
    abortController.abort()
    abortController = new AbortController()
    loading.value = false
  }

  async function doSearch(
    sources: BookSource[],
    keyword: string,
    options: DoSearchOptions = {},
  ): Promise<Book[]> {
    const concurrency = options.concurrency || NETWORK.CONCURRENCY
    const signal = abortController.signal

    const enabledSources = sources.filter((s) => s.enabled !== false)
    totalSources.value = enabledSources.length
    completedCount.value = 0
    loading.value = true
    searchResults.value = {}

    const queue = [...enabledSources]
    const allBooks: Book[] = []

    async function worker(): Promise<void> {
      while (queue.length > 0 && !signal.aborted) {
        const source = queue.shift()
        if (!source) break

        let books: Book[] = []
        const sourceKey = `${source.bookSourceName || source.bookSourceUrl || 'unknown'}::${source.bookSourceUrl || ''}`

        try {
          if (signal.aborted) break
          const searchOptions: Parameters<typeof search>[2] = {}
          if (signal !== undefined) searchOptions.signal = signal
          if (options.page !== undefined) searchOptions.page = options.page
          if (options.filter !== undefined && options.filter !== null) searchOptions.filter = options.filter
          if (options.shouldBreak !== undefined && options.shouldBreak !== null) searchOptions.shouldBreak = options.shouldBreak
          books = await search(source, keyword, searchOptions)
        } catch {
          // 单个书源失败，静默跳过
        }

        if (!signal.aborted) {
          if (books.length > 0) {
            const displayName = source.bookSourceName || source.bookSourceUrl || '未知书源'

            const existing = searchResults.value[displayName] || []
            const existingUrls = new Set(existing.map(b => b.bookUrl))
            const newBooks = books.filter(b => !existingUrls.has(b.bookUrl))
            searchResults.value = {
              ...searchResults.value,
              [displayName]: [...existing, ...newBooks],
            }

            for (const b of books) {
              ;(b as unknown as Record<string, unknown>)._sourceKey = sourceKey
            }

            allBooks.push(...books)
          }

          completedCount.value++

          // 修复：实时回调进度
          if (options.onProgress) {
            options.onProgress(completedCount.value, enabledSources.length)
          }
        }
      }
    }

    const workers: Promise<void>[] = []
    const workerCount = Math.min(concurrency, enabledSources.length)
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker())
    }
    await Promise.all(workers)

    if (!signal.aborted) {
      loading.value = false
    }

    return allBooks
  }

  function clearResults(): void {
    searchResults.value = {}
    completedCount.value = 0
    totalSources.value = 0
  }

  return {
    loading,
    completedCount,
    totalSources,
    searchResults,
    doSearch,
    cancelSearch,
    clearResults,
  }
}
