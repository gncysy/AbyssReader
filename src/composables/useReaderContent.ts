// ============================================
// useReaderContent — 阅读器正文内容管理
// ============================================

import { ref, computed, nextTick, watch } from 'vue'
import DOMPurify from 'isomorphic-dompurify'
import { useReaderStore, useBookshelfStore } from '@/stores'
import { useReplaceRuleStore } from '@/stores/replace-rules.js'
import { useChapterContent } from '@/composables/useChapterContent.js'
import { useDict } from '@/composables/useDict.js'
import { useReader } from '@/composables/useReader.js'
import { purifyText, textToHtml } from '@engine/business/content/purify.js'
import { loadSingleImage } from '@/services/comic.js'
import { engine } from '@/services/engine.js'
import type { Book, BookSource, Chapter } from '@/types'
import type TocPopup from '@/components/reader/TocPopup.vue'
import type ReaderSettings from '@/components/reader/ReaderSettings.vue'

const SELECTION_DELAY_MS = 300

interface ReaderContextMenuLike {
  open: (items: unknown[], x: number, y: number) => void
  close: () => void
}

export function useReaderContent(book: Book | null, source: BookSource | null, _initialChapters?: Chapter[]) {
  const readerStore = useReaderStore()
  const bookshelfStore = useBookshelfStore()
  const replaceRuleStore = useReplaceRuleStore()

  const { content, loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter, loadChaptersForBook, loadContent, startPreload, prevChapter: prevCh, nextChapter: nextCh } = useChapterContent()
  const { dictVisible, dictRules, dictActiveTab, dictLoading, dictContents, openDictPanel, switchDictTab } = useDict()
  const { showControls, lineHeight, clearHideTimer, resetHideTimer, toggleControls, saveProgress, markChapterRead, dispose } = useReader(book?.bookUrl || '', book?.name || '', book?.author || '')

  const tocPopupRef = ref<InstanceType<typeof TocPopup> | null>(null)
  const settingsRef = ref<InstanceType<typeof ReaderSettings> | null>(null)
  const readerCtxRef = ref<ReaderContextMenuLike | null>(null)
  const contentRef = ref<HTMLElement | null>(null)

  const isSelecting = ref(false)
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null
  let textSelectPending = false

  const rawTextContent = ref('')

  const currentBook = computed(() => {
    if (!book) return null
    const found = bookshelfStore.books.find((b) => b.bookUrl === book.bookUrl)
    return found || book
  })

  const purifyEnabled = computed(() => {
    const cfg = currentBook.value?.readConfig
    if (cfg && cfg.useReplaceRule !== undefined && cfg.useReplaceRule !== null) {
      return cfg.useReplaceRule
    }
    return true
  })

  const effectiveTheme = computed(() => {
    const cfg = currentBook.value?.readConfig
    if (cfg && cfg._useGlobal === false && typeof cfg._theme === 'string') return cfg._theme
    return readerStore.readerTheme
  })

  const effectiveFontSize = computed(() => {
    const cfg = currentBook.value?.readConfig
    if (cfg && cfg._useGlobal === false && typeof cfg._fontSize === 'number') return cfg._fontSize
    return readerStore.fontSize
  })

  const effectiveLineHeight = computed(() => lineHeight.value)

  const effectiveReSegment = computed(() => {
    const cfg = currentBook.value?.readConfig
    if (cfg && cfg._useGlobal === false && typeof cfg.reSegment === 'boolean') return cfg.reSegment
    return readerStore.reSegment
  })

  async function convertText(text: string): Promise<string> {
    if (readerStore.chineseConverterType === 0 || !text) return text
    const fnName = readerStore.chineseConverterType === 1 ? 'java.t2s' : 'java.s2t'
    try {
      const result = await engine.executeJs(fnName + '(result)', {
        result: text,
        baseUrl: '',
        book: {},
        source: {},
      })
      return result || text
    } catch {
      return text
    }
  }

  async function reprocessCurrentContent(): Promise<void> {
    if (!rawTextContent.value) return
    if (isComic.value) return

    let processed = rawTextContent.value
    if (readerStore.chineseConverterType !== 0) {
      processed = await convertText(processed)
    }

    const purifyOptions = {
      chapterTitle: currentChapter.value?.title || '',
      bookName: currentBook.value?.name || '',
      reSegmentEnabled: effectiveReSegment.value,
      purifyEnabled: purifyEnabled.value,
      rules: replaceRuleStore.rules
    }
    const purified = purifyEnabled.value ? purifyText(processed, purifyOptions) : processed
    content.value = textToHtml(purified)
  }

  const sanitizedContent = computed(() => {
    if (!content.value || isComic.value) return ''
    return DOMPurify.sanitize(content.value, {
      ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','img','a','blockquote','pre','code','ul','ol','li'],
      ALLOWED_ATTR: ['href','src','alt','title','style']
    })
  })

  function openToc(): void { tocPopupRef.value?.open(currentChapter.value?.id ?? null) }

  function openSettings(): void {
    settingsRef.value?.open(null, book?.bookUrl || '')
  }

  function onTocSelect(ch: Chapter): void {
    tocPopupRef.value?.close()
    const idx = chapters.value.findIndex((c) => c.id === ch.id)
    if (idx === -1) return
    saveProgress(currentChapter.value?.id ?? 0, scrollPercent.value, currentChapter.value?.title || '').then(() => {
      chapterIndex.value = idx
      scrollPercent.value = 0
      loadChapter().catch(() => {})
    })
  }

  function handleContentClick(): void {
    const sel = window.getSelection()
    if (sel && sel.toString().trim()) return
    toggleControls()
  }

  function handleScroll(): void {
    const el = contentRef.value
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    scrollPercent.value = Math.min(1, Math.max(0, el.scrollTop / max))
  }

  function handleTextSelect(): void {
    if (textSelectPending) return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || !sel?.rangeCount) { isSelecting.value = false; return }
    textSelectPending = true
    isSelecting.value = true
    if (selectionTimeout) clearTimeout(selectionTimeout)
    selectionTimeout = setTimeout(() => {
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        readerCtxRef.value?.open([], rect.left + rect.width / 2, rect.bottom + 6)
      }
      isSelecting.value = false
      textSelectPending = false
      selectionTimeout = null
    }, SELECTION_DELAY_MS)
  }

  function clearSelectionState(): void {
    const sel = window.getSelection()
    sel?.removeAllRanges()
    isSelecting.value = false
    textSelectPending = false
    if (selectionTimeout) { clearTimeout(selectionTimeout); selectionTimeout = null }
  }

  function copySelectionFromCtx(): void {
    const sel = window.getSelection()
    const text = sel?.toString() || ''
    if (text) navigator.clipboard.writeText(text)
    readerCtxRef.value?.close()
    clearSelectionState()
  }

  function openDictFromCtx(): void {
    readerCtxRef.value?.close()
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text) openDictPanel(text)
    clearSelectionState()
  }

  async function loadChapter(forceRefresh = false): Promise<void> {
    if (!book || !source) return
    await loadContent(book, source, purifyEnabled.value, effectiveReSegment.value, currentBook.value?.name || '', replaceRuleStore.rules, forceRefresh)
    rawTextContent.value = content.value || ''
    await reprocessCurrentContent()

    if (currentChapter.value) {
      markChapterRead(currentChapter.value.id)
      startPreload(book, source, purifyEnabled.value, effectiveReSegment.value, currentBook.value?.name || '', replaceRuleStore.rules)
    }
    await nextTick()
    const el = contentRef.value
    if (el) el.scrollTop = 0
    scrollPercent.value = 0
  }

  async function prevChapter(): Promise<void> {
    await saveProgress(currentChapter.value?.id ?? 0, scrollPercent.value, currentChapter.value?.title || '')
    prevCh()
    await loadChapter()
  }

  async function nextChapter(): Promise<void> {
    await saveProgress(currentChapter.value?.id ?? 0, scrollPercent.value, currentChapter.value?.title || '')
    nextCh()
    await loadChapter()
  }

  function retryComicImage(index: number): void {
    const item = comicImages.value[index]
    if (!item || item.status !== 'error') return
    item.retries = 3
    item.status = 'loading'
    loadSingleImage(item, JSON.stringify(source || {}), (book?.bookUrl || 'default') + '/' + (currentChapter.value?.id || 0))
  }

  async function handleClose(): Promise<void> {
    await saveProgress(currentChapter.value?.id ?? 0, scrollPercent.value, currentChapter.value?.title || '')
    // 立即 flush pending 的进度保存
    dispose()
    clearSelectionState()
    readerCtxRef.value?.close()
  }

  function handleKeydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevChapter() }
    if (e.key === 'ArrowRight') { e.preventDefault(); nextChapter() }
    if (e.key === 'Escape') { e.preventDefault(); handleClose() }
  }

  watch(
    () => readerStore.chineseConverterType,
    () => {
      if (rawTextContent.value && !loadingContent.value && !isComic.value) {
        reprocessCurrentContent()
      }
    }
  )

  watch(
    () => [readerStore.reSegment, purifyEnabled.value],
    () => {
      if (rawTextContent.value && !loadingContent.value && !isComic.value) {
        reprocessCurrentContent()
      }
    }
  )

  return {
    content, loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter,
    dictVisible, dictRules, dictActiveTab, dictLoading, dictContents, showControls,
    effectiveTheme, effectiveFontSize, effectiveLineHeight, sanitizedContent,
    tocPopupRef, settingsRef, readerCtxRef, contentRef,
    loadChaptersForBook, loadChapter, startPreload,
    prevChapter, nextChapter, retryComicImage, handleClose, handleKeydown,
    openToc, openSettings, onTocSelect, handleContentClick, handleScroll, handleTextSelect,
    copySelectionFromCtx, openDictFromCtx, switchDictTab,
    clearHideTimer, resetHideTimer, purifyEnabled, dispose,
  }
}
