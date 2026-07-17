<template>
  <div class="bookshelf-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书架</h1>
        <p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <input v-model="searchText" type="text" placeholder="搜索书名..." class="input-search" />
        </div>
        <button class="btn-bs-secondary" @click="showAddUrlModal = true">添加网址</button>
        <button class="btn-bs-secondary" @click="triggerImport">导入 TXT</button>
        <button class="btn-bs-secondary" @click="refreshBooks">刷新</button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onImport" />

    <n-modal v-model:show="showAddUrlModal" preset="dialog" title="添加网址" positive-text="添加" @positive-click="addUrlBook">
      <div class="add-url-form">
        <div class="form-group">
          <label for="addUrlInput">书籍链接</label>
          <n-input id="addUrlInput" v-model:value="addUrl" placeholder="输入书籍详情页或目录页链接..." />
        </div>
        <div class="form-group">
          <label for="addUrlSource">选择书源</label>
          <select id="addUrlSource" v-model="addUrlSourceIndex" class="form-select">
            <option v-for="(source, idx) in sources" :key="idx" :value="idx">{{ source.bookSourceName || '未命名' }}</option>
          </select>
        </div>
      </div>
    </n-modal>

    <div v-if="bookshelfStore.loading" class="books-grid">
      <div v-for="i in 8" :key="i" class="book-card-skeleton">
        <div class="skeleton skeleton-cover"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-author"></div>
      </div>
    </div>

    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="books-grid">
      <div v-for="(book, idx) in bookshelfStore.filteredBooks" :key="book.bookUrl || idx" class="book-card" @click="openBook(idx)">
        <div class="book-cover">
          <img v-if="book.coverUrl && !book._coverFailed" :src="book.coverUrl" loading="lazy" @error="() => book._coverFailed = true" />
          <div v-if="!book.coverUrl || book._coverFailed" class="cover-placeholder">
            <div class="cover-overlay">
              <div class="cover-title">{{ book.name || '未命名' }}</div>
              <div class="cover-author">{{ book.author || '佚名' }}</div>
            </div>
          </div>
        </div>
        <div class="book-info">
          <h3 class="book-title-text">{{ book.name || '未命名' }}</h3>
          <p class="book-author-text">{{ book.author || '佚名' }}</p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        <path d="M12 6v7"/><path d="M9 9h6"/>
      </svg>
      <h3>书架空空如也</h3>
      <p>导入 TXT、添加网址或搜索添加书籍</p>
      <div class="empty-actions">
        <button class="btn-bs-primary" @click="triggerImport">导入 TXT</button>
        <button class="btn-bs-primary" @click="showAddUrlModal = true">添加网址</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { useBookshelfStore } from '@/store'
import { store, reader as readerApi } from '@/api'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()

const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showAddUrlModal = ref(false)
const addUrl = ref('')
const addUrlSourceIndex = ref(0)

watch(searchText, (val) => { bookshelfStore.setFilter(val) })

async function loadSources() {
  try { sources.value = await store.get('sources') || [] } catch (err: any) { console.error('加载书源失败:', err) }
}

async function refreshBooks() {
  await bookshelfStore.loadBooks()
  await loadSources()
  message.success('已刷新')
}

function triggerImport() { fileInput.value?.click() }

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    if (!text?.trim()) { message.warning('文件内容为空'); return }
    const name = file.name.replace(/\.txt$/i, '')
    const result = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks()
    message.success(`已导入《${result.name}》`)
  } catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = '' }
}

async function addUrlBook() {
  if (!addUrl.value.trim()) { message.warning('请输入书籍链接'); return }
  const source = sources.value[addUrlSourceIndex.value]
  if (!source) { message.error('请选择书源'); return }
  try {
    const clean = JSON.parse(JSON.stringify(source))
    const result = await window.electronAPI.engineGetBookInfo(clean, addUrl.value.trim())
    if (!result.success || !result.data) throw new Error(result.error || '获取书籍信息失败')
    const bookData = result.data
    const newBook = {
      ...bookData,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      origin: source.bookSourceUrl || source.url || '',
      originName: source.bookSourceName || source.name || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    const books = await store.get('books') || []
    books.unshift(newBook)
    await store.set('books', books)
    await bookshelfStore.loadBooks()
    message.success(`已添加《${newBook.name}》到书架`)
    showAddUrlModal.value = false; addUrl.value = ''
  } catch (err: any) { message.error('添加失败: ' + err.message) }
}

function openBook(index: number) {
  const book = bookshelfStore.filteredBooks[index]
  if (!book) return
  const source = sources.value.find(s => (s.bookSourceName || s.name) === book.originName)
  bookshelfStore.openDetail(book, source || null)
}

onMounted(() => { Promise.all([bookshelfStore.loadBooks(), loadSources()]) })
</script>

<style scoped>
.bookshelf-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input-search { width: 200px; }
.empty-actions { display: flex; gap: 12px; }
.add-url-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
</style>