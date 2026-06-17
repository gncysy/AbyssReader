import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Book } from '../api/tauri'

export const useReaderStore = defineStore('reader', () => {
  const currentBook = ref<Book | null>(null)
  const chapters = ref<any[]>([])
  const currentChapterIndex = ref(0)
  const content = ref('')
  const fontSize = ref(16)
  const lineHeight = ref(1.6)
  const isReaderOpen = ref(false)

  function openReader(book: Book) {
    currentBook.value = book
    isReaderOpen.value = true
  }

  function closeReader() {
    currentBook.value = null
    chapters.value = []
    currentChapterIndex.value = 0
    content.value = ''
    isReaderOpen.value = false
  }

  function setChapters(newChapters: any[]) {
    chapters.value = newChapters
  }

  function setChapterContent(html: string) {
    content.value = html
  }

  function setChapterIndex(index: number) {
    if (index >= 0 && index < chapters.value.length) {
      currentChapterIndex.value = index
    }
  }

  function nextChapter() {
    if (currentChapterIndex.value < chapters.value.length - 1) {
      currentChapterIndex.value++
      return true
    }
    return false
  }

  function prevChapter() {
    if (currentChapterIndex.value > 0) {
      currentChapterIndex.value--
      return true
    }
    return false
  }

  function getCurrentChapter(): any | null {
    return chapters.value[currentChapterIndex.value] || null
  }

  function setFontSize(size: number) {
    fontSize.value = Math.max(12, Math.min(32, size))
  }

  function setLineHeight(height: number) {
    lineHeight.value = Math.max(1.2, Math.min(2.5, height))
  }

  return {
    currentBook,
    chapters,
    currentChapterIndex,
    content,
    fontSize,
    lineHeight,
    isReaderOpen,
    openReader,
    closeReader,
    setChapters,
    setChapterContent,
    setChapterIndex,
    nextChapter,
    prevChapter,
    getCurrentChapter,
    setFontSize,
    setLineHeight,
  }
})
