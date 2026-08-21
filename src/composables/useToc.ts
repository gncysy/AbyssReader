// ============================================
// useToc — 目录状态管理
// ============================================

import { ref, computed } from 'vue'
import { fetchToc, loadTocFromCache, saveTocToCache } from '@/services/toc.js'
import { logInfo } from '@engine/log/index.js'
import type { Book, BookSource, Chapter } from '@/types'

const TOC_PAGE_SIZE = 200

export function useToc() {
  const chapters = ref<Chapter[]>([])
  const loadingToc = ref(false)
  const tocFilter = ref('')
  const tocCurrentPage = ref(0)

  const safeChapters = computed(() => (Array.isArray(chapters.value) ? chapters.value : []))
  const filteredChapters = computed(() => {
    const kw = tocFilter.value.trim().toLowerCase()
    if (!kw) return safeChapters.value
    return safeChapters.value.filter((ch) => ch.title.toLowerCase().includes(kw))
  })
  const totalTocPages = computed(() => Math.ceil(filteredChapters.value.length / TOC_PAGE_SIZE))
  const pagedChapters = computed(() => {
    const start = tocCurrentPage.value * TOC_PAGE_SIZE
    return filteredChapters.value.slice(start, start + TOC_PAGE_SIZE)
  })

  async function loadToc(
    source: BookSource,
    tocUrl: string,
    book?: Book
  ): Promise<Chapter[]> {
    loadingToc.value = true
    try {
      const result = await fetchToc(source, tocUrl, book)
      chapters.value = result
      return result
    } finally {
      loadingToc.value = false
    }
  }

  async function loadTocSmart(
    source: BookSource,
    tocUrl: string,
    book?: Book
  ): Promise<Chapter[]> {
    loadingToc.value = true
    try {
      // 直接调用 fetchToc，它内部已处理缓存逻辑
      const fresh = await fetchToc(source, tocUrl, book)
      chapters.value = fresh
      return fresh
    } catch (err) {
      // fetchToc 失败时降级到缓存
      if (book) {
        const cached = await loadTocFromCache(source, book)
        if (cached && cached.length > 0) {
          chapters.value = cached
          return cached
        }
      }
      chapters.value = []
      return []
    } finally {
      loadingToc.value = false
    }
  }

  return {
    chapters,
    loadingToc,
    tocFilter,
    tocCurrentPage,
    safeChapters,
    filteredChapters,
    totalTocPages,
    pagedChapters,
    loadToc,
    loadTocSmart,
    loadTocFromCache,
    saveTocToCache,
  }
}
