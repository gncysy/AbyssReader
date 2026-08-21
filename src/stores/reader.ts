import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/services'
import { READER } from '@/constants/reader.js'

const TODAY_KEY = 'todayReadDate'
const TODAY_COUNT_KEY = 'todayReadCount'

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadTodayCount(): number {
  try {
    const date = localStorage.getItem(TODAY_KEY)
    const today = getTodayStr()
    if (date === today) {
      return parseInt(localStorage.getItem(TODAY_COUNT_KEY) || '0', 10) || 0
    }
    localStorage.setItem(TODAY_KEY, today)
    localStorage.setItem(TODAY_COUNT_KEY, '0')
    return 0
  } catch {
    return 0
  }
}

function saveTodayCount(count: number): void {
  try {
    localStorage.setItem(TODAY_KEY, getTodayStr())
    localStorage.setItem(TODAY_COUNT_KEY, String(count))
  } catch {
    // ignore
  }
}

interface ReadingProgressRecord {
  bookUrl: string
  chapterId: number
  chapterPos: number
  chapterTitle: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isReadingProgressMap(value: unknown): value is Record<string, ReadingProgressRecord> {
  return isRecord(value)
}

function isBookSettingsMap(value: unknown): value is Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return false
  for (const v of Object.values(value)) {
    if (!isRecord(v)) return false
  }
  return true
}

export const useReaderStore = defineStore('reader', () => {
  const readerTheme = ref<string>(READER.FONT_SIZE_DEFAULT !== undefined ? 'dark' : 'dark')
  const fontSize = ref<number>(READER.FONT_SIZE_DEFAULT)
  const lineHeight = ref<number>(READER.LINE_HEIGHT_DEFAULT)
  const chineseConverterType = ref<number>(0)
  const reSegment = ref<boolean>(false)
  const todayReadCount = ref<number>(loadTodayCount())
  const loaded = ref<boolean>(false)
  const bookSettings = ref<Record<string, Record<string, unknown>>>({})

  let progressCache: Record<string, ReadingProgressRecord> | null = null

  async function loadSettings(): Promise<void> {
    try {
      const settingsRaw = await store.get('readerSettings')
      if (isRecord(settingsRaw)) {
        if (typeof settingsRaw.readerTheme === 'string') readerTheme.value = settingsRaw.readerTheme
        if (typeof settingsRaw.fontSize === 'number') fontSize.value = settingsRaw.fontSize
        if (typeof settingsRaw.lineHeight === 'number') lineHeight.value = settingsRaw.lineHeight
        if (typeof settingsRaw.chineseConverterType === 'number') chineseConverterType.value = settingsRaw.chineseConverterType
        if (typeof settingsRaw.reSegment === 'boolean') reSegment.value = settingsRaw.reSegment
      }
      const savedRaw = await store.get('bookReaderSettings')
      if (isBookSettingsMap(savedRaw)) {
        bookSettings.value = savedRaw
      }
    } catch {
      // ignore
    }
    todayReadCount.value = loadTodayCount()
    loaded.value = true
  }

  async function saveSettings(): Promise<void> {
    await store.set('readerSettings', {
      readerTheme: readerTheme.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      chineseConverterType: chineseConverterType.value,
      reSegment: reSegment.value,
    })
  }

  function saveBookSettings(bookUrl: string, settings: Record<string, unknown>): void {
    bookSettings.value = {
      ...bookSettings.value,
      [bookUrl]: settings,
    }
    store.set('bookReaderSettings', bookSettings.value).catch(() => {})
  }

  function getBookSettings(bookUrl: string): Record<string, unknown> {
    return bookSettings.value[bookUrl] || {}
  }

  function hasBookSettings(bookUrl: string): boolean {
    return !!bookSettings.value[bookUrl]
  }

  function clearBookSettings(bookUrl: string): void {
    if (bookSettings.value[bookUrl]) {
      delete bookSettings.value[bookUrl]
      store.set('bookReaderSettings', bookSettings.value).catch(() => {})
    }
  }

  function incrementTodayReadCount(): void {
    todayReadCount.value++
    saveTodayCount(todayReadCount.value)
  }

  function setReaderTheme(val: string): void {
    readerTheme.value = val
    saveSettings()
  }

  function setFontSize(val: number): void {
    fontSize.value = Math.max(READER.FONT_SIZE_MIN, Math.min(READER.FONT_SIZE_MAX, val))
    saveSettings()
  }

  function setLineHeight(val: number): void {
    lineHeight.value = Math.max(READER.LINE_HEIGHT_MIN, Math.min(READER.LINE_HEIGHT_MAX, val))
    saveSettings()
  }

  function increaseFontSize(): void { setFontSize(fontSize.value + 1) }
  function decreaseFontSize(): void { setFontSize(fontSize.value - 1) }
  function increaseLineHeight(): void { setLineHeight(lineHeight.value + 0.2) }
  function decreaseLineHeight(): void { setLineHeight(lineHeight.value - 0.2) }

  function setChineseConverterType(val: number): void {
    chineseConverterType.value = val
    saveSettings()
  }

  function setReSegment(val: boolean): void {
    reSegment.value = val
    saveSettings()
  }

  async function saveProgress(
    bookUrl: string,
    _bookName: string,
    _author: string,
    chapterId: number,
    chapterPos: number,
    chapterTitle: string,
  ): Promise<void> {
    if (!bookUrl) return
    try {
      if (!progressCache) {
        const raw = await store.get('readingProgress')
        progressCache = isReadingProgressMap(raw) ? raw : {}
      }
      progressCache[bookUrl] = {
        bookUrl,
        chapterId,
        chapterPos,
        chapterTitle,
        updatedAt: new Date().toISOString(),
      }
      await store.set('readingProgress', progressCache)
    } catch (e) {
      console.warn('[reader] saveProgress 失败:', e)
    }
  }

  async function loadProgress(
    bookUrl: string,
    _bookName?: string,
    _author?: string,
  ): Promise<ReadingProgressRecord | null> {
    if (!bookUrl) return null
    try {
      if (progressCache && progressCache[bookUrl] !== undefined) {
        return progressCache[bookUrl] || null
      }
      const raw = await store.get('readingProgress')
      if (isReadingProgressMap(raw)) {
        progressCache = raw
        return raw[bookUrl] || null
      }
    } catch (e) {
      console.warn('[reader] loadProgress 失败:', e)
    }
    return null
  }

  function resetProgressCache(): void {
    progressCache = null
  }

  return {
    readerTheme, fontSize, lineHeight, chineseConverterType, reSegment,
    todayReadCount, loaded, bookSettings,
    loadSettings, saveSettings, saveBookSettings, getBookSettings, hasBookSettings, clearBookSettings,
    setReaderTheme, setFontSize, setLineHeight,
    increaseFontSize, decreaseFontSize,
    increaseLineHeight, decreaseLineHeight,
    setChineseConverterType, setReSegment,
    incrementTodayReadCount,
    saveProgress, loadProgress, resetProgressCache,
  }
})
