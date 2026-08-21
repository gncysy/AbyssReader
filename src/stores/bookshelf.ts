import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Book, BookSource } from '@/types'
import { store } from '@/services'

function isBookArray(value: unknown): value is Book[] {
  return Array.isArray(value)
}

export const useBookshelfStore = defineStore('bookshelf', () => {
  const books = ref<Book[]>([])
  const loading = ref(false)
  const filterText = ref('')
  const activeGroup = ref<number>(0)
  const showDetail = ref(false)
  const detailBook = ref<Book | null>(null)
  const detailSource = ref<BookSource | null>(null)
  const showReader = ref(false)
  const readerBook = ref<Book | null>(null)
  const readerSource = ref<BookSource | null>(null)
  const readerChapters = ref<unknown[]>([])

  const filteredBooks = computed(() => {
    let result = books.value
    if (filterText.value.trim()) {
      const kw = filterText.value.trim().toLowerCase()
      result = result.filter((b) =>
        (b.name || '').toLowerCase().includes(kw) ||
        (b.author || '').toLowerCase().includes(kw)
      )
    }
    if (activeGroup.value > 0) {
      result = result.filter((b) => ((b.group || 0) & activeGroup.value) === activeGroup.value)
    }
    return result
  })

  async function loadBooks(): Promise<void> {
    loading.value = true
    try {
      const raw = await store.get('bookshelf')
      books.value = isBookArray(raw) ? raw : []
    } catch {
      books.value = []
    } finally {
      loading.value = false
    }
  }

  function setFilter(text: string): void {
    filterText.value = text
  }

  function setActiveGroup(groupId: number): void {
    activeGroup.value = groupId
  }

  function hasBook(bookUrl: string): boolean {
    return books.value.some((b) => b.bookUrl === bookUrl)
  }

  async function addBook(book: Book): Promise<boolean> {
    if (hasBook(book.bookUrl)) return false
    const raw = await store.get('bookshelf')
    const all = isBookArray(raw) ? [...raw] : []
    const newBook: Book = {
      ...book,
      group: book.group || 0,
      order: book.order || 0,
      durChapterIndex: book.durChapterIndex || 0,
      durChapterPos: book.durChapterPos || 0,
      durChapterTime: book.durChapterTime || 0,
      canUpdate: book.canUpdate !== false,
      lastCheckTime: book.lastCheckTime || 0,
      lastCheckCount: book.lastCheckCount || 0,
      totalChapterNum: book.totalChapterNum || 0,
      type: book.type || 8,
    }
    all.unshift(newBook)
    await store.set('bookshelf', all)
    books.value = all
    return true
  }

  async function removeBookByUrl(bookUrl: string): Promise<void> {
    const raw = await store.get('bookshelf')
    const all = isBookArray(raw) ? [...raw] : []
    const filtered = all.filter((b) => b.bookUrl !== bookUrl)
    await store.set('bookshelf', filtered)
    books.value = filtered
  }

  async function updateBook(bookUrl: string, fields: Partial<Book>): Promise<void> {
    const raw = await store.get('bookshelf')
    const all = isBookArray(raw) ? [...raw] : []
    const index = all.findIndex((b) => b.bookUrl === bookUrl)
    if (index !== -1) {
      const existing = all[index]
      if (existing) {
        all[index] = { ...existing, ...fields }
      }
      await store.set('bookshelf', all)
      books.value = all
      if (detailBook.value && detailBook.value.bookUrl === bookUrl) {
        detailBook.value = { ...detailBook.value, ...fields }
      }
    }
  }

  async function moveBookToGroup(bookUrl: string, groupId: number): Promise<void> {
    const book = books.value.find((b) => b.bookUrl === bookUrl)
    if (!book) return
    await updateBook(bookUrl, { group: groupId })
  }

  async function updateBookKind(bookUrl: string, kind: string): Promise<void> {
    await updateBook(bookUrl, { kind })
  }

  function getBookKind(bookUrl: string): string {
    if (detailBook.value && detailBook.value.bookUrl === bookUrl && detailBook.value.kind) {
      return detailBook.value.kind
    }
    const found = books.value.find((b) => b.bookUrl === bookUrl)
    return found?.kind || ''
  }

  function openDetail(book: Book, source: BookSource | null): void {
    detailBook.value = book
    detailSource.value = source
    showDetail.value = true
  }

  function closeDetail(): void {
    showDetail.value = false
    detailBook.value = null
  }

  function openReader(book: Book, source: BookSource | null, chapters?: unknown[]): void {
    readerBook.value = book
    readerSource.value = source
    readerChapters.value = chapters || []
    showReader.value = true
  }

  function closeReader(): void {
    showReader.value = false
    readerBook.value = null
    readerChapters.value = []
  }

  return {
    books, loading, filterText, activeGroup, filteredBooks,
    showDetail, detailBook, detailSource,
    showReader, readerBook, readerSource, readerChapters,
    loadBooks, setFilter, setActiveGroup, hasBook, addBook, removeBookByUrl,
    updateBook, updateBookKind, getBookKind, moveBookToGroup,
    openDetail, closeDetail, openReader, closeReader,
  }
})
