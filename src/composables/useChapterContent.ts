// ============================================
// useChapterContent — 章节正文加载 & 预加载
// ============================================

import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getContent } from '@/services/content.js'
import type { GetContentOptions } from '@/services/content.js'
import { extractImageUrls, createComicImages } from '@engine/business/comic/index.js'
import type { ComicImage } from '@engine/business/comic/index.js'
import { loadComicImages } from '@/services/comic.js'
import { getCachedContent, setCachedContent, getPreloadedContent, setPreloadedContent, getRawContent, setRawContent } from '@/services/cache.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource, Chapter } from '@/types'
import { READER } from '@/constants/reader.js'

interface ReplaceRuleLike {
  isEnabled?: boolean
  pattern?: string
  [key: string]: unknown
}

function isBookSourceArray(value: unknown): value is BookSource[] {
  return Array.isArray(value)
}

export function useChapterContent() {
  const message = useMessage()
  const { handleAndNotify } = useErrorHandler()
  const content = ref('')
  const loadingContent = ref(false)
  const chapterIndex = ref(0)
  const chapters = ref<Chapter[]>([])
  const isComic = ref(false)
  const comicImages = ref<ComicImage[]>([])
  const scrollPercent = ref(0)

  // 修复：使用响应式 ref 替代普通变量
  const preloadQueue = ref<number[]>([])
  const preloadingSet = ref<Set<number>>(new Set())
  let isChaptersLoaded = false
  let chaptersLoadPromise: Promise<void> | null = null

  const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

  async function loadChaptersForBook(
    book: Book, source: BookSource | null,
    initialChapters?: Chapter[],
  ): Promise<void> {
    if (isChaptersLoaded && chapters.value.length > 0) return
    if (chaptersLoadPromise) {
      await chaptersLoadPromise
      return
    }

    if (initialChapters && initialChapters.length > 0) {
      chapters.value = initialChapters
      isChaptersLoaded = true
      return
    }

    chaptersLoadPromise = (async () => {
      try {
        if (book.bookUrl?.startsWith('local://')) {
          const { reader } = await import('@/services/reader.js')
          const bookId = book.bookUrl.replace('local://', '')
          const data = await reader.getLocalBookChapters(bookId)
          const localChapters: Chapter[] = Array.isArray(data)
            ? data.map((c) => ({ ...c, url: book.bookUrl }))
            : [{ id: 0, title: '正文', url: book.bookUrl, index: 0 }]
          chapters.value = localChapters
          return
        }
        if (!source) {
          const { store } = await import('@/services/store.js')
          const rawSources = await store.get('bookSource')
          const allSources = isBookSourceArray(rawSources) ? rawSources : []
          source = allSources.find((s) => s.bookSourceName === book.originName) || null
        }
        if (!source) { chapters.value = []; return }
        const { useToc } = await import('./useToc.js')
        const toc = useToc()
        const result = await toc.loadToc(source, book.tocUrl || book.bookUrl, book)
        chapters.value = Array.isArray(result) ? result : []
      } catch (err: unknown) {
        const result = handleAndNotify(err, {
          module: 'reader',
          operation: 'loadChaptersForBook',
          userMessage: '加载目录失败，请检查书源',
        })
        if (result.shouldShowUser) message.warning(result.message)
        chapters.value = []
      } finally {
        isChaptersLoaded = true
        chaptersLoadPromise = null
      }
    })()

    await chaptersLoadPromise
  }

  async function loadRawContent(
    book: Book, source: BookSource,
    _reSegmentEnabled: boolean, _bookName: string, _replaceRules: ReplaceRuleLike[],
    forceRefresh = false
  ): Promise<string> {
    const ch = currentChapter.value
    if (!ch) return ''

    if (!forceRefresh) {
      const rawCached = getRawContent(book, chapterIndex.value)
      if (rawCached) return rawCached

      const cached = await getCachedContent(book, ch.id)
      if (cached) {
        setRawContent(book, chapterIndex.value, cached)
        return cached
      }
    }

    if (book.bookUrl?.startsWith('local://')) {
      const { reader } = await import('@/services/reader.js')
      const bookId = book.bookUrl.replace('local://', '')
      const raw = String(await reader.getLocalChapterContent(bookId, ch.id) || '')
      setRawContent(book, chapterIndex.value, raw)
      return raw
    }

    isComic.value = source.bookSourceType === 2
    const getOptions: GetContentOptions = {
      book,
      nextChapterUrl: chapters.value[chapterIndex.value + 1]?.url || '',
      chapter: ch,
      skipCache: forceRefresh,
    }
    if (book.kind !== undefined && book.kind !== null) {
      getOptions.bookKind = book.kind
    }
    const rawContent = await getContent(source, ch.url, getOptions)

    setRawContent(book, chapterIndex.value, rawContent)
    return rawContent
  }

  async function loadContent(
    book: Book, source: BookSource, _purifyEnabled: boolean,
    reSegmentEnabled: boolean, bookName: string, replaceRules: ReplaceRuleLike[],
    forceRefresh = false
  ): Promise<void> {
    const ch = currentChapter.value
    if (!ch) return
    comicImages.value = []
    scrollPercent.value = 0

    if (!forceRefresh) {
      const rawCached = getRawContent(book, chapterIndex.value)
      if (rawCached) {
        content.value = rawCached
        return
      }
    }

    loadingContent.value = true

    try {
      const raw = await loadRawContent(book, source, reSegmentEnabled, bookName, replaceRules, forceRefresh)
      content.value = raw

      if (isComic.value && raw && typeof raw === 'string') {
        const urls = extractImageUrls(raw)
        if (urls.length > 0) {
          comicImages.value = createComicImages(urls)
          const comicId = book.bookUrl + '/' + (ch.id ?? 0)
          loadComicImages(comicImages.value, JSON.stringify(source), comicId)
        }
      }

      if (!forceRefresh) {
        await setCachedContent(book, ch.id, raw)
      }
    } catch (err: unknown) {
      const result = handleAndNotify(err, {
        module: 'reader',
        operation: 'loadContent',
        userMessage: '加载章节失败，请检查网络',
      })
      if (result.shouldShowUser) message.warning(result.message)
      content.value = '<p style="color:var(--text-muted);text-align:center;padding:40px">' + result.message + '</p>'
    } finally {
      loadingContent.value = false
    }
  }

  function startPreload(book: Book, source: BookSource, _purifyEnabled: boolean, _reSegmentEnabled: boolean, _bookName: string, _replaceRules: ReplaceRuleLike[]): void {
    if (isComic.value) return
    // 修复：通过重新赋值触发响应式
    preloadQueue.value = []
    preloadingSet.value = new Set()

    const newQueue: number[] = []
    const newSet = new Set<number>()

    for (let i = chapterIndex.value + 1; i < Math.min(chapterIndex.value + 1 + READER.PRELOAD_COUNT, chapters.value.length); i++) {
      if (getPreloadedContent(book, i)) continue
      if (newSet.has(i)) continue
      newSet.add(i)
      newQueue.push(i)
    }

    preloadQueue.value = newQueue
    preloadingSet.value = newSet
    processPreloadQueue(book, source)
  }

  async function processPreloadQueue(book: Book, source: BookSource): Promise<void> {
    async function preloadOne(): Promise<void> {
      while (preloadQueue.value.length > 0) {
        const idx = preloadQueue.value.shift()
        if (idx === undefined) continue
        const ch = chapters.value[idx]
        if (!ch) continue
        const cached = await getCachedContent(book, ch.id)
        if (cached) {
          setPreloadedContent(book, idx, cached)
          continue
        }
        try {
          const getOptions: GetContentOptions = {
            book,
            nextChapterUrl: chapters.value[idx + 1]?.url || '',
            chapter: ch,
          }
          if (book.kind !== undefined && book.kind !== null) {
            getOptions.bookKind = book.kind
          }
          const raw = await getContent(source, ch.url, getOptions)
          if (raw) {
            setRawContent(book, idx, raw)
            setPreloadedContent(book, idx, raw)
            await setCachedContent(book, ch.id, raw)
          }
        } catch {
          // ignore
        }
      }
    }
    preloadOne(); preloadOne()
  }

  function prevChapter(): void { if (chapterIndex.value > 0) { chapterIndex.value--; scrollPercent.value = 0 } }
  function nextChapter(): void { if (chapterIndex.value < chapters.value.length - 1) { chapterIndex.value++; scrollPercent.value = 0 } }

  return {
    content, loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter,
    loadChaptersForBook, loadContent, loadRawContent, startPreload,
    prevChapter, nextChapter,
  }
}
