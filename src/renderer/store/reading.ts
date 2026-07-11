import { defineStore } from 'pinia'
import { store } from '@/api'

export interface ReadingState {
  fontSize: number
  lineHeight: number
  theme: string
  currentBookId: string | null
  currentChapterIndex: number
  scrollPercent: number
}

export const useReadingStore = defineStore('reading', {
  state: (): ReadingState => ({
    fontSize: 18,
    lineHeight: 1.8,
    theme: 'dark',
    currentBookId: null,
    currentChapterIndex: 0,
    scrollPercent: 0,
  }),

  getters: {
    getFontSize: (state) => state.fontSize,
    getLineHeight: (state) => state.lineHeight,
    getTheme: (state) => state.theme,
  },

  actions: {
    setFontSize(size: number) {
      this.fontSize = Math.min(32, Math.max(12, size))
      this.saveSettings()
    },

    setLineHeight(height: number) {
      this.lineHeight = Math.min(2.8, Math.max(1.2, height))
      this.saveSettings()
    },

    setTheme(theme: string) {
      this.theme = theme
      this.saveSettings()
    },

    increaseFontSize() {
      this.setFontSize(this.fontSize + 1)
    },

    decreaseFontSize() {
      this.setFontSize(this.fontSize - 1)
    },

    increaseLineHeight() {
      this.setLineHeight(this.lineHeight + 0.1)
    },

    decreaseLineHeight() {
      this.setLineHeight(this.lineHeight - 0.1)
    },

    setCurrentBook(bookId: string) {
      this.currentBookId = bookId
    },

    setCurrentChapter(index: number) {
      this.currentChapterIndex = index
    },

    setScrollPercent(percent: number) {
      this.scrollPercent = percent
    },

    async saveSettings() {
      try {
        await store.set('readerSettings', {
          fontSize: this.fontSize,
          lineHeight: this.lineHeight,
          theme: this.theme,
        })
      } catch {}
    },

    async loadSettings() {
      try {
        const settings = await store.get('readerSettings')
        if (settings) {
          if (settings.fontSize) this.fontSize = settings.fontSize
          if (settings.lineHeight) this.lineHeight = settings.lineHeight
          if (settings.theme) this.theme = settings.theme
        }
      } catch {}
    },

    async saveProgress(bookId: string, chapterId: number, chapterTitle: string, scrollPercent: number) {
      try {
        await store.set(`reading_progress_${bookId}`, {
          chapterId,
          chapterTitle,
          scrollPercent,
          updatedAt: new Date().toISOString(),
        })
      } catch {}
    },

    async loadProgress(bookId: string) {
      try {
        return await store.get(`reading_progress_${bookId}`)
      } catch {
        return null
      }
    },

    reset() {
      this.currentBookId = null
      this.currentChapterIndex = 0
      this.scrollPercent = 0
    },
  },
})
