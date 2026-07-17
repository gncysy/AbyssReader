<template>
  <div class="explore-page">
    <header class="page-header">
      <h1 class="page-title">发现</h1>
      <p class="page-subtitle">浏览书源分类</p>
    </header>

    <div class="explore-toolbar">
      <div class="source-select-wrapper">
        <select v-model="selectedIndex" class="select-source form-select" @change="onSourceChange" aria-label="选择书源">
          <option :value="-1">选择书源...</option>
          <option v-for="(source, idx) in filteredExploreSources" :key="idx" :value="source.originalIndex">
            {{ source.source.bookSourceName || source.source.name }}
          </option>
        </select>
        <div class="source-search">
          <input v-model="sourceFilter" type="text" placeholder="搜索书源..." class="input-source-search" />
        </div>
      </div>

      <div v-if="categories.length > 0" class="categories" role="tablist">
        <button v-for="cat in categories" :key="cat.title" class="category-tag"
          :class="{ active: currentCategory?.url === cat.url }"
          @click="exploreCategory(cat)">{{ cat.title }}</button>
      </div>
    </div>

    <div v-if="loading" class="books-grid">
      <div v-for="i in 12" :key="i" class="book-card-skeleton"><div class="skeleton skeleton-cover"></div></div>
    </div>

    <div v-else-if="books.length > 0" class="books-grid">
      <div v-for="book in books" :key="book.bookUrl" class="book-card" @click="addToShelf(book)">
        <div class="book-cover">
          <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.name" loading="lazy" @error="handleCoverError" />
          <div v-else class="cover-placeholder">
            <div class="cover-overlay">
              <div class="cover-title">{{ book.name || '未命名' }}</div>
              <div class="cover-author">{{ book.author || '佚名' }}</div>
            </div>
          </div>
        </div>
        <div class="book-info"><h4>{{ book.name || '未命名' }}</h4><p>{{ book.author || '佚名' }}</p></div>
      </div>
    </div>

    <div v-else-if="selectedIndex >= 0 && !loading" class="empty-state">
      <h3>{{ categories.length === 0 ? '该书源暂无分类' : '选择分类开始浏览' }}</h3>
    </div>

    <div v-else class="empty-state">
      <h3>选择书源开始发现</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/api'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const sources = ref<BookSource[]>([])
const selectedIndex = ref(-1)
const sourceFilter = ref('')
const categories = ref<{ title: string; url: string }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)
const currentPage = ref(1)

const filteredExploreSources = computed(() => {
  const result: { source: BookSource; originalIndex: number }[] = []
  const filter = sourceFilter.value.trim().toLowerCase()
  sources.value.forEach((source, i) => {
    if (!source.exploreUrl || !source.exploreUrl.trim()) return
    if (filter && !(source.bookSourceName || source.name || '').toLowerCase().includes(filter)) return
    result.push({ source, originalIndex: i })
  })
  return result
})

function resolvePageUrl(url: string, page: number): string {
  if (!url) return url
  return url.replace(/\{\{([^}]+)\}\}/g, (_match: string, expr: string) => {
    try {
      const resolved = expr.replace(/page/g, String(page))
      const result = Function('"use strict"; return (' + resolved + ')')()
      if (typeof result === 'string') return result
      return String(Math.max(1, Math.floor(Number(result)) || 1))
    } catch {
      console.warn('[Explore] 表达式求值失败:', expr)
      return String(page)
    }
  })
}

async function loadSources() {
  try {
    sources.value = await store.get('sources') || []
    const firstIdx = filteredExploreSources.value[0]
    if (firstIdx) {
      selectedIndex.value = firstIdx.originalIndex
      await loadCategories()
    }
  } catch (err: any) { message.error('加载书源失败: ' + err.message) }
}

async function loadCategories() {
  categories.value = []
  books.value = []
  currentCategory.value = null
  if (selectedIndex.value < 0 || selectedIndex.value >= sources.value.length) return
  const source = sources.value[selectedIndex.value]
  if (!source.exploreUrl?.trim()) return
  try {
    const result = await window.electronAPI.invoke('get-explore-categories', selectedIndex.value)
    if (result && Array.isArray(result) && result.length > 0) {
      categories.value = result
      if (categories.value.length > 0) await exploreCategory(categories.value[0])
    }
  } catch (err: any) { console.error('[Explore] 加载分类失败:', err) }
}

async function onSourceChange() { await loadCategories() }

async function exploreCategory(cat: { title: string; url: string }) {
  if (selectedIndex.value < 0 || selectedIndex.value >= sources.value.length) return
  currentCategory.value = cat
  loading.value = true
  books.value = []
  if (!cat.url?.trim()) { loading.value = false; return }
  try {
    const categoryUrl = resolvePageUrl(cat.url, currentPage.value)
    const result = await window.electronAPI.invoke('explore-books-by-id', selectedIndex.value, categoryUrl, currentPage.value)
    books.value = (result && result.success && Array.isArray(result.data)) ? result.data : []
  } catch (err: any) { books.value = [] }
  finally { loading.value = false }
}

async function addToShelf(book: Book) {
  if (selectedIndex.value < 0) return
  const source = sources.value[selectedIndex.value]
  if (!book.name || !book.bookUrl) { message.warning('书籍信息不完整'); return }
  try {
    const books = await store.get('books') || []
    if (books.find((item: Book) => item.bookUrl === book.bookUrl)) { message.warning('该书已在书架中'); return }
    books.unshift({
      ...book,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      origin: source.bookSourceUrl || source.url || '',
      originName: source.bookSourceName || source.name || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    await store.set('books', books)
    message.success(`已添加《${book.name}》到书架`)
  } catch (err: any) { message.error('添加失败: ' + (err.message || '未知错误')) }
}

function handleCoverError(event: Event) { (event.target as HTMLImageElement).style.display = 'none' }

onMounted(() => { loadSources() })
</script>

<style scoped>
.explore-page { position: relative; z-index: 1; }
.explore-toolbar { margin-bottom: 20px; }

.source-select-wrapper { display: flex; gap: 10px; margin-bottom: 14px; align-items: center; }
.select-source { min-width: 200px; }
.input-source-search { width: 180px; }

.categories { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
.category-tag {
  padding: 7px 16px; font-size: 13px; color: var(--text-secondary);
  background: transparent; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font-weight: var(--font-medium);
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
}
.category-tag:hover { color: var(--text-primary); }
.category-tag:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; border-radius: var(--radius-sm); }
.category-tag.active { color: var(--brand); border-bottom-color: var(--brand); }
</style>