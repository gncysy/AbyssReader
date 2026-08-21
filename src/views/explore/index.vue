<template>
  <div class="explore-page">
    <header class="page-header"><div><h1 class="page-title">发现</h1><p class="page-subtitle">{{ sourceName }}</p></div><button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="showLogModal = true">日志</button></header>
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      <CustomDropdown v-model="selectedIndex" :options="sourceOptions" placeholder="选择书源..." @update:modelValue="(v: string | number) => onSourceChange(Number(v))" style="min-width:200px" />
      <input v-model="sourceFilter" type="text" placeholder="搜索书源..." class="input-search" style="width:160px" autocomplete="off" />
      <button v-if="hasFilters" class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="resetFilters">重置筛选</button>
      <span v-if="loadingCategories" style="font-size:12px;color:var(--text-muted)">加载中...</span>
    </div>
    <div v-if="categories.length > 0" class="explore-categories">
      <template v-for="(cat, idx) in categories" :key="idx">
        <div v-if="!cat.url && cat.title && cat.title.trim()" class="category-divider">{{ cat.title }}</div>
        <button v-else-if="cat.type === 'url' && cat.url" class="category-tag" :class="{ active: currentCategory?.title === cat.title }" @click="handleCategoryClick(cat)">{{ cat.title }}</button>
        <div v-else-if="cat.type === 'text'" class="category-text-wrapper"><span class="category-label">{{ cat.title }}</span><input :value="getInfoMapValue(cat)" type="text" class="category-text-input" :placeholder="getViewName(cat) || cat.title" @input="onTextInput(cat, ($event.target as HTMLInputElement).value)" /></div>
        <button v-else-if="cat.type === 'button'" class="category-action-btn" @click="onActionClick(cat)">{{ getViewName(cat) || cat.title }}</button>
        <button v-else-if="cat.type === 'toggle'" class="category-toggle-btn" @click="onToggleClick(cat)"><span class="toggle-char">{{ getToggleChar(cat) }}</span><span>{{ getViewName(cat) || cat.title }}</span></button>
        <div v-else-if="cat.type === 'select'" class="category-select-wrapper"><span class="category-label">{{ getViewName(cat) || cat.title }}</span><CustomDropdown :model-value="String(getInfoMapValue(cat) || cat.default || (cat.chars && cat.chars.length > 0 ? cat.chars[0] : '') || '')" :options="(cat.chars || []).map(c => ({ label: c, value: c }))" placeholder="请选择" @update:modelValue="(v: string | number) => onSelectChange(cat, String(v))" style="min-width:100px" /></div>
      </template>
    </div>
    <EmptyState v-else-if="!loadingCategories && selectedIndex >= 0" title="暂无分类" />
    <BookGrid :books="books" :loading="loadingBooks && books.length === 0" @click-book="openBookDetail" />
    <div v-if="loadingBooks && books.length > 0" style="display:flex;justify-content:center;padding:20px 0"><LoadingSpinner /><span style="margin-left:12px;color:var(--text-muted);font-size:14px">加载中...</span></div>
    <div v-if="!loadingBooks && books.length > 0 && !hasMore" style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:13px">— 已加载全部 —</div>
    <div ref="booksGridRef"></div>
    <BookDetail v-if="bookshelfStore.showDetail" :book="bookshelfStore.detailBook" :source="bookshelfStore.detailSource" @close="bookshelfStore.closeDetail()" />
    <Reader v-if="bookshelfStore.showReader" :book="bookshelfStore.readerBook" :source="bookshelfStore.readerSource" :initial-chapters="bookshelfStore.readerChapters as Chapter[]" @close="bookshelfStore.closeReader()" />
    <n-modal v-model:show="showLogModal" preset="card" title="发现页日志" style="max-width:800px;max-height:70vh" :bordered="false">
      <div class="log-modal-body"><div class="log-header"><span>共 {{ exploreLogs.length }} 条</span><button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="clearExploreLogs">清空</button></div>
        <div class="log-list" ref="logListRef"><div v-for="(log, idx) in exploreLogs" :key="idx" class="log-entry" :class="'log-' + log.level"><span class="log-time">{{ log.time }}</span><span class="log-module">{{ log.module }}</span><span class="log-source">{{ log.source }}</span><span class="log-message">{{ log.message }}</span></div></div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NModal } from 'naive-ui'
import { store, engine } from '@/services'
import { useBookshelfStore } from '@/stores/bookshelf.js'
import { useInfoMapStore } from '@/stores/info-map.js'
import { useExplore } from '@/composables/useExplore.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import BookGrid from '@/components/book/BookGrid.vue'
import BookDetail from '@/components/book/BookDetail.vue'
import Reader from '@/components/reader/Reader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { onLog, logHistory, type LogEntry } from '@engine/log/index.js'
import type { Book, BookSource, Chapter } from '@/types'
import type { ExploreKind } from '@engine/business/explore/index.js'

const MAX_EXPLORE_LOGS = 1000

