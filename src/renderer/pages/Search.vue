<template>
  <div class="search-page">
    <header class="page-header">
      <h1 class="page-title">搜索</h1>
      <p class="page-subtitle">多书源并发搜索</p>
    </header>

    <div class="search-bar">
      <input
        ref="searchInput"
        v-model="keyword"
        type="text"
        placeholder="输入书名或作者..."
        class="search-input"
        @keydown.enter="doSearch"
      />
      <div class="search-actions">
        <button class="btn-search-primary" :disabled="loading || !keyword.trim()" @click="doSearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button class="btn-search-secondary" @click="clearResults">清空</button>
      </div>
    </div>

    <div v-if="loading" class="search-progress">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: (completedCount / totalSources * 100) + '%' }"></div></div>
      <span class="progress-text">{{ completedCount }} / {{ totalSources }}</span>
      <button class="btn-cancel-search" @click="cancelSearch">取消</button>
    </div>

    <div v-if="resultKeys.length > 0" class="results">
      <div v-for="key in resultKeys" :key="key" class="result-group">
        <div class="group-header"><h3>{{ key }}</h3><span>{{ searchResults[key]?.length || 0 }} 本</span></div>
        <div class="books-grid">
          <div v-for="book in searchResults[key]" :key="book.bookUrl" class="book-card" @click="openBookDetail(book, key)">
            <div class="book-cover">
              <img v-if="book.coverUrl" :src="book.coverUrl" loading="lazy" @error="handleImageError" />
              <div v-else class="cover-placeholder">
                <div class="cover-overlay"><div class="cover-title">{{ book.name || '未命名' }}</div><div class="cover-author">{{ book.author || '佚名' }}</div></div>
              </div>
            </div>
            <div class="book-info"><h4>{{ book.name || '未命名' }}</h4><p>{{ book.author || '佚名' }}</p></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="searched && !loading" class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>
      <h3>未找到相关书籍</h3>
      <p>试试其他关键词</p>
    </div>

    <div v-else class="empty-state initial">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="12" cy="8" r="2"/><path d="M12 11v4"/></svg>
      <h3>输入关键词开始搜索</h3>
      <p>支持书名、作者搜索，多书源并发</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/api'
import { useBookshelfStore } from '@/store'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const sources = ref<BookSource[]>([])
const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const completedCount = ref(0)
const totalSources = ref(0)
const searchResults = ref<Record<string, Book[]>>({})
const searchInput = ref<HTMLInputElement | null>(null)

let isActive = true
let currentSearchId = ''
let unlistenProgress: (() => void) | null = null

const resultKeys = computed(() => Object.keys(searchResults.value).filter(k => searchResults.value[k]?.length > 0))

async function loadSources() { try { sources.value = await store.get('sources') || [] } catch {} }

function clearResults() { searchResults.value = {}; searched.value = false; completedCount.value = 0; totalSources.value = 0 }

