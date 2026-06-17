import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Book } from '../api/tauri'

export const useBookshelfStore = defineStore('bookshelf', () => {
  const books = ref<Book[]>([])

  function setBooks(newBooks: Book[]) {
    books.value = newBooks
  }

  function addBook(book: Book) {
    if (!books.value.find(b => b.bookUrl === book.bookUrl)) {
      books.value.unshift(book)
    }
  }

  function removeBook(bookId: number) {
    books.value = books.value.filter(b => b.id !== bookId)
  }

  async function loadBooks() {
    console.log('loadBooks called')
    return books.value
  }

  return {
    books,
    setBooks,
    addBook,
    removeBook,
    loadBooks,
  }
})
