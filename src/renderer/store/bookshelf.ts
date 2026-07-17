import { defineStore } from 'pinia'
import { store } from '@/api'
import type { Book, BookSource } from '@shared/types'

export const useBookshelfStore = defineStore('bookshelf', {
  state: () => ({
    books: [] as Book[],
    loading: false,
    filterText: '',
    showDetail: false,
    detailBook: null as Book | null,
    detailSource: null as BookSource | null,
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
    async loadBooks() {
      this.loading = true
      try {
        const data = await store.get('books')
        this.books = data || []
      } catch (error) {
        console.error('[BookshelfStore] 加载失败:', error)
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

    async removeBook(index: number) {
      this.books.splice(index, 1)
      await this.saveBooks()
    },

    async removeBookByUrl(bookUrl: string) {
      this.books = this.books.filter((b) => b.bookUrl !== bookUrl)
      await this.saveBooks()
    },

    async updateBook(index: number, updates: Partial<Book>) {
      if (index < 0 || index >= this.books.length) return
      this.books[index] = {
        ...this.books[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      this.books = [...this.books]
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

    getBook(index: number): Book | undefined {
      return this.books[index]
    },

    getBookByUrl(bookUrl: string): Book | undefined {
      return this.books.find((b) => b.bookUrl === bookUrl)
    },

    async clearAll() {
      this.books = []
      await this.saveBooks()
    },

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

    openReader(book: Book, source: BookSource | null, chapters?: any[]) {
      this.readerBook = book
      this.readerSource = source
      this.showReader = true
    },

    closeReader() {
      this.showReader = false
      this.readerBook = null
      this.readerSource = null
      this.loadBooks()
    },
  },
})