const bookshelfStore = useBookshelfStore()
const infoMapStore = useInfoMapStore()
const { categories, loadingCategories, currentCategory, books, loadingBooks, currentPage, hasMore, booksGridRef, loadCategories, exploreCategory, loadBooks, cleanupObserver } = useExplore()
const { handleAndNotify } = useErrorHandler()

const sources = ref<BookSource[]>([])
const selectedIndex = ref(-1)
const sourceFilter = ref('')
const showLogModal = ref(false)
const exploreLogs = ref<LogEntry[]>([])
const logListRef = ref<HTMLElement | null>(null)

function isBookSourceArray(value: unknown): value is BookSource[] {
  return Array.isArray(value)
}

const currentSourceUrl = computed(() => selectedIndex.value < 0 ? '' : (sources.value[selectedIndex.value]?.bookSourceUrl || ''))
const sourceName = computed(() => selectedIndex.value < 0 ? '选择书源' : (sources.value[selectedIndex.value]?.bookSourceName || '书源'))
const hasFilters = computed(() => categories.value.some((c) => c.type === 'select' || c.type === 'toggle' || c.type === 'text'))
const filteredSources = computed(() => {
  const result: { source: BookSource; originalIndex: number }[] = []
  const filter = sourceFilter.value.trim().toLowerCase()
  sources.value.forEach((source, i) => {
    if (!source.exploreUrl?.trim()) return
    if (filter && !source.bookSourceName.toLowerCase().includes(filter)) return
    result.push({ source, originalIndex: i })
  })
  return result
})
const sourceOptions = computed(() => {
  const opts: { label: string; value: number }[] = [{ label: '选择书源...', value: -1 }]
  for (const item of filteredSources.value) {
    opts.push({ label: item.source.bookSourceName, value: item.originalIndex })
  }
  return opts
})

function getInfoMapValue(cat: ExploreKind): string { return infoMapStore.get(currentSourceUrl.value, cat.title) }
function setInfoMapValue(cat: ExploreKind, value: string): void { infoMapStore.set(currentSourceUrl.value, cat.title, value) }

function getViewName(cat: ExploreKind): string {
  if (!cat.viewName) return ''
  const trimmed = cat.viewName.trim()
  if (trimmed.length >= 3 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1)
  return ''
}

function getToggleChar(cat: ExploreKind): string {
  const chars = cat.chars && cat.chars.length > 0 ? cat.chars : ['↓ ', '↑ ']
  const current = getInfoMapValue(cat) || cat.default || (chars[0] !== undefined ? chars[0] : '')
  return current
}

async function loadSources(): Promise<void> {
  try {
    const raw = await store.get('bookSource')
    sources.value = isBookSourceArray(raw) ? raw : []
    const first = filteredSources.value[0]
    if (first) { selectedIndex.value = first.originalIndex; await loadCategoriesForSource(first.source) }
  } catch (err) {
    handleAndNotify(err, { module: 'explore', operation: 'loadSources', userMessage: '加载书源失败' })
  }
}

async function loadCategoriesForSource(source: BookSource): Promise<void> {
  try {
    await loadCategories(source)
    const first = categories.value.find((c) => c.type === 'url' && c.url)
    if (first) await exploreCategory(source, first)
  } catch (err) {
    handleAndNotify(err, { module: 'explore', operation: 'loadCategories', sourceUrl: source.bookSourceUrl, userMessage: '加载分类失败，请检查书源' })
  }
}

async function onSourceChange(val: number): Promise<void> {
  selectedIndex.value = val
  if (val < 0) return
  const source = sources.value[val]
  if (source) await loadCategoriesForSource(source)
}

function handleCategoryClick(cat: ExploreKind): void {
  if (!cat || !cat.url) return
  const src = sources.value[selectedIndex.value]
  if (src) exploreCategory(src, cat)
}

async function onSelectChange(cat: ExploreKind, value: string): Promise<void> {
  setInfoMapValue(cat, value)
  if (cat.action) await executeAction(cat.action)
  if (currentCategory.value) {
    currentPage.value = 1
    books.value = []
    hasMore.value = true
    const src = sources.value[selectedIndex.value]
    if (src) await loadBooks(src)
  }
}

async function onToggleClick(cat: ExploreKind): Promise<void> {
  const chars = cat.chars && cat.chars.length > 0 ? cat.chars : ['↓ ', '↑ ']
  const current = getInfoMapValue(cat) || cat.default || (chars[0] !== undefined ? chars[0] : '')
  const idx = chars.indexOf(current)
  const next = chars[(idx + 1) % chars.length] || (chars[0] !== undefined ? chars[0] : '')
  setInfoMapValue(cat, next)
  if (cat.action) await executeAction(cat.action)
  if (currentCategory.value) {
    currentPage.value = 1
    books.value = []
    hasMore.value = true
    const src = sources.value[selectedIndex.value]
    if (src) await loadBooks(src)
  }
}

