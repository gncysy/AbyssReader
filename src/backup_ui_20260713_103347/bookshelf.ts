import { defineStore } from 'pinia'
import { store } from '@/api'
import type { Book } from '@shared/types'

export const useBookshelfStore = defineStore('bookshelf', {
  state: () => ({
    books: [] as Book[],
    loading: false,
    filterText: '',
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

    async addBook(book: Book) {
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

    // 批量添加书籍
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

    // 检查书籍是否已在书架
    hasBook(bookUrl: string): boolean {
      return this.books.some((b) => b.bookUrl === bookUrl)
    },

    // 获取书籍详情
    getBook(bookId: string | number): Book | undefined {
      return this.books.find((b) => b.id === bookId)
    },

    // 按书源分组
    getBooksBySource(): Record<string, Book[]> {
      const groups: Record<string, Book[]> = {}
      for (const book of this.books) {
        const key = book.sourceId || 'unknown'
        if (!groups[key]) groups[key] = []
        groups[key].push(book)
      }
      return groups
    },

    // 清空书架
    async clearAll() {
      this.books = []
      await this.saveBooks()
    },
  },
})
