<template>
  <Transition name="detail">
    <div v-if="book" class="detail-overlay" @click.self="handleClose" @keydown.escape="handleClose" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div class="detail-container" tabindex="-1" ref="containerRef">
        <header class="detail-header">
          <button class="btn-back" @click="handleClose" aria-label="返回书架">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2 class="detail-title" id="detail-title">{{ book.name || '加载中...' }}</h2>
        </header>

        <div class="detail-body">
          <div class="detail-cover">
            <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.name + ' 封面'" @error="handleImageError" />
            <div v-else class="cover-placeholder">
              <div class="cover-overlay"><div class="cover-title-text">{{ book.name || '未命名' }}</div><div class="cover-author-text">{{ book.author || '佚名' }}</div></div>
            </div>
            <div class="cover-source">{{ book.originName || '未知来源' }}</div>
            <svg class="progress-ring" viewBox="0 0 36 36" v-if="readingPercent > 0" :aria-label="'阅读进度 ' + Math.round(readingPercent * 100) + '%'">
              <circle class="ring-bg" cx="18" cy="18" r="15" fill="none" />
              <circle class="ring-fill" cx="18" cy="18" r="15" fill="none" :stroke-dasharray="readingPercent * 0.94 + ' 94'" />
              <text x="18" y="21" text-anchor="middle" class="ring-text">{{ Math.round(readingPercent * 100) }}%</text>
            </svg>
          </div>
          <div class="detail-info">
            <h1 class="book-title">{{ book.name }}</h1>
            <p class="book-author">{{ book.author || '未知作者' }}</p>
            <div class="book-meta"><span class="meta-tag">{{ book.kind || '未分类' }}</span></div>
            <div class="progress-bar-container">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: readingPercent * 100 + '%' }"></div></div>
              <span class="progress-label">{{ progressText }}</span>
            </div>
            <p class="book-intro">{{ book.intro || '暂无简介' }}</p>
          </div>
        </div>

        <div class="detail-toc">
          <div class="toc-header"><h3>目录</h3><span class="toc-count">{{ chapters.length }} 章</span></div>
          <div class="toc-toolbar">
            <div class="toc-search" v-if="chapters.length > 50"><input v-model="tocFilter" type="text" placeholder="搜索章节..." class="toc-search-input" /></div>
            <div class="toc-pagination" v-if="totalPages > 1">
              <button class="page-btn" @click="prevPage" :disabled="currentPage === 1" aria-label="上一页">‹</button>
              <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
              <button class="page-btn" @click="nextPage" :disabled="currentPage === totalPages" aria-label="下一页">›</button>
            </div>
          </div>
          <div class="toc-list" v-if="!loadingToc" ref="listRef" role="listbox" aria-label="章节目录">
            <div v-for="ch in pagedChapters" :key="ch.id" class="toc-item" :class="{ active: ch.id === currentChapterId, vip: ch.isVip }"
              role="option" :aria-selected="ch.id === currentChapterId" tabindex="0"
              @click="handleChapterClick(ch)" @keydown.enter="handleChapterClick(ch)" @keydown.space.prevent="handleChapterClick(ch)">
              <span class="toc-chapter-title">{{ ch.title }}</span>
              <div class="toc-badges"><span v-if="ch.isVip" class="badge badge-vip">VIP</span><span v-if="ch.id === currentChapterId" class="badge badge-current">当前</span></div>
            </div>
            <div v-if="chapters.length === 0 && !loadingToc" class="toc-empty">暂无目录</div>
          </div>
          <div v-else class="toc-loading"><div class="loading-spinner"></div><span>加载目录中...</span></div>
        </div>

        <footer class="detail-footer">
          <button class="btn-danger-ghost" @click="handleRemoveFromShelf" aria-label="移出书架">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>移出</span>
          </button>
          <div class="footer-spacer"></div>
          <button class="btn-secondary" @click="handleAddToShelf" :disabled="isInShelf">
            <svg v-if="!isInShelf" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {{ isInShelf ? '已在书架' : '加书架' }}
          </button>
          <button class="btn-primary-detail" @click="handleRead">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {{ currentChapterId !== undefined && currentChapterId !== null ? '继续阅读' : '开始阅读' }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useBookshelfStore, useReadingStore } from '@/store'
import { reader as readerApi } from '@/api'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{ book: Book; source: BookSource | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const dialog = useDialog()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()

const chapters = ref<Chapter[]>([])
const loadingToc = ref(false)
const currentChapterId = ref<number | null>(null)
const tocFilter = ref('')
const currentPage = ref(1)
const pageSize = 50
const listRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const isInShelf = computed(() => bookshelfStore.hasBook(props.book?.bookUrl || ''))

const filteredChapters = computed(() => {
  if (!tocFilter.value.trim()) return chapters.value
  const keyword = tocFilter.value.trim().toLowerCase()
  return chapters.value.filter(ch => ch.title.toLowerCase().includes(keyword))
})

const totalPages = computed(() => Math.ceil(filteredChapters.value.length / pageSize) || 1)
const pagedChapters = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredChapters.value.slice(start, start + pageSize)
})

