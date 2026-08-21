// ============================================
// useChangeSource — 换源逻辑（修复索引错位）
// ============================================

import { ref } from 'vue'
import type { BookSource } from '@/types'
import { store } from '@/services/store.js'

interface ChangeSourceItem {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  _sourceName: string
  _sourceUrl: string
  [key: string]: unknown
}

function isBookSourceArray(value: unknown): value is BookSource[] {
  return Array.isArray(value)
}

export function useChangeSource() {
  const showChangeSource = ref(false)
  const changeSourceResults = ref<ChangeSourceItem[]>([])
  const changingSource = ref(false)
  const searchDone = ref(0)
  const searchTotal = ref(0)
  const allSourceList = ref<BookSource[]>([])

  async function openChangeSource(): Promise<void> {
    const raw = await store.get('bookSource')
    allSourceList.value = isBookSourceArray(raw) ? raw : []
    changeSourceResults.value = []
    searchDone.value = 0
    searchTotal.value = 0
    showChangeSource.value = true
  }

  async function searchForChange(bookName: string): Promise<void> {
    changingSource.value = true
    changeSourceResults.value = []
    searchDone.value = 0

    try {
      const queue = allSourceList.value.filter((s) => s.enabled && s.bookSourceType === 0)
      searchTotal.value = queue.length

      const { useSearch } = await import('./useSearch.js')
      const { doSearch } = useSearch()

      const allBooks = await doSearch(queue, bookName, {
        page: 1,
        // 修复：通过回调实时更新进度
        onProgress: (done, total) => {
          searchDone.value = done
          searchTotal.value = total
        },
      })

      const sourceMap = new Map<string, { name: string; url: string }>()
      for (const s of queue) {
        const key = `${s.bookSourceName || s.bookSourceUrl || 'unknown'}::${s.bookSourceUrl || ''}`
        sourceMap.set(key, {
          name: s.bookSourceName || '未知书源',
          url: s.bookSourceUrl || '',
        })
      }

      const matched = allBooks
        .filter((b) => b.name === bookName)
        .map((b) => {
          const sourceKey = (b as unknown as Record<string, unknown>)._sourceKey
          const key = typeof sourceKey === 'string' ? sourceKey : ''
          const info = sourceMap.get(key) || { name: '未知书源', url: '' }
          return {
            ...b,
            _sourceName: info.name,
            _sourceUrl: info.url,
          } as ChangeSourceItem
        })

      changeSourceResults.value = matched
      searchDone.value = queue.length
    } catch {
      changeSourceResults.value = []
    } finally {
      changingSource.value = false
    }
  }

  function closeChangeSource(): void {
    showChangeSource.value = false
    changeSourceResults.value = []
  }

  return {
    showChangeSource, changeSourceResults, changingSource,
    searchDone, searchTotal, allSourceList,
    openChangeSource, searchForChange, closeChangeSource,
  }
}
