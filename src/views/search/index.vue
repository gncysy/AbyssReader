<template>
  <div class="search-page">
    <header class="page-header"><h1 class="page-title">搜索</h1><p class="page-subtitle">多书源并发搜索</p></header>
    <div class="search-bar">
      <SearchInput ref="searchInput" v-model="keyword" placeholder="输入书名或作者..." name="main-search" @search="handleSearch" style="flex:1;min-width:150px" />
      <button class="btn-primary" :disabled="loading || !keyword.trim()" @click="handleSearch">{{ loading ? '搜索中...' : '搜索' }}</button>
      <button v-if="loading" class="btn-secondary" @click="cancelSearch">取消</button>
    </div>
    <div v-if="resultKeys.length === 0 && !loading && searched" class="empty-wrapper">
      <EmptyState title="未找到相关书籍" description="试试其他关键词" />
    </div>
    <div v-else-if="resultKeys.length === 0 && !loading && !searched" class="empty-wrapper">
      <EmptyState title="输入关键词开始搜索" description="支持书名、作者搜索，多书源并发" />
    </div>
    <div v-if="resultKeys.length > 0" class="results">
      <BookSection v-for="key in resultKeys" :key="key" :title="key" :count="(searchResults[key] || []).length">
        <BookGrid :books="searchResults[key] || []" @click-book="openBookDetail($event, key)" />
      </BookSection>
    </div>
    <BookDetail v-if="bookshelfStore.showDetail" :book="bookshelfStore.detailBook" :source="bookshelfStore.detailSource" @close="bookshelfStore.closeDetail()" />
    <Reader v-if="bookshelfStore.showReader" :book="bookshelfStore.readerBook" :source="bookshelfStore.readerSource" :initial-chapters="bookshelfStore.readerChapters as Chapter[]" @close="bookshelfStore.closeReader()" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import { useBookshelfStore } from '@/stores/bookshelf.js'
import { useSearch } from '@/composables/useSearch.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book, BookSource, Chapter } from '@/types'
import SearchInput from '@/components/common/SearchInput.vue'
import BookSection from '@/components/book/BookSection.vue'
import BookGrid from '@/components/book/BookGrid.vue'
import BookDetail from '@/components/book/BookDetail.vue'
import Reader from '@/components/reader/Reader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const msg = useMessage()
const bookshelfStore = useBookshelfStore()
const { handleAndNotify } = useErrorHandler()
const sources = ref<BookSource[]>([])
const keyword = ref('')
const searchInput = ref<InstanceType<typeof SearchInput> | null>(null)
const searched = ref(false)
const { loading, completedCount, totalSources, searchResults, doSearch, cancelSearch, clearResults: clearSearchResults } = useSearch()

// 修复：建立 displayName → BookSource 映射，避免同名书源匹配错误
const sourceByDisplayName = ref<Map<string, BookSource>>(new Map())

const resultKeys = computed(() => {
  const keys: string[] = []
  for (const [key, books] of Object.entries(searchResults.value)) {
    if (books && books.length > 0) keys.push(key)
  }
  return keys
})

async function loadSources(): Promise<void> {
  try {
    const raw = await store.get('bookSource')
    sources.value = asArray<BookSource>(raw)
    // 修复：按 bookSourceUrl 建立映射，而不是 bookSourceName
    const map = new Map<string, BookSource>()
    for (const s of sources.value) {
      const displayName = s.bookSourceName || s.bookSourceUrl || '未知书源'
      map.set(displayName, s)
    }
    sourceByDisplayName.value = map
  } catch (err) {
    handleAndNotify(err, { module: 'search', operation: 'loadSources', userMessage: '加载书源失败' })
  }
}

function clearResults(): void {
  if (loading.value) return
  clearSearchResults()
  searched.value = false
}

async function handleSearch(): Promise<void> {
  const kw = keyword.value.trim()
  if (!kw) { msg.warning('请输入关键词'); return }
  const enabled = sources.value.filter((s) => s.enabled !== false)
  if (!enabled.length) { msg.warning('没有已启用的书源'); return }
  searched.value = true
  try {
    await doSearch(enabled, kw, { page: 1 })
  } catch (err) {
    handleAndNotify(err, { module: 'search', operation: 'handleSearch', userMessage: '搜索失败' })
  }
}

function openBookDetail(book: Book, sourceName: string): void {
  // 修复：先通过 _sourceKey 精确匹配，再通过 displayName 查找
  const bookRecord = book as unknown as Record<string, unknown>
  const sourceKey = typeof bookRecord._sourceKey === 'string' ? bookRecord._sourceKey : ''
  let source: BookSource | null = null

  if (sourceKey) {
    source = sources.value.find((s) => {
      const key = `${s.bookSourceName || s.bookSourceUrl || 'unknown'}::${s.bookSourceUrl || ''}`
      return key === sourceKey
    }) || null
  }

  if (!source) {
    source = sourceByDisplayName.value.get(sourceName) || null
  }

  bookshelfStore.openDetail(
    { ...book, origin: source?.bookSourceUrl || '', originName: source?.bookSourceName || '' },
    source
  )
}

onMounted(() => {
  loadSources()
  nextTick(() => searchInput.value?.$el?.focus())
})

onBeforeUnmount(() => {
  if (loading.value) {
    cancelSearch()
  }
})
</script>

<style scoped>
.search-page { position: relative; z-index: 1; }
.search-bar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.results { margin-top: 20px; }
.empty-wrapper { margin-top: 40px; }
</style>
