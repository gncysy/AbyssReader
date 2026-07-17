import { defineStore } from 'pinia'
import { store } from '@/api'
import { createBookProgress, getProgressFileName, type BookProgress } from '@shared/book-progress'

interface ReadingState {
  theme: string
  fontSize: number
  lineHeight: number
}

export const useReadingStore = defineStore('reading', {
  state: (): ReadingState => ({
    theme: 'system',
    fontSize: 18,
    lineHeight: 1.8,
  }),

  actions: {
    async loadSettings() {
      try {
        const saved = await store.get('readerSettings')
        if (saved) {
          this.theme = saved.theme || 'system'
          this.fontSize = saved.fontSize || 18
          this.lineHeight = saved.lineHeight || 1.8
        }
      } catch {
        this.theme = 'system'
        this.fontSize = 18
        this.lineHeight = 1.8
      }
    },

    async saveSettings() {
      await store.set('readerSettings', {
        theme: this.theme,
        fontSize: this.fontSize,
        lineHeight: this.lineHeight,
      })
    },

    setTheme(theme: string) {
      this.theme = theme
      this.saveSettings()
    },

    setFontSize(size: number) {
      this.fontSize = Math.max(12, Math.min(32, size))
      this.saveSettings()
    },

    setLineHeight(height: number) {
      this.lineHeight = Math.max(1.2, Math.min(2.8, height))
      this.saveSettings()
    },

    increaseFontSize() { this.setFontSize(this.fontSize + 1) },
    decreaseFontSize() { this.setFontSize(this.fontSize - 1) },
    increaseLineHeight() { this.setLineHeight(Math.round((this.lineHeight + 0.1) * 10) / 10) },
    decreaseLineHeight() { this.setLineHeight(Math.round((this.lineHeight - 0.1) * 10) / 10) },

    async saveProgress(
      bookUrl: string,
      name: string,
      author: string,
      chapterIndex: number,
      chapterPos: number,
      chapterTitle: string,
    ) {
      const progress = createBookProgress(name, author, chapterIndex, chapterPos, chapterTitle)
      const key = 'bookProgress_' + getProgressFileName(name, author)
      await store.set(key, progress)
    },

    async loadProgress(bookUrl: string, name: string, author: string): Promise<{ chapterId: number; chapterPos: number } | null> {
      const key = 'bookProgress_' + getProgressFileName(name, author)
      const progress = await store.get(key) as BookProgress | null
      if (progress) {
        return {
          chapterId: progress.durChapterIndex,
          chapterPos: progress.durChapterPos,
        }
      }
      return null
    },
  },
})
