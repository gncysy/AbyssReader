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

    // ===== 保存阅读进度 =====
    async saveProgress(bookId: string, chapterId: number, chapterTitle: string, scrollPercent: number) {
      try {
        const progressKey = `reading_progress_${bookId}`
        const data = {
          chapterId,
          chapterTitle,
          scrollPercent,
          updatedAt: new Date().toISOString(),
        }
        console.log('[ReadingStore] 保存进度:', progressKey, data)
        await store.set(progressKey, data)
        
        // 同时保存到 books 数组中的 current_chapter_id
        const books = await store.get('books') || []
        const bookIndex = books.findIndex((b: any) => String(b.id) === String(bookId))
        if (bookIndex !== -1) {
          books[bookIndex].current_chapter_id = chapterId
          books[bookIndex].current_chapter_title = chapterTitle
          books[bookIndex].read_progress = scrollPercent
          await store.set('books', books)
          console.log('[ReadingStore] 更新书籍进度:', bookId, '章节:', chapterId)
        }
      } catch (err) {
        console.error('[ReadingStore] 保存进度失败:', err)
      }
    },

    // ===== 读取阅读进度 =====
    async loadProgress(bookId: string) {
      try {
        const progressKey = `reading_progress_${bookId}`
        const data = await store.get(progressKey)
        console.log('[ReadingStore] 读取进度:', progressKey, data)
        
        // 如果 reading_progress 中没有，尝试从 books 数组中读取
        if (!data) {
          const books = await store.get('books') || []
          const book = books.find((b: any) => String(b.id) === String(bookId))
          if (book && book.current_chapter_id !== undefined) {
            console.log('[ReadingStore] 从书籍数据恢复进度:', book.current_chapter_id)
            return {
              chapterId: book.current_chapter_id,
              chapterTitle: book.current_chapter_title || '',
              scrollPercent: book.read_progress || 0,
              updatedAt: book.updatedAt || new Date().toISOString(),
            }
          }
        }
        return data
      } catch (err) {
        console.error('[ReadingStore] 读取进度失败:', err)
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
