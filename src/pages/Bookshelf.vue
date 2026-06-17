<template>
  <div class="p-10">
    <div class="flex justify-between items-end mb-10">
      <div>
        <h2 class="font-display text-3xl font-bold text-ink dark:text-parchment">我的书架</h2>
        <p class="text-parchment-muted text-sm mt-2 tracking-wide">{{ filteredBooks.length }} / {{ books.length }} 本书</p>
      </div>
      <div class="flex gap-3 items-center">
        <button @click="triggerTxtInput" class="btn-secondary text-xs">导入 TXT</button>
        <select v-model="sortBy" class="select-styled text-xs">
          <option value="updated">最近阅读</option>
          <option value="name">书名 A-Z</option>
          <option value="author">作者 A-Z</option>
          <option value="newest">最近添加</option>
        </select>
        <input v-model="filterText" type="text" placeholder="筛选..."
          class="bg-transparent border-b border-parchment-muted/30 dark:border-ink-border px-2 py-1 text-xs text-parchment-dim outline-none focus:border-amber transition-colors w-36" />
        <button @click="loadBooks" class="btn-secondary text-xs">刷新</button>
      </div>
    </div>

    <div v-if="filteredBooks.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <div v-for="(book, idx) in filteredBooks" :key="book.id"
        class="group cursor-pointer transition-all duration-500 hover:-translate-y-2"
        :style="{ transitionDelay: idx * 40 + 'ms' }" @click="openBook(book)">
        <div class="aspect-[2/3] bg-ink-light dark:bg-ink-surface overflow-hidden relative">
          <img v-if="book.coverUrl" :src="book.coverUrl"
            class="w-full h-full object-cover transition-all duration-700 group-hover:saturate-[1.2]" />
          <div v-else class="w-full h-full flex flex-col items-center justify-center p-4">
            <span class="font-display text-3xl text-amber/50 mb-2">{{ book.name?.charAt(0) || '?' }}</span>
            <span class="font-reading text-xs text-parchment-muted text-center line-clamp-3">{{ book.name }}</span>
          </div>
          <div v-if="book.readProgress && book.readProgress > 0" class="absolute bottom-0 left-0 right-0 h-[2px] bg-ink/50">
            <div class="h-full bg-amber transition-all" :style="{ width: book.readProgress + '%' }"></div>
          </div>
        </div>
        <div class="mt-3">
          <h3 class="font-display text-sm font-semibold text-ink dark:text-parchment line-clamp-1 tracking-wide">{{ book.name }}</h3>
          <p class="text-parchment-muted text-xs mt-0.5">{{ book.author || '佚名' }}</p>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-24">
      <p class="font-display text-8xl text-parchment-muted/20 mb-8 italic">~</p>
      <p class="text-parchment-muted tracking-widest text-sm">{{ books.length === 0 ? '书 架 尚 空' : '无 匹 配' }}</p>
    </div>

    <input ref="txtInput" type="file" accept=".txt" @change="onTxtSelected" class="hidden" />

    <!-- 阅读器 -->
    <div v-if="currentBook" class="fixed inset-0 bg-ink/95 z-50 flex flex-col" @click.self="closeReader">
      <Reader
        :chapters="chapters"
        :current-chapter-index="chapterIndex"
        :content="content"
        @close="closeReader"
        @prev="prevChapter"
        @next="nextChapter"
        @progress="saveProgress"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Reader from './Reader.vue'
import {
  getBookshelf,
  addLocalTxtContent,
  updateReadingProgress,
  getReadingProgress,
  readLocalFile,
  getBookSources,
  type Book,
  type BookSource
} from '../api/tauri'
import { RuleEngine } from '../engine/ruleEngine'

interface BookWithProgress extends Book {
  readProgress?: number
}

const books = ref<BookWithProgress[]>([])
const sortBy = ref('updated')
const filterText = ref('')
const currentBook = ref<Book | null>(null)
const currentSource = ref<BookSource | null>(null)
const chapters = ref<any[]>([])
const chapterIndex = ref(0)
const content = ref('')
const txtInput = ref<HTMLInputElement | null>(null)
const sources = ref<BookSource[]>([])
const isPreloading = ref(false)

