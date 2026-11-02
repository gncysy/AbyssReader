// ============================================
// useReaderContent — 阅读器正文内容管理
//
// 对齐 Legado ContentProcessor.getContent 的处理流程：
// 1. preprocessContent（去重标题 → reSegment → 简繁转换 → trim）
// 2. applyReplaceRules（单循环替换，受净化开关控制）
// 3. textToHtml
// ============================================

import { ref, computed, nextTick, watch, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { useReaderStore, useBookshelfStore } from '@/stores'
import { useReplaceRuleStore } from '@/stores/replace-rules.js'
import { useChapterContent } from '@/composables/useChapterContent.js'
import { useDict } from '@/composables/useDict.js'
import { useReader } from '@/composables/useReader.js'
import { preprocessContent, applyReplaceRules, textToHtml } from '@engine/business/content/purify.js'
import { MIN_RESTORE_PERCENT, clampScrollPercent } from '@/utils/reading-position.js'
import { loadSingleImage } from '@/services/comic.js'
import { engine } from '@/services/engine.js'
import { getRegexWorkerPool } from '@/services/regex-worker.js'
import type { Book, BookSource, Chapter } from '@/types'
import type TocPopup from '@/components/reader/TocPopup.vue'
import type ReaderSettings from '@/components/reader/ReaderSettings.vue'

const SELECTION_DELAY_MS = 300
// 恢复位置后继续校正的时长：正文图片异步加载会改变内容高度，
// 超时后不再接管滚动，避免和用户操作冲突。
const RESTORE_TIMEOUT_MS = 6000

interface ReaderContextMenuLike {
  open: (items: unknown[], x: number, y: number) => void
  close: () => void
}

export function useReaderContent(book: Book | null, source: BookSource | null, _initialChapters?: Chapter[]) {
  const message = useMessage()
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
  const refreshingChapter = ref(false)
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null
  let textSelectPending = false

  // 滚动位置恢复期间，用 ResizeObserver 校正异步内容（如封面/插图）造成的高度变化。
  let cancelScrollRestore: (() => void) | null = null
  // 章节内容与位置就绪前，不把中间态的 scrollPercent 写进阅读进度。
  let progressTrackingReady = false

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

  // 段落间距以 em 存储，随字号缩放；本书独立配置优先于全局。
  const effectiveParagraphSpacing = computed(() => {
    const cfg = currentBook.value?.readConfig
    if (cfg && cfg._useGlobal === false && typeof cfg._paragraphSpacing === 'number') {
      return cfg._paragraphSpacing
    }
    return readerStore.paragraphSpacing
  })

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

    const ch = currentChapter.value
    const bk = currentBook.value

    // 阶段 1：预处理（不受净化开关控制）
    const preprocessed = await preprocessContent(rawTextContent.value, {
      chapterTitle: ch?.title || '',
      bookName: bk?.name || '',
      reSegmentEnabled: effectiveReSegment.value,
      convertFn: readerStore.chineseConverterType !== 0
        ? (t) => convertText(t)
        : null,
    })

    // 阶段 2：替换（受净化开关控制）
    let processed = preprocessed
    if (purifyEnabled.value) {
      processed = await applyReplaceRules(preprocessed, {
        rules: replaceRuleStore.rules,
        replaceContext: {
          chapterTitle: ch?.title || '',
          bookName: bk?.name || '',
          chapter: ch,
          book: bk,
        },
        jsExecutor: async (jsCode, matched, ctx) => {
          return engine.executeJsStrict(jsCode, {
            result: matched,
            chapter: ctx.chapter || {},
            book: ctx.book || {},
          })
        },
        findMatches: (text, pattern, flags) => getRegexWorkerPool().findMatches(text, pattern, flags),
      })
    }

    content.value = textToHtml(processed)
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

  function stopScrollRestore(): void {
    const cancel = cancelScrollRestore
    cancelScrollRestore = null
    if (cancel) cancel()
  }

  function applyScrollPercent(el: HTMLElement, percent: number): boolean {
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return false
    el.scrollTop = percent * max
    scrollPercent.value = clampScrollPercent(el.scrollTop / max)
    return true
  }

  /**
   * 把正文滚动容器定位到 percent（0~1）。
   *
   * 首次下一帧内容可能还没排版完（max <= 0），这里逐帧等待；
   * 恢复期间图片加载会撑高内容，用 ResizeObserver 持续校正。
   * 用户一旦滚动、按键或点击就停止校正，避免和用户抢滚动条。
   */
  async function restoreScrollPosition(percent: number): Promise<void> {
    stopScrollRestore()

    const target = clampScrollPercent(percent)
    let el = contentRef.value
    // 正常情况下 nextTick 后引用已经就绪；这里再兜底等两帧。
    for (let frame = 0; !el && frame < 2; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      el = contentRef.value
    }
    if (!el) {
      scrollPercent.value = 0
      return
    }
    if (target < MIN_RESTORE_PERCENT) {
      el.scrollTop = 0
      scrollPercent.value = 0
      return
    }

    scrollPercent.value = target

    let stopped = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let observer: ResizeObserver | null = null

    const cleanup = (): void => {
      if (stopped) return
      stopped = true
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
      window.removeEventListener('wheel', onUserIntent, true)
      window.removeEventListener('touchstart', onUserIntent, true)
      window.removeEventListener('keydown', onUserIntent, true)
      window.removeEventListener('pointerdown', onUserIntent, true)
      observer?.disconnect()
      observer = null
      if (cancelScrollRestore === cleanup) cancelScrollRestore = null
    }

    function onUserIntent(): void { cleanup() }

    const sync = (): void => {
      if (stopped) return
      applyScrollPercent(el, target)
    }

    cancelScrollRestore = cleanup

    if (typeof ResizeObserver !== 'undefined') {
      const contentEl = el.firstElementChild
      if (contentEl) {
        observer = new ResizeObserver(sync)
        observer.observe(contentEl)
      }
    }

    // pointerdown 挂在 window 上，右侧自定义滚动条的拖动也能停止恢复。
    window.addEventListener('wheel', onUserIntent, { capture: true, passive: true })
    window.addEventListener('touchstart', onUserIntent, { capture: true, passive: true })
    window.addEventListener('keydown', onUserIntent, true)
    window.addEventListener('pointerdown', onUserIntent, true)

    // 等最多两帧让正文完成排版。若内容暂时不足一屏（max <= 0），
    // 不在这里阻塞，后续图片撑高内容时由 ResizeObserver 再定位。
    for (let frame = 0; frame < 2 && !stopped; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (applyScrollPercent(el, target)) break
    }

    if (!stopped) {
      applyScrollPercent(el, target)
      timeoutId = setTimeout(cleanup, RESTORE_TIMEOUT_MS)
    }
  }

  function handleTextSelect(): void {
    if (textSelectPending) return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || !sel || sel.rangeCount === 0) { isSelecting.value = false; return }
    textSelectPending = true
    isSelecting.value = true
    if (selectionTimeout) clearTimeout(selectionTimeout)
    selectionTimeout = setTimeout(() => {
      if (sel.rangeCount === 0) {
        isSelecting.value = false
        textSelectPending = false
        selectionTimeout = null
        return
      }
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

  /**
   * 加载当前章节正文。
   * @param forceRefresh 是否忽略缓存重新抓取
   * @param restorePercent 章节内需要恢复的位置（0~1），默认从章节开头显示
   */
  async function loadChapter(forceRefresh = false, restorePercent = 0): Promise<void> {
    if (!book || !source) return
    progressTrackingReady = false
    await loadContent(book, source, purifyEnabled.value, effectiveReSegment.value, currentBook.value?.name || '', replaceRuleStore.rules, forceRefresh)
    rawTextContent.value = content.value || ''
    await reprocessCurrentContent()

    if (currentChapter.value) {
      markChapterRead(currentChapter.value.id)
      startPreload(book, source, purifyEnabled.value, effectiveReSegment.value, currentBook.value?.name || '', replaceRuleStore.rules)
    }
    await nextTick()
    await restoreScrollPosition(restorePercent)
    progressTrackingReady = true
  }

  /**
   * 重新抓取当前章节：清缓存 + 重新走网络，用于正文残缺、
   * 加载失败或站点内容更新后手动刷新。
   */
  async function refreshChapter(): Promise<void> {
    if (!book || !source) return
    if (loadingContent.value || refreshingChapter.value) return
    if (!currentChapter.value) return

    refreshingChapter.value = true
    try {
      await loadChapter(true)
      if (content.value && !content.value.includes('加载章节失败')) {
        message.success('本章已刷新')
      }
    } catch {
      message.error('刷新失败，请稍后重试')
    } finally {
      refreshingChapter.value = false
    }
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
    // 章节还没加载/定位完成就关闭时，不要用临时的 0 覆盖已有进度。
    const canSave = progressTrackingReady
    stopScrollRestore()
    if (canSave) {
      await saveProgress(currentChapter.value?.id ?? 0, scrollPercent.value, currentChapter.value?.title || '')
    }
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

  // 滚动过程中也持续落盘（useReader 内 800ms debounce）。
  // 这样即使用户直接关闭窗口、没有触发 handleClose，也能恢复到最近位置。
  watch(scrollPercent, (percent) => {
    if (!progressTrackingReady || loadingContent.value) return
    const ch = currentChapter.value
    if (!ch) return
    saveProgress(ch.id, percent, ch.title || '')
  })

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

  onUnmounted(() => {
    stopScrollRestore()
    if (selectionTimeout) { clearTimeout(selectionTimeout); selectionTimeout = null }
  })

  return {
    content, loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter,
    dictVisible, dictRules, dictActiveTab, dictLoading, dictContents, showControls,
    effectiveTheme, effectiveFontSize, effectiveLineHeight, effectiveParagraphSpacing, sanitizedContent,
    tocPopupRef, settingsRef, readerCtxRef, contentRef,
    loadChaptersForBook, loadChapter, startPreload,
    refreshChapter, refreshingChapter,
    prevChapter, nextChapter, retryComicImage, handleClose, handleKeydown,
    openToc, openSettings, onTocSelect, handleContentClick, handleScroll, handleTextSelect,
    copySelectionFromCtx, openDictFromCtx, switchDictTab,
    clearHideTimer, resetHideTimer, purifyEnabled, dispose,
  }
}