const currentIndex = computed(() => {
  if (currentChapterId.value === null) return -1
  return chapters.value.findIndex(c => c.id === currentChapterId.value)
})

const readingPercent = computed(() => {
  if (chapters.value.length === 0 || currentIndex.value === -1) return 0
  return Math.min(1, (currentIndex.value + 1) / chapters.value.length)
})

const progressText = computed(() => {
  if (!props.book) return '未开始'
  if (chapters.value.length === 0) return '加载中...'
  if (currentIndex.value === -1) return '未开始'
  return `${currentIndex.value + 1} / ${chapters.value.length}`
})

function cleanSource(source: any): any {
  if (!source) return null
  return JSON.parse(JSON.stringify(source))
}

function goToPage(page: number) { currentPage.value = Math.max(1, Math.min(page, totalPages.value)) }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }
function prevPage() { if (currentPage.value > 1) currentPage.value-- }

function scrollToCurrentChapter() {
  nextTick(() => {
    const container = listRef.value
    if (!container) return
    const activeItem = container.querySelector('.toc-item.active')
    if (activeItem) {
      const containerRect = container.getBoundingClientRect()
      const itemRect = activeItem.getBoundingClientRect()
      container.scrollBy({ top: itemRect.top - containerRect.top - containerRect.height / 3, behavior: 'smooth' })
    }
  })
}

async function loadTocInternal() {
  if (!props.book || loadingToc.value) return

  if (props.book.bookUrl?.startsWith('local://')) {
    try {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data = await readerApi.getLocalBookChapters(bookId)
      if (data && data.length > 0) {
        chapters.value = data.map((item: any, idx: number) => ({
          id: Number(item.id) || idx, title: item.title || `第${idx+1}章`, url: `local://${bookId}/${item.id}`, index: idx, content: item.content || '',
        }))
      } else {
        chapters.value = [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0, content: '' }]
      }
    } catch (err: any) { message.error('加载目录失败') }
    await restoreProgress()
    return
  }

  const allSources = await window.electronAPI.store.get('sources') || []
  const sourceToUse = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
  if (!sourceToUse) { loadingToc.value = false; return }

  loadingToc.value = true
  try {
    const tocUrl = props.book.tocUrl || props.book.bookUrl
    const result = await window.electronAPI.invoke('engine-get-toc', cleanSource(sourceToUse), tocUrl, { book: { kind: props.book?.kind || '' } })
    if (result.success) {
      chapters.value = result.data || []
      if (chapters.value.length > 0 && props.book?.bookUrl) setTocCache(props.book.bookUrl, chapters.value)
    } else { message.warning('加载目录失败: ' + (result.error || '未知错误')) }
  } catch (err: any) { message.error('加载目录失败: ' + err.message) }
  finally { loadingToc.value = false; await restoreProgress() }
}

async function restoreProgress() {
  if (!props.book || chapters.value.length === 0) return
  let targetChapterId = (props.book as any).current_chapter_id
  if (targetChapterId === undefined || targetChapterId === null) {
    const progress = await readingStore.loadProgress(String(props.book.bookUrl), props.book.name || '', props.book.author || '')
    if (progress) targetChapterId = progress.chapterId
  }
  if (targetChapterId !== undefined && targetChapterId !== null) {
    const found = chapters.value.find(c => Number(c.id) === Number(targetChapterId))
    if (found) {
      currentChapterId.value = found.id
      const index = chapters.value.findIndex(c => c.id === found.id)
      if (index !== -1) { goToPage(Math.floor(index / pageSize) + 1); await nextTick(); scrollToCurrentChapter() }
    }
  }
}

function handleChapterClick(ch: Chapter) {
  if (!props.book) return
  currentChapterId.value = ch.id
  const bookWithProgress = { ...props.book, current_chapter_id: chapters.value.findIndex(c => c.id === ch.id) }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(bookWithProgress, props.source, chapters.value)
}

function handleRead() {
  if (!props.book) return
  let chapterIndex = 0
  if (currentChapterId.value !== null) {
    const found = chapters.value.findIndex(c => c.id === currentChapterId.value)
    if (found !== -1) chapterIndex = found
  }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader({ ...props.book, current_chapter_id: chapterIndex }, props.source, chapters.value)
}

async function handleAddToShelf() {
  if (isInShelf.value) { message.info('已在书架中'); return }
  if (!props.book) return
  const success = await bookshelfStore.addBook(props.book)
  if (success) message.success(`已添加《${props.book.name}》到书架`)
  else message.warning('添加失败，可能已存在')
}

