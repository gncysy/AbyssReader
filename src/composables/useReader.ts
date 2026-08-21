// ============================================
// useReader — 阅读器 UI 状态
// ============================================

import { ref, computed } from 'vue'
import { useReaderStore } from '@/stores/reader.js'
import { READER } from '@/constants/reader.js'

const SCROLL_PERCENT_MULTIPLIER = 10000
const SAVE_DEBOUNCE_MS = 800

export function useReader(bookUrl: string, bookName: string, author: string) {
  const readerStore = useReaderStore()
  const showControls = ref(true)
  const fontSize = ref(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref(READER.LINE_HEIGHT_DEFAULT)
  // 修复：使用普通数组替代 Set，Vue 3 对普通数组的响应式支持更好
  const readChapterIds = ref<number[]>([])

  // 防抖保存进度
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSave: { chapterId: number; scrollPercent: number; chapterTitle: string } | null = null

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
      pendingSave = null
    }
  }

  function saveProgress(chapterId: number, scrollPercent: number, chapterTitle: string): Promise<void> {
    // 保存到 pending，防抖后写入
    pendingSave = { chapterId, scrollPercent, chapterTitle }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      flushPendingSave()
      saveTimer = null
    }, SAVE_DEBOUNCE_MS)

    // 返回一个已解析的 Promise，调用方不需要等待实际写入
    return Promise.resolve()
  }

  function markChapterRead(chapterId: number): void {
    if (!readChapterIds.value.includes(chapterId)) {
      readChapterIds.value = [...readChapterIds.value, chapterId]
      readerStore.incrementTodayReadCount()
    }
  }

  // 组件卸载时确保保存
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
