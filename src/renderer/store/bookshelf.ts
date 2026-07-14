import { defineStore } from 'pinia'
import { store } from '@/api'
import type { Book, BookSource } from '@shared/types'

export const useBookshelfStore = defineStore('bookshelf', {
  state: () => ({
    books: [] as Book[],
    loading: false,
    filterText: '',
    // 详情浮窗状态
    showDetail: false,
    detailBook: null as Book | null,
    detailSource: null as BookSource | null,
    // 阅读器状态
    showReader: false,
    readerBook: null as Book | null,
    readerSource: null as BookSource | null,
  }),

  getters: {
    filteredBooks: (state) => {
      const filter = state.filterText.trim().toLowerCase()
      if (!filter) return state.books
      return state.books.filter(
        (b) =>
          b.name?.toLowerCase().includes(filter) ||
          b.author?.toLowerCase().includes(filter)
      )
    },
    totalCount: (state) => state.books.length,
  },

  actions: {
    // 加载书架
    async loadBooks() {
      this.loading = true
      try {
        const data = await store.get('books')
        this.books = data || []
      } catch (error) {
        console.error('[BookshelfStore] 加载失败:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    // 添加书籍
    async addBook(book: Book) {
    if (!book.sourceId) {
      console.warn('[BookshelfStore] 书籍缺少 sourceId，无法添加:', book.name)
      return false
    }
      const exists = this.books.find((b) => b.bookUrl === book.bookUrl)
      if (exists) return false

      const newBook: Book = {
        ...book,
        id: book.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: book.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      this.books.unshift(newBook)
      await this.saveBooks()
      return true
    },

    async removeBook(bookId: string | number) {
      this.books = this.books.filter((b) => b.id !== bookId)
      await this.saveBooks()
    },

    async updateBook(bookId: string | number, updates: Partial<Book>) {
      const idx = this.books.findIndex((b) => b.id === bookId)
      if (idx === -1) return
      this.books[idx] = {
        ...this.books[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      await this.saveBooks()
    },

    async saveBooks() {
      await store.set('books', this.books)
    },

    setFilter(text: string) {
      this.filterText = text
    },

    clearFilter() {
      this.filterText = ''
    },

    // 批量添加
    async addBooks(bookList: Book[]) {
      let added = 0
      for (const book of bookList) {
        const exists = this.books.find((b) => b.bookUrl === book.bookUrl)
        if (!exists) {
          const newBook: Book = {
            ...book,
            id: book.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            createdAt: book.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          this.books.unshift(newBook)
          added++
        }
      }
      if (added > 0) {
        await this.saveBooks()
      }
      return added
    },

    hasBook(bookUrl: string): boolean {
      return this.books.some((b) => b.bookUrl === bookUrl)
    },

    getBook(bookId: string | number): Book | undefined {
      return this.books.find((b) => b.id === bookId)
    },

    getBooksBySource(): Record<string, Book[]> {
      const groups: Record<string, Book[]> = {}
      for (const book of this.books) {
        const key = book.sourceId || 'unknown'
        if (!groups[key]) groups[key] = []
        groups[key].push(book)
      }
      return groups
    },

    async clearAll() {
      this.books = []
      await this.saveBooks()
    },

    // ===== 详情浮窗 =====
    openDetail(book: Book, source: BookSource | null) {
      this.detailBook = book
      this.detailSource = source
      this.showDetail = true
    },

    closeDetail() {
      this.showDetail = false
      this.detailBook = null
      this.detailSource = null
    },

    // ===== 阅读器 =====
    openReader(book: Book, source: BookSource | null) {
      this.readerBook = book
      this.readerSource = source
      this.showReader = true
    },

    closeReader() {
      this.showReader = false
      this.readerBook = null
      this.readerSource = null
      // 刷新书架（可能更新进度）
      this.loadBooks()
    },
  },
})