async function handleRemoveFromShelf() {
  if (!props.book) return
  dialog.warning({
    title: '确认移出', content: `确定将《${props.book.name}》移出书架？`, positiveText: '移出', negativeText: '取消',
    onPositiveClick: async () => {
      await bookshelfStore.removeBookByUrl(props.book.bookUrl)
      message.success(`已移出《${props.book.name}》`)
      handleClose()
    },
  })
}

function handleClose() { emit('close') }
function handleImageError(event: Event) {
  (event.target as HTMLImageElement).style.display = 'none'
  const parent = (event.target as HTMLElement).parentElement
  if (parent) {
    const placeholder = parent.querySelector('.cover-placeholder') as HTMLElement
    if (placeholder) placeholder.style.display = 'block'
  }
}
function handleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') handleClose() }

const TOC_CACHE_KEY = 'toc_cache'; const CACHE_TTL = 24 * 60 * 60 * 1000
function getTocCache(bookId: string | number) {
  try { const raw = localStorage.getItem(`${TOC_CACHE_KEY}_${bookId}`); if (!raw) return null; const entry = JSON.parse(raw); if (Date.now() - entry.timestamp > CACHE_TTL) { localStorage.removeItem(`${TOC_CACHE_KEY}_${bookId}`); return null; } return entry; } catch { return null; }
}
function setTocCache(bookId: string | number, chapters: Chapter[]) { try { localStorage.setItem(`${TOC_CACHE_KEY}_${bookId}`, JSON.stringify({ chapters, timestamp: Date.now(), totalChapters: chapters.length })) } catch {} }

async function refreshTocInBackground(bookId: string | number) {
  try {
    const allSources = await window.electronAPI.store.get('sources') || []
    const sourceToUse = props.source || allSources.find((s: any) => s.bookSourceName === props.book?.originName)
    if (!sourceToUse) return
    const tocUrl = props.book?.tocUrl || props.book?.bookUrl; if (!tocUrl) return
    const result = await window.electronAPI.invoke('engine-get-toc', cleanSource(sourceToUse), tocUrl, { book: { kind: props.book?.kind || '' } })
    if (result.success && result.data?.length > 0) {
      const cached = getTocCache(bookId)
      if (!cached || cached.totalChapters !== result.data.length) { chapters.value = result.data; setTocCache(bookId, result.data) }
    }
  } catch (err) { console.debug('[BookDetail] 后台刷新失败:', err) }
}

async function loadToc() {
  if (!props.book) return
  const cached = props.book?.bookUrl ? getTocCache(props.book.bookUrl) : null
  if (cached && cached.chapters.length > 0) { chapters.value = cached.chapters; loadingToc.value = false; restoreProgress().catch(() => {}); if (props.book?.bookUrl) refreshTocInBackground(props.book.bookUrl); return }
  await loadTocInternal()
}

onMounted(() => { loadToc(); document.addEventListener('keydown', handleKeydown); nextTick(() => containerRef.value?.focus()) })
onUnmounted(() => { document.removeEventListener('keydown', handleKeydown) })
watch(() => props.book, () => loadToc())
</script>

<style scoped>
.detail-enter-active { transition: opacity 0.28s var(--ease-out), transform 0.28s var(--ease-out); }
.detail-leave-active { transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out); }
.detail-enter-from { opacity: 0; transform: scale(0.96); }
.detail-leave-to { opacity: 0; transform: scale(0.98); }

.detail-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(16px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.detail-container {
  width: 100%; max-width: 840px; height: 90vh; max-height: 800px;
  background: var(--bg-card); border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--shadow-xl); outline: none;
}

.detail-header { display: flex; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; gap: 14px; }
.btn-back {
  background: transparent; border: 1px solid transparent; color: var(--text-secondary);
  cursor: pointer; padding: 6px; border-radius: var(--radius-sm);
  transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
  display: flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px;
}
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color); }
.btn-back:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.detail-title { font-size: 17px; font-weight: var(--font-semibold); color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }

