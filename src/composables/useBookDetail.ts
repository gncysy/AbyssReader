// ============================================
// useBookDetail — 书籍详情页业务逻辑
// ============================================

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useBookshelfStore, useReaderStore } from '@/stores'
import { store, engine } from '@/services'
import { useBookInfo } from '@/composables/useBookInfo.js'
import { useToc } from '@/composables/useToc.js'
import { useChangeSource } from '@/composables/useChangeSource.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource, Chapter } from '@/types'

const COVER_SEARCH_CONCURRENCY = 5
const SOURCE_VAR_KEY = 'sourceVariable'
const BOOK_VAR_KEY = 'bookVariable'

function safeString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if (typeof obj.text === 'function') {
      return String((obj.text as () => unknown)() || '')
    }
    try {
      return JSON.stringify(val)
    } catch {
      return ''
    }
  }
  return String(val)
}

interface CoverOption {
  coverUrl: string | null
  label: string
  sourceName: string
  isCurrent: boolean
  sourceIndex?: number
}

interface ChangeSourceItem {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  tocUrl?: string | null
  _sourceName: string
  _sourceUrl: string
  [key: string]: unknown
}

function isBookSourceArray(value: unknown): value is BookSource[] {
  return Array.isArray(value)
}

export function useBookDetail(book: Book | null, source: BookSource | null) {
  const router = useRouter()
  const msg = useMessage()
  const bookshelfStore = useBookshelfStore()
  const readerStore = useReaderStore()
  const { handleAndNotify } = useErrorHandler()
  const { loadedIntro, loadedKind, loadedLastChapter, loadedWordCount, loadedCover, loadBookInfo } = useBookInfo()
  const { chapters, loadingToc, loadTocSmart } = useToc()
  const { showChangeSource, changeSourceResults, changingSource, searchDone, searchTotal, openChangeSource, searchForChange, closeChangeSource } = useChangeSource()

  const currentChapterId = ref<number | null>(null)
  const hasReadingProgress = ref(false)
  const lastChapterId = ref<number | null>(null)
  const isLoggedIn = ref(false)
  const showRemoveConfirm = ref(false)
  const showMoreMenu = ref(false)
  const showSourceVarModal = ref(false)
  const showBookVarModal = ref(false)
  const sourceVarInput = ref('')
  const bookVarInput = ref('')

  const showCoverPicker = ref(false)
  const coverPickerLoading = ref(false)
  const coverOptions = ref<CoverOption[]>([])

  const needsLogin = computed(() => !!source?.loginUrl)
  const isInShelf = computed(() => bookshelfStore.hasBook(book?.bookUrl || ''))

  const mainCover = computed(() => {
    const cover = safeString(loadedCover.value)
    if (cover && cover !== 'undefined' && cover !== 'null') return cover
    if (book?.customCoverUrl) return book.customCoverUrl
    if (book?.coverUrl) return book.coverUrl
    return null
  })

  const fallbackCoverUrls = computed(() => {
    const urls: string[] = []
    if (book?.coverUrl && mainCover.value !== book.coverUrl) urls.push(book.coverUrl)
    if (book?.customCoverUrl && mainCover.value !== book.customCoverUrl) urls.push(book.customCoverUrl)
    const loaded = safeString(loadedCover.value)
    if (loaded && mainCover.value !== loaded && loaded !== 'undefined' && loaded !== 'null') urls.push(loaded)
    return urls
  })

  const displayAuthor = computed(() => {
    const raw = book?.author || '未知作者'
    const str = safeString(raw)
    if (str === 'undefined' || str === 'null') return '未知作者'
    return str.replace(/^\s*作\s*者[:：\s]+|\s+著$/g, '').trim() || '未知作者'
  })

  const displayIntro = computed(() => {
    const intro = safeString(loadedIntro.value) || book?.customIntro || book?.intro || null
    if (!intro) return '暂无简介'
    const str = safeString(intro)
    if (str === 'undefined' || str === 'null' || !str.trim()) return '暂无简介'
    return str
  })

  const fullIntroHtml = computed(() => {
    const text = displayIntro.value
    if (text === '暂无简介' || !text) {
      return '<span style="color:var(--text-muted)">暂无简介</span>'
    }
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return text
    }
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => '\u3000\u3000' + l)
      .join('<br>')
  })

  async function loadReadingProgress(): Promise<void> {
    if (!book) return
    try {
      const progress = await readerStore.loadProgress(book.bookUrl, book.name, book.author)
      if (progress && progress.chapterId !== undefined) {
        hasReadingProgress.value = true
        lastChapterId.value = progress.chapterId
      }
    } catch {
      // ignore
    }
  }

  async function init(): Promise<void> {
    if (!book || !source) return
    loadingToc.value = true

    try {
      await Promise.all([loadBookInfo(book, source), loadReadingProgress()])
      await loadTocSmart(source, book.tocUrl || book.bookUrl, book)

      if (lastChapterId.value !== null && chapters.value.length > 0) {
        const idx = chapters.value.findIndex((c) => c.id === lastChapterId.value)
        if (idx !== -1) {
          currentChapterId.value = lastChapterId.value
        }
      }
    } catch (err) {
      loadingToc.value = false
      const result = handleAndNotify(err, {
        module: 'bookshelf',
        operation: 'initBookDetail',
        userMessage: '加载书籍详情失败',
      })
      if (result.shouldShowUser) msg.warning(result.message)
    }
  }

  function handleChapterClick(ch: Chapter): void {
    if (!book) return
    currentChapterId.value = ch.id
    bookshelfStore.closeDetail()
    bookshelfStore.openReader(
      { ...book, _forceChapterIndex: chapters.value.findIndex((c) => c.id === ch.id) },
      source,
      chapters.value
    )
  }

  async function handleRead(): Promise<void> {
    if (!book) return
    bookshelfStore.closeDetail()
    if (hasReadingProgress.value && lastChapterId.value !== null && chapters.value.length > 0) {
      const idx = chapters.value.findIndex((c) => c.id === lastChapterId.value)
      if (idx !== -1) {
        bookshelfStore.openReader({ ...book, _forceChapterIndex: idx }, source, chapters.value)
        return
      }
    }
    bookshelfStore.openReader(book, source, chapters.value)
  }

  async function handleAddToShelf(): Promise<void> {
    if (isInShelf.value) {
      msg.info('已在书架中')
      return
    }
    if (!book) return
    const kind = safeString(loadedKind.value)
    const bookToSave: Book = {
      ...book,
      kind: kind || book.kind || null,
    }
    const added = await bookshelfStore.addBook({
      ...bookToSave,
      origin: source?.bookSourceUrl || '',
      originName: source?.bookSourceName || '',
    })
    if (added) {
      msg.success('已添加《' + book.name + '》')
    }
  }

  async function handleRemoveFromShelf(): Promise<void> {
    showRemoveConfirm.value = false
    if (!book) return
    await bookshelfStore.removeBookByUrl(book.bookUrl)
    msg.success('已移出')
  }

  function handleChangeSource(): void {
    showMoreMenu.value = false
    openChangeSource()
  }

  async function handleSearchForChange(): Promise<void> {
    if (book) await searchForChange(book.name)
  }

  async function handleConfirmChangeSource(item: ChangeSourceItem): Promise<void> {
    if (!book) return
    const newValues: Partial<Book> = {
      bookUrl: item.bookUrl,
      tocUrl: item.tocUrl || item.bookUrl,
      coverUrl: item.coverUrl || null,
      intro: item.intro || null,
      kind: item.kind || null,
      lastChapter: item.lastChapter || null,
      origin: item._sourceUrl || '',
      originName: item._sourceName || '',
    }
    if (item.wordCount) newValues.wordCount = item.wordCount
    await bookshelfStore.updateBook(book.bookUrl, newValues)
    closeChangeSource()
    chapters.value = []
    await init()
    msg.success('书源已切换')
  }

  function handleSearchKind(): void {
    const kind = safeString(loadedKind.value)
    if (kind) router.push({ name: 'search', query: { keyword: kind } })
  }

  function toggleMoreMenu(): void {
    showMoreMenu.value = !showMoreMenu.value
  }

  async function handleLoginFromMenu(): Promise<void> {
    showMoreMenu.value = false
    if (!source) return
    const src = source as unknown as Record<string, unknown>
    const loginUrl = typeof src.loginUrl === 'string' ? src.loginUrl : ''
    if (loginUrl) {
      try {
        const { loginWebview } = await import('@/services/network.js')
        await loginWebview(source.bookSourceUrl || loginUrl || '', source.bookSourceName || '登录', 300)
        msg.success('登录成功')
        isLoggedIn.value = true
        chapters.value = []
        await init()
      } catch (err: unknown) {
        const msgStr = err instanceof Error ? err.message : String(err)
        msg.error('登录失败: ' + msgStr)
      }
    }
  }

  function openSourceVar(): void {
    showMoreMenu.value = false
    showSourceVarModal.value = true
  }

  function openBookVar(): void {
    showMoreMenu.value = false
    showBookVarModal.value = true
  }

  function openBookUrl(): void {
    if (!book) return
    const url = book.bookUrl || book.tocUrl
    if (!url) {
      msg.warning('该书籍没有可打开的网址')
      return
    }
    window.open(url, '_blank')
  }

  async function saveSourceVar(): Promise<void> {
    if (!source) return
    const value = sourceVarInput.value.trim()
    try {
      const safeValue = JSON.stringify(value)
      await engine.executeJs(`java.put(${JSON.stringify(SOURCE_VAR_KEY)}, ${safeValue})`, {
        source,
        baseUrl: source.bookSourceUrl || '',
        book: book || {},
        result: value,
      })
      showSourceVarModal.value = false
      msg.success('源变量已保存')
      chapters.value = []
      await init()
    } catch (err: unknown) {
      const msgStr = err instanceof Error ? err.message : String(err)
      msg.error('保存失败: ' + msgStr)
    }
  }

  async function saveBookVar(): Promise<void> {
    if (!source) return
    const value = bookVarInput.value.trim()
    try {
      const safeValue = JSON.stringify(value)
      await engine.executeJs(`java.put(${JSON.stringify(BOOK_VAR_KEY)}, ${safeValue})`, {
        source,
        baseUrl: source.bookSourceUrl || '',
        book: book || {},
        result: value,
      })
      showBookVarModal.value = false
      msg.success('书籍变量已保存')
      chapters.value = []
      await init()
    } catch (err: unknown) {
      const msgStr = err instanceof Error ? err.message : String(err)
      msg.error('保存失败: ' + msgStr)
    }
  }

  async function openCoverPicker(): Promise<void> {
    if (!book) return
    showCoverPicker.value = true
    coverPickerLoading.value = true
    coverOptions.value = []

    const currentCover = book?.customCoverUrl || book?.coverUrl || null

    // 先显示"默认封面"选项，不阻塞 UI
    coverOptions.value = [{
      coverUrl: null,
      label: '默认封面',
      sourceName: '默认封面',
      sourceIndex: -1,
      isCurrent: currentCover === null,
    }]
    coverPickerLoading.value = false

    try {
      const rawSources = await store.get('bookSource')
      const allSources = isBookSourceArray(rawSources) ? rawSources : []
      const enabledSources = allSources.filter((s) => s.enabled !== false && s.bookSourceType !== 2)
      const bookName = book.name

      const queue = [...enabledSources]
      const workerCount = Math.min(COVER_SEARCH_CONCURRENCY, queue.length)

      async function worker() {
        while (queue.length > 0) {
          const sourceItem = queue.shift()
          if (!sourceItem) break
          try {
            const { search } = await import('@/services/search.js')
            const searchBooks = await search(sourceItem, bookName, { page: 1 })
            if (searchBooks.length > 0) {
              const found = searchBooks.find((b) => b.name === bookName)
              if (found && found.coverUrl) {
                const newOption: CoverOption = {
                  coverUrl: found.coverUrl,
                  label: sourceItem.bookSourceName || '未知书源',
                  sourceName: sourceItem.bookSourceName || '未知书源',
                  sourceIndex: enabledSources.indexOf(sourceItem),
                  isCurrent: found.coverUrl === currentCover,
                }
                // 流式更新：每找到一个封面就立即添加到列表
                const existingIdx = coverOptions.value.findIndex(
                  (o) => o.coverUrl === found.coverUrl && o.sourceName === newOption.sourceName
                )
                if (existingIdx === -1) {
                  coverOptions.value = [...coverOptions.value, newOption]
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const workers: Promise<void>[] = []
      for (let i = 0; i < workerCount; i++) workers.push(worker())
      await Promise.all(workers)
    } catch (err: unknown) {
      const msgStr = err instanceof Error ? err.message : String(err)
      msg.error('加载封面失败: ' + msgStr)
    } finally {
      coverPickerLoading.value = false
    }
  }

  async function selectCover(item: CoverOption): Promise<void> {
    if (!book) return
    if (item.isCurrent) {
      showCoverPicker.value = false
      return
    }

    try {
      const updateFields: Partial<Book> = {}
      if (item.coverUrl !== null && item.coverUrl !== undefined) {
        updateFields.customCoverUrl = item.coverUrl
      }
      await bookshelfStore.updateBook(book.bookUrl, updateFields)
      book.customCoverUrl = item.coverUrl || undefined
      coverOptions.value = coverOptions.value.map((opt) => ({
        ...opt,
        isCurrent: opt.coverUrl === item.coverUrl && opt.sourceName === item.sourceName,
      }))
      msg.success('封面已更换')
      await init()
    } catch (err: unknown) {
      const msgStr = err instanceof Error ? err.message : String(err)
      msg.error('更换封面失败: ' + msgStr)
    }
  }

  function handleEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (showMoreMenu.value) {
        showMoreMenu.value = false
        return
      }
      if (book) {
        handleClose()
      }
    }
  }

  function handleClose(): void {
    showMoreMenu.value = false
  }

  function onDocumentClick(e: MouseEvent): void {
    if (showMoreMenu.value) {
      const target = e.target as HTMLElement
      if (!target.closest('.more-menu') && !target.closest('.btn-icon-footer')) {
        showMoreMenu.value = false
      }
    }
  }

  return {
    currentChapterId,
    hasReadingProgress,
    lastChapterId,
    isLoggedIn,
    showRemoveConfirm,
    showMoreMenu,
    showSourceVarModal,
    showBookVarModal,
    sourceVarInput,
    bookVarInput,
    showCoverPicker,
    coverPickerLoading,
    coverOptions,
    needsLogin,
    isInShelf,
    mainCover,
    fallbackCoverUrls,
    displayAuthor,
    displayIntro,
    fullIntroHtml,
    loadedKind: computed(() => safeString(loadedKind.value) || null),
    loadedWordCount: computed(() => safeString(loadedWordCount.value) || null),
    loadedLastChapter: computed(() => safeString(loadedLastChapter.value) || null),
    loadedIntro,
    chapters,
    loadingToc,
    showChangeSource,
    changeSourceResults,
    changingSource,
    searchDone,
    searchTotal,
    init,
    handleChapterClick,
    handleRead,
    handleAddToShelf,
    handleRemoveFromShelf,
    handleChangeSource,
    handleSearchForChange,
    handleConfirmChangeSource,
    handleSearchKind,
    toggleMoreMenu,
    handleLoginFromMenu,
    openSourceVar,
    openBookVar,
    openBookUrl,
    saveSourceVar,
    saveBookVar,
    openCoverPicker,
    selectCover,
    handleEscape,
    handleClose,
    onDocumentClick,
  }
}