async function cancelSearch() {
  if (currentSearchId) { await window.electronAPI.searchAbort(currentSearchId); currentSearchId = '' }
  loading.value = false
  if (unlistenProgress) { unlistenProgress(); unlistenProgress = null }
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) { message.warning('请输入关键词'); searchInput.value?.focus(); return }

  const enabled = sources.value.filter(s => s.enabled)
  if (!enabled.length) { message.warning('没有已启用的书源'); return }

  await cancelSearch()
  loading.value = true; searched.value = true; completedCount.value = 0; totalSources.value = enabled.length; searchResults.value = {}

  const cleanSources = enabled.map(s => JSON.parse(JSON.stringify(s)))
  const addedUrls: Record<string, Set<string>> = {}

  unlistenProgress = window.electronAPI.on('search-progress', (data: any) => {
    if (!isActive || !loading.value) return
    completedCount.value = data.completed
    if (data.books?.length) {
      const key = data.sourceName || `书源${data.index + 1}`
      if (!addedUrls[key]) addedUrls[key] = new Set()
      const existing = searchResults.value[key] || []
      const newBooks = data.books.filter((b: any) => !addedUrls[key].has(b.bookUrl))
      newBooks.forEach((b: any) => addedUrls[key].add(b.bookUrl))
      if (newBooks.length) {
        searchResults.value = { ...searchResults.value, [key]: [...existing, ...newBooks.map((b: any) => ({
          id: b.id, name: b.name || '未命名', author: b.author || '佚名', coverUrl: b.coverUrl || null,
          intro: b.intro || null, kind: b.kind || null, lastChapter: b.lastChapter || null,
          bookUrl: b.bookUrl, tocUrl: b.tocUrl || null, createdAt: b.createdAt || '', updatedAt: b.updatedAt || ''
        }))] }
      }
    }
  })

  try {
    const result = await window.electronAPI.invoke('engine-batch-search-stream', cleanSources, kw, { page: 1 })
    if (!isActive) return
    if (result.searchId) currentSearchId = result.searchId
    if (!result.success) { if (result.error !== '搜索已取消') message.error('搜索失败: ' + result.error); return }

    const data = result.data || {}
    searchResults.value = data
    const total = Object.values(data).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
    if (total === 0) message.info('未找到相关书籍')
    else message.success(`找到 ${total} 本书`)
  } catch (err: any) {
    if (!isActive) return
    message.error('搜索失败: ' + (err.message || '未知错误'))
  } finally {
    if (isActive) loading.value = false
    if (unlistenProgress) { unlistenProgress(); unlistenProgress = null }
  }
}

function openBookDetail(book: Book, sourceName: string) {
  const source = sources.value.find(s => (s.bookSourceName || s.name) === sourceName)
  bookshelfStore.openDetail(book, source || null)
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement; const parent = img.parentElement
  if (!parent) return; img.remove()
  if (!parent.querySelector('.cover-placeholder')) {
    const div = document.createElement('div'); div.className = 'cover-placeholder'
    const title = parent.closest('.book-card')?.querySelector('h4')?.textContent || '未命名'
    const author = parent.closest('.book-card')?.querySelector('p')?.textContent || '佚名'
    div.innerHTML = `<div class="cover-overlay"><div class="cover-title">${title}</div><div class="cover-author">${author}</div></div>`
    parent.appendChild(div)
  }
}

onMounted(() => { isActive = true; loadSources(); nextTick(() => searchInput.value?.focus()) })
onUnmounted(async () => {
  isActive = false
  if (currentSearchId) { await window.electronAPI.searchAbort(currentSearchId); currentSearchId = '' }
  if (unlistenProgress) { unlistenProgress(); unlistenProgress = null }
})
</script>

<style scoped>
.search-page { position: relative; z-index: 1; max-width: 100%; }
.search-bar { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 220px; padding: 11px 18px; font-size: 15px; min-height: 42px; }
.search-actions { display: flex; gap: 8px; flex-shrink: 0; }

.search-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.progress-bar { flex: 1; min-width: 100px; }
.progress-text { font-size: 12px; color: var(--text-muted); white-space: nowrap; font-weight: var(--font-medium); }

.btn-cancel-search {
  padding: 5px 14px; font-size: 12px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; min-height: 30px;
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.btn-cancel-search:hover { color: #e74c3c; border-color: #e74c3c; background: rgba(231,76,60,0.06); }

.results { margin-top: 20px; }
.result-group { margin-bottom: 36px; }
.group-header {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 10px; border-bottom: 1px solid var(--border-color); margin-bottom: 14px;
}
.group-header h3 { font-size: 16px; font-weight: var(--font-semibold); color: var(--text-primary); margin: 0; }
.group-header span { font-size: 13px; color: var(--text-muted); font-weight: var(--font-medium); }

.empty-state.initial { padding: 88px 0; }

@media (max-width: 480px) {
  .search-bar { flex-direction: column; }
  .search-input { min-width: 0; }
}
</style>