.detail-body { display: flex; gap: 28px; padding: 22px 26px; flex-shrink: 0; border-bottom: 1px solid var(--border-color); }
.detail-cover { width: 130px; min-width: 130px; height: 180px; border-radius: var(--radius-md); overflow: hidden; position: relative; }
.detail-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { width: 100%; height: 100%; background: url('/icons/cover.jpg') center/cover; position: relative; display: block; }
.cover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 14px; text-align: center; }
.cover-title-text { font-size: 14px; font-weight: var(--font-semibold); color: #fff; line-height: 1.3; text-shadow: 0 2px 8px rgba(0,0,0,0.8); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; width: 100%; }
.cover-author-text { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 4px; text-shadow: 0 1px 4px rgba(0,0,0,0.8); width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover-source { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 10px; background: rgba(0,0,0,0.75); color: rgba(255,255,255,0.8); font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.progress-ring { position: absolute; bottom: -10px; right: -10px; width: 48px; height: 48px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3)); }
.ring-bg { stroke: var(--bg-card); stroke-width: 3; }
.ring-fill { stroke: var(--brand); stroke-width: 3; stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transition: stroke-dasharray 0.6s var(--ease-out); }
.ring-text { font-size: 9px; font-weight: var(--font-semibold); fill: var(--text-primary); }

.detail-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.book-title { font-size: 22px; font-weight: var(--font-semibold); color: var(--text-primary); margin: 0; letter-spacing: -0.2px; }
.book-author { font-size: 14px; color: var(--text-secondary); margin: 0; }
.book-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.meta-tag { font-size: 12px; padding: 3px 12px; border-radius: var(--radius-full); background: var(--bg-hover); color: var(--text-secondary); font-weight: var(--font-medium); }
.progress-bar-container { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.progress-bar { flex: 1; }
.progress-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.book-intro { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.detail-toc { flex: 1; display: flex; flex-direction: column; padding: 0 22px 4px; min-height: 0; overflow: hidden; }
.toc-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 8px; flex-shrink: 0; border-bottom: 1px solid var(--border-color); }
.toc-header h3 { font-size: 15px; font-weight: var(--font-semibold); color: var(--text-primary); margin: 0; }
.toc-count { font-size: 13px; color: var(--text-muted); }
.toc-toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 0; flex-shrink: 0; flex-wrap: wrap; }
.toc-search { flex: 1; min-width: 140px; }
.toc-pagination { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.page-btn {
  width: 34px; height: 34px; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary);
  cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.page-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--text-primary); background: var(--bg-hover); }
.page-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-info { font-size: 13px; color: var(--text-secondary); min-width: 54px; text-align: center; font-weight: var(--font-medium); }

.toc-list { flex: 1; overflow-y: auto; padding: 6px 0 14px; display: flex; flex-direction: column; gap: 2px; }
.toc-item {
  position: relative; display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.18s var(--ease-out); gap: 12px; outline: none; min-height: 42px;
}
.toc-item::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%) scaleY(0);
  width: 3px; height: 60%; background: var(--brand); border-radius: 0 2px 2px 0;
  transition: transform 0.25s var(--ease-out);
}
.toc-item:hover::before { transform: translateY(-50%) scaleY(0.6); }
.toc-item.active::before { transform: translateY(-50%) scaleY(1); }
.toc-item:hover { background: var(--bg-hover); }
.toc-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -1px; }
.toc-item.active { background: var(--bg-active); }
.toc-item.active .toc-chapter-title { color: var(--brand); }
.toc-chapter-title { font-size: 14px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toc-item.vip .toc-chapter-title { color: #d4a017; }
.toc-badges { display: flex; gap: 4px; flex-shrink: 0; }
.toc-empty, .toc-loading { display: flex; align-items: center; justify-content: center; gap: 12px; height: 100%; min-height: 120px; color: var(--text-muted); font-size: 14px; }

.detail-footer { display: flex; align-items: center; gap: 14px; padding: 16px 26px; border-top: 1px solid var(--border-color); flex-shrink: 0; }
.footer-spacer { flex: 1; }

.btn-danger-ghost {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 13px;
  color: var(--text-muted); background: transparent; border: 1px solid transparent;
  border-radius: var(--radius-md); cursor: pointer;
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
  min-height: 38px;
}
.btn-danger-ghost:hover { color: #e74c3c; background: rgba(231,76,60,0.06); border-color: rgba(231,76,60,0.2); }
.btn-danger-ghost:focus-visible { outline: 2px solid #e74c3c; outline-offset: 1px; }

.btn-primary-detail {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 24px; font-size: 14px; font-weight: var(--font-medium);
  color: #0f0f0f; background: var(--brand); border: none;
  border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
  min-width: 140px; min-height: 42px;
  box-shadow: 0 2px 8px rgba(212,160,23,0.25);
}
.btn-primary-detail:hover { background: var(--brand-hover); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,160,23,0.35); }
.btn-primary-detail:active { transform: translateY(0); box-shadow: 0 1px 4px rgba(212,160,23,0.2); }
.btn-primary-detail:focus-visible { outline: 2px solid var(--brand-hover); outline-offset: 2px; }

.btn-secondary {
  display: flex; align-items: center; gap: 6px; padding: 8px 18px; font-size: 14px;
  font-weight: var(--font-medium); color: var(--text-secondary); background: transparent;
  border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer;
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out), border-color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
  min-height: 38px;
}
.btn-secondary:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); transform: translateY(-1px); }
.btn-secondary:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.btn-secondary:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
</style>