let textInputTimer: ReturnType<typeof setTimeout> | null = null

async function onTextInput(cat: ExploreKind, value: string): Promise<void> {
  setInfoMapValue(cat, value)
  if (cat.action) {
    if (textInputTimer) clearTimeout(textInputTimer)
    textInputTimer = setTimeout(async () => {
      await executeAction(cat.action!)
      textInputTimer = null
    }, 600)
  }
}

async function onActionClick(cat: ExploreKind): Promise<void> {
  if (cat.action) await executeAction(cat.action)
}

async function executeAction(action: string): Promise<void> {
  try {
    let processed = action
    processed = processed.replace(/Map\(['"]([^'"]+)['"]\)/g, (_, key: string) => JSON.stringify(infoMapStore.get(currentSourceUrl.value, key) || ''))
    await engine.executeJs(processed, {
      source: sources.value[selectedIndex.value] || {},
      baseUrl: currentSourceUrl.value || '',
      result: '',
      book: {},
    })
  } catch (err) {
    handleAndNotify(err, { module: 'explore', operation: 'executeAction', userMessage: '执行操作失败' })
  }
}

function resetFilters(): void {
  const map = infoMapStore.getMap(currentSourceUrl.value)
  for (const cat of categories.value) {
    if (cat.type === 'select' || cat.type === 'toggle' || cat.type === 'text') delete map.data[cat.title]
  }
  map.needSave = true
  infoMapStore.saveNow(currentSourceUrl.value)
  const src = sources.value[selectedIndex.value]
  if (src) loadCategoriesForSource(src)
}

function openBookDetail(book: Book): void {
  const source = sources.value[selectedIndex.value]
  if (!source) return
  bookshelfStore.openDetail({ ...book, origin: source.bookSourceUrl || '', originName: source.bookSourceName }, source)
}

function clearExploreLogs(): void { exploreLogs.value = [] }

function pushExploreLog(entry: LogEntry): void {
  exploreLogs.value = [...exploreLogs.value, entry]
  if (exploreLogs.value.length > MAX_EXPLORE_LOGS) {
    exploreLogs.value.splice(0, exploreLogs.value.length - MAX_EXPLORE_LOGS)
  }
}

const logHandler = (entry: LogEntry) => {
  if (entry.module === 'explore') pushExploreLog(entry)
}
let unsubscribe: (() => void) | null = null

onMounted(() => {
  loadSources()
  unsubscribe = onLog(logHandler)
  for (const entry of logHistory) {
    if (entry.module === 'explore') pushExploreLog(entry)
  }
})
onUnmounted(() => {
  cleanupObserver()
  infoMapStore.saveAll()
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
})
</script>

<style scoped>
.explore-page { position: relative; z-index: 1; }
.explore-categories { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 8px 0 16px 0; min-height: 40px; }
.category-divider { width: 100%; text-align: center; font-size: 15px; font-weight: 600; color: var(--text-primary); padding: 10px 0 4px 0; margin-top: 6px; border-top: 1px solid var(--border-color); opacity: 0.7; letter-spacing: 0.06em; }
.category-tag { padding: 6px 14px; font-size: 13px; color: var(--text-secondary); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-weight: 500; transition: color 0.2s, border-color 0.2s; }
.category-tag:hover { color: var(--text-primary); }
.category-tag.active { color: var(--brand); border-bottom-color: var(--brand); }
.category-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; white-space: nowrap; }
.category-text-wrapper { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.category-text-input { padding: 4px 10px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; min-width: 120px; height: 32px; }
.category-text-input:focus { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); }
.category-action-btn { padding: 6px 14px; font-size: 13px; color: var(--brand); background: var(--bg-active); border: 1px solid rgba(212, 160, 23, 0.2); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, background 0.2s; }
.category-action-btn:hover { background: var(--brand); color: #fff; }
.category-toggle-btn { display: flex; align-items: center; gap: 4px; padding: 4px 12px; font-size: 13px; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.2s, background 0.2s, border-color 0.2s; }
.category-toggle-btn:hover { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); }
.toggle-char { font-size: 12px; color: var(--text-muted); }
.category-select-wrapper { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.log-modal-body { display: flex; flex-direction: column; max-height: 60vh; }
.log-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); padding-bottom: 4px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.log-list { flex: 1; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; padding-top: 4px; }
.log-entry { display: flex; gap: 6px; padding: 1px 4px; flex-shrink: 0; border-bottom: 1px solid var(--border-color); }
.log-time { color: var(--text-muted); min-width: 70px; font-size: 10px; flex-shrink: 0; }
.log-module { color: var(--brand); min-width: 50px; font-size: 9px; flex-shrink: 0; text-align: center; font-weight: 600; }
.log-source { color: var(--text-muted); min-width: 32px; font-size: 9px; flex-shrink: 0; text-align: center; }
.log-message { word-break: break-all; }
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-warn .log-message { color: #d4a017; }
.log-info .log-message { color: var(--text-secondary); }
</style>