const filteredBooks = computed(() => {
  let result = [...books.value]
  const f = filterText.value.trim().toLowerCase()
  if (f) result = result.filter(b => b.name.toLowerCase().includes(f) || (b.author || '').toLowerCase().includes(f))
  if (sortBy.value === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  else if (sortBy.value === 'author') result.sort((a, b) => (a.author || '').localeCompare((b.author || ''), 'zh'))
  else if (sortBy.value === 'newest') result.sort((a, b) => (b.id || 0) - (a.id || 0))
  return result
})

async function loadBooks() {
  const raw = await getBookshelf()
  const withProgress = await Promise.all(raw.map(async (b) => {
    try {
      const p = await getReadingProgress(b.id!)
      return { ...b, readProgress: p?.scrollPosition || 0 }
    } catch {
      return { ...b, readProgress: 0 }
    }
  }))
  books.value = withProgress
  sources.value = await getBookSources()
}

function triggerTxtInput() { txtInput.value?.click() }

async function onTxtSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const name = file.name.replace(/\.txt$/i, '')
    await addLocalTxtContent(name, text)
    await loadBooks()
    alert(`已导入《${name}》`)
  } catch (err: any) {
    alert('导入失败: ' + err)
  }
  input.value = ''
}

async function openBook(book: Book) {
  currentBook.value = book
  chapterIndex.value = 0
  content.value = ''

  if (book.sourceId === 'local') {
    const filePath = book.bookUrl.replace('local://', '')
    chapters.value = [{ id: 1, title: book.name, url: filePath, index: 0 }]
    content.value = await readLocalFile(filePath)
    return
  }

  const source = sources.value.find(s => s.id === book.sourceId)
  if (!source) {
    alert('书源未找到')
    return
  }
  currentSource.value = source

  try {
    const tocUrl = book.tocUrl || book.bookUrl
    const toc = await RuleEngine.getToc(source, tocUrl)
    chapters.value = toc

    const progress = await getReadingProgress(book.id!)
    let startIndex = 0
    if (progress) {
      const idx = toc.findIndex((c: any) => c.id === progress.chapterId)
      if (idx !== -1) startIndex = idx
    }
    chapterIndex.value = startIndex

    await loadChapterContent()

    isPreloading.value = true
    RuleEngine.preloadChapters(source, toc, startIndex)
      .catch(err => console.warn('预加载失败:', err))
      .finally(() => { isPreloading.value = false })
  } catch (err) {
    console.error(err)
    alert('加载失败')
  }
}

async function loadChapterContent() {
  if (!currentBook.value || !chapters.value[chapterIndex.value]) return

  if (currentBook.value.sourceId === 'local') {
    content.value = await readLocalFile(chapters.value[chapterIndex.value].url)
    return
  }

  if (!currentSource.value) return

  try {
    content.value = await RuleEngine.getContent(currentSource.value, chapters.value[chapterIndex.value].url)
  } catch {
    content.value = '<p style="color:#8b3a3a">加载失败</p>'
  }

  if (currentBook.value.id) {
    await updateReadingProgress(
      currentBook.value.id,
      chapters.value[chapterIndex.value].id || 0,
      chapters.value[chapterIndex.value].title || '',
      0
    )
  }

  if (currentSource.value && chapters.value.length > 0) {
    RuleEngine.preloadChapters(currentSource.value, chapters.value, chapterIndex.value)
      .catch(err => console.warn('预加载失败:', err))
  }
}

async function prevChapter() {
  if (chapterIndex.value > 0) {
    chapterIndex.value--
    await loadChapterContent()
  }
}

async function nextChapter() {
  if (chapterIndex.value < chapters.value.length - 1) {
    chapterIndex.value++
    await loadChapterContent()
  }
}

async function saveProgress(chapterId: number, scrollPercent: number) {
  if (currentBook.value?.id) {
    await updateReadingProgress(
      currentBook.value.id,
      chapterId,
      chapters.value.find((c: any) => c.id === chapterId)?.title || '',
      Math.floor(scrollPercent * 100)
    )
  }
}

function closeReader() {
  currentBook.value = null
  chapters.value = []
  content.value = ''
  currentSource.value = null
}

function handleKeydown(e: KeyboardEvent) {
  if (!currentBook.value) return
  if (e.key === 'ArrowLeft' || e.key === 'h') prevChapter()
  if (e.key === 'ArrowRight' || e.key === 'l') nextChapter()
  if (e.key === 'Escape') closeReader()
}

onMounted(() => {
  loadBooks()
  window.addEventListener('keydown', handleKeydown)
})
</script>
