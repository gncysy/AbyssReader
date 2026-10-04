// ============================================
// useReader — 阅读器 UI 状态
// ============================================

import { ref, computed } from 'vue'
import { useReaderStore } from '@/stores/reader.js'
import { READER } from '@/constants/reader.js'

const SCROLL_PERCENT_MULTIPLIER = 10000
const SAVE_DEBOUNCE_MS = 800
// 修复：翻页时立即写入（不 debounce），滚动时 debounce
const IMMEDIATE_SAVE_ON_CHAPTER = true

export function useReader(bookUrl: string, bookName: string, author: string) {
  const readerStore = useReaderStore()
  const showControls = ref(true)
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  const readChapterIds = ref<Set<number>>(new Set())

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSave: { chapterId: number; scrollPercent: number; chapterTitle: string } | null = null
  let lastSavedChapterId: number | null = null

  const purifyEnabled = computed(() => {
    const settings = readerStore.getBookSettings(bookUrl)
    if (settings.useReplaceRule !== undefined && settings.useReplaceRule !== null) {
      return settings.useReplaceRule
    }
    return true
  })

  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearHideTimer(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  }

  function resetHideTimer(): void {
    clearHideTimer()
    hideTimer = setTimeout(() => { showControls.value = false }, READER.CONTROLS_HIDE_DELAY)
  }

  function toggleControls(): void {
    showControls.value = !showControls.value
    if (showControls.value) resetHideTimer()
  }

  function flushPendingSave(): void {
    if (pendingSave) {
      const { chapterId, scrollPercent, chapterTitle } = pendingSave
      const chapterPos = Math.round(scrollPercent * SCROLL_PERCENT_MULTIPLIER)
      readerStore.saveProgress(bookUrl, bookName, author, chapterId, chapterPos, chapterTitle)
        .catch(() => {})
      lastSavedChapterId = chapterId
      pendingSave = null
    }
  }

  /**
   * 保存进度。
   * 修复：章节切换时立即写入，避免翻页快时中间进度丢失。
   */
  function saveProgress(chapterId: number, scrollPercent: number, chapterTitle: string): Promise<void> {
    // 章节切换：立即 flush 旧进度
    if (IMMEDIATE_SAVE_ON_CHAPTER && lastSavedChapterId !== null && lastSavedChapterId !== chapterId) {
      flushPendingSave()
      // 立即写入新章节
      const chapterPos = Math.round(scrollPercent * SCROLL_PERCENT_MULTIPLIER)
      lastSavedChapterId = chapterId
      return readerStore.saveProgress(bookUrl, bookName, author, chapterId, chapterPos, chapterTitle)
        .catch(() => {})
    }

    // 同章节：debounce
    pendingSave = { chapterId, scrollPercent, chapterTitle }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      flushPendingSave()
      saveTimer = null
    }, SAVE_DEBOUNCE_MS)

    return Promise.resolve()
  }

  function markChapterRead(chapterId: number): void {
    if (!readChapterIds.value.has(chapterId)) {
      const next = new Set(readChapterIds.value)
      next.add(chapterId)
      readChapterIds.value = next
      readerStore.incrementTodayReadCount()
    }
  }

  function dispose(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    flushPendingSave()
  }

  return {
    showControls, fontSize, lineHeight, purifyEnabled, readChapterIds,
    clearHideTimer, resetHideTimer, toggleControls,
    saveProgress, markChapterRead, dispose,
  }
}
