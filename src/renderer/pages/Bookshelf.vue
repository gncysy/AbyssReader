<template>
  <div class="bookshelf-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书架</h1>
        <p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索书名..."
            class="input-search"
          />
        </div>
        <button class="btn-primary" @click="triggerImport">导入 TXT</button>
        <button class="btn-secondary" @click="bookshelfStore.loadBooks()">刷新</button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onImport" />

    <div v-if="bookshelfStore.loading" class="books-grid">
      <div v-for="i in 8" :key="i" class="book-card-skeleton">
        <div class="skeleton" style="aspect-ratio:2/3;border-radius:12px;"></div>
        <div class="skeleton" style="height:16px;width:80%;margin-top:12px;"></div>
        <div class="skeleton" style="height:12px;width:50%;margin-top:6px;"></div>
      </div>
    </div>

    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="books-grid">
      <div
        v-for="book in bookshelfStore.filteredBooks"
        :key="book.id"
        class="book-card"
        @click="openBook(book)"
      >
        <div class="book-cover">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            alt="封面"
            loading="lazy"
            @error="handleImageError"
          />
          <div v-else class="book-cover-placeholder">
            <span>{{ book.name?.charAt(0) || '?' }}</span>
          </div>
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ book.name || '未命名' }}</h3>
          <p class="book-author">{{ book.author || '佚名' }}</p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>书架空空如也</h3>
      <p>导入 TXT 文件或搜索添加书籍</p>
      <button class="btn-primary" @click="triggerImport">导入第一本书</button>
    </div>

    <Reader
      v-if="currentBook"
      :book="currentBook"
      :source="currentSource"
      @close="closeReader"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import Reader from '@/components/Reader.vue'
import { useBookshelfStore } from '@/store'
import { store, reader as readerApi } from '@/api'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()

const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const currentBook = ref<Book | null>(null)
const currentSource = ref<BookSource | null>(null)

// 同步搜索文本到 store
watch(searchText, (val) => {
  bookshelfStore.setFilter(val)
})

async function loadSources() {
  try {
    const sourceData = await store.get('sources')
    sources.value = sourceData || []
  } catch (err: any) {
    console.error('加载书源失败:', err)
  }
}

async function loadBooks() {
  await bookshelfStore.loadBooks()
}

function triggerImport() {
  fileInput.value?.click()
}

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    if (!text || text.trim().length === 0) {
      message.warning('文件内容为空')
      return
    }
    const name = file.name.replace(/\.txt$/i, '')
    const result = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks()
    message.success(`已导入《${result.name}》`)
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    input.value = ''
  }
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    const placeholder = parent.querySelector('.book-cover-placeholder')
    if (placeholder) {
      ;(placeholder as HTMLElement).style.display = 'flex'
    }
  }
}

function openBook(book: Book) {
  const source = sources.value.find(s => s.id === book.sourceId)
  currentBook.value = book
  currentSource.value = source || null
}

function closeReader() {
  currentBook.value = null
  currentSource.value = null
  bookshelfStore.loadBooks()
}

onMounted(() => {
  Promise.all([bookshelfStore.loadBooks(), loadSources()])
})
</script>

<style scoped>
/* 样式保持不变 */
.bookshelf-page {
  position: relative;
  z-index: 1;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-wrapper {
  position: relative;
}

.input-search {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  width: 200px;
  transition: border-color 0.2s;
}

.input-search:focus {
  border-color: var(--brand);
}

.input-search::placeholder {
  color: var(--text-muted);
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}

.book-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.book-card:hover {
  transform: translateY(-4px);
}

.book-cover {
  aspect-ratio: 2/3;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  position: relative;
}

.book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: var(--brand);
  background: var(--bg-hover);
}

.book-info {
  margin-top: 8px;
}

.book-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 20px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.hidden {
  display: none;
}

.book-card-skeleton .skeleton {
  background: var(--bg-card);
  border-radius: 4px;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}
</style>
