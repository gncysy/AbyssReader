<template>
  <div class="detail-overlay" @click.self="handleClose" @keydown.escape="handleClose" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <div class="detail-container" tabindex="-1" ref="containerRef">
      <!-- 头部 -->
      <header class="detail-header">
        <button class="btn-back" @click="handleClose" aria-label="返回书架">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="detail-title" id="detail-title">{{ book?.name || '加载中...' }}</h2>
      </header>

      <!-- 书籍信息 -->
      <div class="detail-body" v-if="book">
        <div class="detail-cover">
          <img v-if="book.coverUrl" :src="book.coverUrl" alt="封面" @error="handleImageError" />
          <div v-else class="cover-placeholder">{{ book.name?.charAt(0) || '?' }}</div>
          <div class="cover-source">{{ book.originName || '未知来源' }}</div>
          <svg class="progress-ring" viewBox="0 0 36 36" v-if="readingPercent > 0">
            <circle class="ring-bg" cx="18" cy="18" r="15" fill="none" />
            <circle class="ring-fill" cx="18" cy="18" r="15" fill="none" :stroke-dasharray="`${readingPercent * 0.94} 94`" />
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

      <!-- 目录 -->
      <div class="detail-toc">
        <div class="toc-header"><h3>目录</h3><span class="toc-count">{{ chapters.length }} 章</span></div>
        <div class="toc-toolbar">
          <div class="toc-search" v-if="chapters.length > 50">
            <input v-model="tocFilter" type="text" placeholder="搜索章节..." class="toc-search-input" />
          </div>
          <div class="toc-pagination" v-if="totalPages > 1">
            <button class="page-btn" @click="prevPage" :disabled="currentPage === 1" aria-label="上一页">‹</button>
            <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
            <button class="page-btn" @click="nextPage" :disabled="currentPage === totalPages" aria-label="下一页">›</button>
          </div>
        </div>
        <div class="toc-list" v-if="!loadingToc" ref="listRef">
          <div v-for="ch in pagedChapters" :key="ch.id" class="toc-item" :class="{ active: ch.id === currentChapterId, vip: ch.isVip }" role="option" :aria-selected="ch.id === currentChapterId" tabindex="0" @click="handleChapterClick(ch)" @keydown.enter="handleChapterClick(ch)" @keydown.space.prevent="handleChapterClick(ch)">
            <span class="toc-chapter-title">{{ ch.title }}</span>
            <div class="toc-badges">
              <span v-if="ch.isVip" class="badge-vip">VIP</span>
              <span v-if="ch.id === currentChapterId" class="badge-current">当前</span>
            </div>
          </div>
          <div v-if="chapters.length === 0 && !loadingToc" class="toc-empty"><span>暂无目录</span></div>
        </div>
        <div v-else class="toc-loading"><div class="loading-spinner"></div><span>加载目录中...</span></div>
      </div>

      <!-- 底部操作栏 -->
      <footer class="detail-footer">
        <button class="btn-danger-ghost" @click="handleRemoveFromShelf" aria-label="移出书架">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          <span>移出</span>
        </button>
        <div class="footer-spacer"></div>
        <button class="btn-secondary" @click="handleAddToShelf" :disabled="isInShelf">
          <svg v-if="!isInShelf" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          {{ isInShelf ? '已在书架' : '加书架' }}
        </button>
        <button class="btn-primary" @click="handleRead">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          {{ currentChapterId !== undefined && currentChapterId !== null ? '继续阅读' : '开始阅读' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useBookshelfStore, useReadingStore } from '@/store'
import { engine as engineApi, reader as readerApi } from '@/api'
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
      const offset = itemRect.top - containerRect.top - containerRect.height / 3
      container.scrollBy({ top: offset, behavior: 'smooth' })
    }
  })
}

async function loadToc() {
  if (!props.book || loadingToc.value) return

  // 本地 TXT
  if (props.book.origin === 'local' || props.book.sourceId === 'local') {
    try {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data = await readerApi.getLocalBookChapters(bookId)
      if (data && data.length > 0) {
        chapters.value = data.map((c: any, idx: number) => ({
          id: Number(c.id) || idx,
          title: c.title || `第${idx+1}章`,
          url: `local://${bookId}/${c.id}`,
          index: idx,
          content: c.content || '',
        }))
      } else {
        chapters.value = [{ id: 0, title: '正文', url: props.book.bookUrl, index: 0, content: props.book.content || '' }]
      }
    } catch (err: any) {
      console.error('[BookDetail] 加载本地目录失败:', err)
      message.error('加载目录失败')
    }
    await restoreProgress()
    return
  }

  // ===== 从 store 重新获取完整书源 =====
  const allSources = await window.electronAPI.store.get('sources')
  const fullSource = allSources.find(s => s.bookSourceName === props.book?.originName)
  
  const sourceToUse = fullSource || props.source
  if (!sourceToUse) {
    console.warn('[BookDetail] 找不到书源')
    loadingToc.value = false
    return
  }

  loadingToc.value = true
  try {
    const tocUrl = props.book.tocUrl || props.book.bookUrl
    
    // 清理 source，确保可克隆
    const cleanSource = JSON.parse(JSON.stringify({
      id: sourceToUse.id || '',
      bookSourceName: sourceToUse.bookSourceName || '',
      bookSourceUrl: sourceToUse.bookSourceUrl || sourceToUse.url || '',
      url: sourceToUse.url || '',
      searchUrl: sourceToUse.searchUrl || '',
      ruleToc: sourceToUse.ruleToc || {},
      ruleContent: sourceToUse.ruleContent || {},
      ruleBookInfo: sourceToUse.ruleBookInfo || {},
      ruleSearch: sourceToUse.ruleSearch || {},
      header: typeof sourceToUse.header === 'string' ? sourceToUse.header : null,
      enabled: true,
    }))

    // 传递 book.kind
    const bookWithKind = {
      ...props.book,
      kind: props.book?.kind || ''
    }

    const result = await window.electronAPI.invoke('engine-get-toc', cleanSource, tocUrl, { book: bookWithKind })
    if (result.success) {
      chapters.value = result.data || []
      // 存入缓存
      if (chapters.value.length > 0 && props.book?.bookUrl) {
        setTocCache(props.book.bookUrl, chapters.value)
      }
    } else {
      message.warning('加载目录失败: ' + (result.error || '未知错误'))
    }
  } catch (err: any) {
    console.error('[BookDetail] 加载目录失败:', err)
    message.error('加载目录失败: ' + err.message)
  } finally {
    loadingToc.value = false
    await restoreProgress()
  }
}

async function restoreProgress() {
  if (!props.book || chapters.value.length === 0) return
  let targetChapterId = (props.book as any).current_chapter_id
  if (targetChapterId === undefined || targetChapterId === null) {
    const progress = await readingStore.loadProgress(String(props.book.bookUrl))
    if (progress) targetChapterId = progress.chapterId
  }
  if (targetChapterId !== undefined && targetChapterId !== null) {
    const found = chapters.value.find(c => Number(c.id) === Number(targetChapterId))
    if (found) {
      currentChapterId.value = found.id
      const index = chapters.value.findIndex(c => c.id === found.id)
      if (index !== -1) {
        goToPage(Math.floor(index / pageSize) + 1)
        await nextTick()
        scrollToCurrentChapter()
      }
    } else {
      currentChapterId.value = chapters.value[0]?.id || null
    }
  } else {
    currentChapterId.value = chapters.value[0]?.id || null
  }
}

function handleChapterClick(ch: Chapter) {
  if (!props.book) return
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  if (idx === -1) return
  currentChapterId.value = ch.id
  const bookWithProgress = { ...props.book, current_chapter_id: idx }
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
  const bookWithProgress = { ...props.book, current_chapter_id: chapterIndex }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(bookWithProgress, props.source, chapters.value)
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
    title: '确认移出',
    content: `确定将《${props.book.name}》移出书架？`,
    positiveText: '移出',
    negativeText: '取消',
    onPositiveClick: async () => {
      await bookshelfStore.removeBook(props.book.id)
      message.success(`已移出《${props.book.name}》`)
      handleClose()
    },
  })
}

function handleClose() { emit('close') }

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    const placeholder = parent.querySelector('.cover-placeholder')
    if (placeholder) (placeholder as HTMLElement).style.display = 'flex'
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') handleClose()
}

// ===== 缓存函数 =====
const TOC_CACHE_KEY = 'toc_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

function getTocCache(bookId: string | number): { chapters: Chapter[]; timestamp: number; totalChapters: number } | null {
  try {
    const raw = localStorage.getItem(`${TOC_CACHE_KEY}_${bookId}`)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`${TOC_CACHE_KEY}_${bookId}`)
      return null
    }
    return entry
  } catch { return null }
}

function setTocCache(bookId: string | number, chapters: Chapter[]) {
  try {
    localStorage.setItem(`${TOC_CACHE_KEY}_${bookId}`, JSON.stringify({
      chapters,
      timestamp: Date.now(),
      totalChapters: chapters.length
    }))
  } catch {}
}

function clearTocCache(bookId: string | number) {
  localStorage.removeItem(`${TOC_CACHE_KEY}_${bookId}`)
}

async function refreshTocInBackground(bookId: string | number) {
  try {
    const allSources = await window.electronAPI.store.get('sources')
    const fullSource = allSources.find(s => s.bookSourceName === props.book?.originName)
    const sourceToUse = fullSource || props.source
    if (!sourceToUse) return

    const tocUrl = props.book?.tocUrl || props.book?.bookUrl
    if (!tocUrl) return

    const cleanSource = JSON.parse(JSON.stringify({
      id: sourceToUse.id || '',
      bookSourceName: sourceToUse.bookSourceName || '',
      bookSourceUrl: sourceToUse.bookSourceUrl || sourceToUse.url || '',
      url: sourceToUse.url || '',
      searchUrl: sourceToUse.searchUrl || '',
      ruleToc: sourceToUse.ruleToc || {},
      ruleContent: sourceToUse.ruleContent || {},
      ruleBookInfo: sourceToUse.ruleBookInfo || {},
      ruleSearch: sourceToUse.ruleSearch || {},
      header: typeof sourceToUse.header === 'string' ? sourceToUse.header : null,
      enabled: true,
    }))

    const bookWithKind = {
      ...props.book,
      kind: props.book?.kind || ''
    }

    const result = await window.electronAPI.invoke('engine-get-toc', cleanSource, tocUrl, { book: bookWithKind })
    if (result.success && result.data && result.data.length > 0) {
      const cached = getTocCache(bookId)
      if (!cached || cached.totalChapters !== result.data.length) {
        chapters.value = result.data
        setTocCache(bookId, result.data)
        console.log('[BookDetail] 后台更新目录:', result.data.length, '章')
      }
    }
  } catch (e) {
    console.debug('[BookDetail] 后台刷新失败:', e)
  }
}

// 在 loadToc 中检查缓存
const origLoadToc = loadToc
loadToc = async function() {
  if (!props.book) return

  // 检查缓存
  const cached = props.book?.bookUrl ? getTocCache(props.book.bookUrl) : null
  if (cached && cached.chapters.length > 0) {
    chapters.value = cached.chapters
    loadingToc.value = false
    restoreProgress().catch(() => {})
    if (props.book?.bookUrl) {
      refreshTocInBackground(props.book.bookUrl)
    }
    return
  }

  // 没有缓存，正常加载
  await origLoadToc.call(this)
}

onMounted(() => {
  loadToc()
  document.addEventListener('keydown', handleKeydown)
  nextTick(() => {
    const container = containerRef.value
    if (container) {
      container.setAttribute('tabindex', '-1')
      container.focus()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

watch(() => props.book, () => loadToc())
</script>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.25s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
.detail-container {
  width: 100%;
  max-width: 820px;
  height: 90vh;
  max-height: 800px;
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  outline: none;
}
.detail-header {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 12px;
}
.btn-back { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); }
.detail-title { font-size: 17px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.detail-body { display: flex; gap: 24px; padding: 20px 24px; flex-shrink: 0; border-bottom: 1px solid var(--border-color); }
.detail-cover { width: 120px; min-width: 120px; height: 170px; background: var(--bg-hover); border-radius: 8px; overflow: hidden; position: relative; }
.detail-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 40px; color: var(--brand); background: var(--bg-hover); }
.cover-source { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 8px; background: rgba(0, 0, 0, 0.7); color: rgba(255, 255, 255, 0.7); font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.progress-ring { position: absolute; bottom: -8px; right: -8px; width: 44px; height: 44px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25)); }
.ring-bg { stroke: var(--bg-card); stroke-width: 3; }
.ring-fill { stroke: var(--brand); stroke-width: 3; stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transition: stroke-dasharray 0.6s ease; }
.ring-text { font-size: 9px; font-weight: 600; fill: var(--text-primary); }
.detail-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.book-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; }
.book-author { font-size: 14px; color: var(--text-secondary); margin: 0; }
.book-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.meta-tag { font-size: 12px; padding: 2px 10px; border-radius: 4px; background: var(--bg-hover); color: var(--text-secondary); }
.progress-bar-container { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
.progress-bar { flex: 1; height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand-hover)); border-radius: 2px; transition: width 0.5s cubic-bezier(0.4,0,0.2,1); }
.progress-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.book-intro { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.detail-toc { flex: 1; display: flex; flex-direction: column; padding: 0 20px 4px; min-height: 0; overflow: hidden; }
.toc-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 0 6px; flex-shrink: 0; border-bottom: 1px solid var(--border-color); }
.toc-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
.toc-count { font-size: 13px; color: var(--text-muted); }
.toc-toolbar { display: flex; align-items: center; gap: 12px; padding: 6px 0; flex-shrink: 0; flex-wrap: wrap; }
.toc-search { flex: 1; min-width: 140px; }
.toc-search-input { width: 100%; padding: 5px 12px; font-size: 13px; background: var(--bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); outline: none; transition: border-color 0.2s; }
.toc-search-input:focus { border-color: var(--brand); }
.toc-search-input::placeholder { color: var(--text-muted); }
.toc-pagination { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.page-btn { width: 30px; height: 30px; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.page-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--text-primary); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-info { font-size: 13px; color: var(--text-secondary); min-width: 50px; text-align: center; }
.toc-list { flex: 1; overflow-y: auto; padding: 4px 0 12px; display: flex; flex-direction: column; gap: 2px; }
.toc-item { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; border-radius: 8px; cursor: pointer; transition: all 0.15s; gap: 12px; outline: none; }
.toc-item::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%) scaleY(0); width: 3px; height: 60%; background: var(--brand); border-radius: 0 2px 2px 0; transition: transform 0.2s ease; }
.toc-item:hover::before { transform: translateY(-50%) scaleY(0.6); }
.toc-item.active::before { transform: translateY(-50%) scaleY(1); }
.toc-item:hover { background: var(--bg-hover); }
.toc-item.active { background: rgba(var(--brand-rgb, 212, 160, 23), 0.08); }
.toc-item.active .toc-chapter-title { color: var(--brand); }
.toc-chapter-title { font-size: 14px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toc-item.vip .toc-chapter-title { color: #d4a017; }
.toc-badges { display: flex; gap: 4px; flex-shrink: 0; }
.badge-vip { font-size: 10px; padding: 1px 8px; border-radius: 4px; background: rgba(212, 160, 23, 0.15); color: #d4a017; }
.badge-current { font-size: 10px; padding: 1px 8px; border-radius: 4px; background: rgba(76, 175, 80, 0.15); color: #4caf50; }
.toc-empty, .toc-loading { display: flex; align-items: center; justify-content: center; gap: 12px; height: 100%; min-height: 120px; color: var(--text-muted); font-size: 14px; }
.loading-spinner { width: 20px; height: 20px; border: 2px solid var(--border-color); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-footer { display: flex; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid var(--border-color); flex-shrink: 0; }
.footer-spacer { flex: 1; }
.btn-danger-ghost { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 13px; color: var(--text-muted); background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.btn-danger-ghost:hover { color: #e74c3c; background: rgba(231, 76, 60, 0.06); }
.btn-primary { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 22px; font-size: 14px; font-weight: 500; color: #0d0d0d; background: linear-gradient(135deg, var(--brand), var(--brand-hover)); border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; min-width: 130px; box-shadow: 0 2px 8px rgba(var(--brand-rgb, 212, 160, 23), 0.3); }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(var(--brand-rgb, 212, 160, 23), 0.35); }
.btn-primary:active { transform: translateY(0); box-shadow: 0 1px 4px rgba(var(--brand-rgb, 212, 160, 23), 0.2); }
.btn-secondary { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 14px; font-weight: 500; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.toc-list::-webkit-scrollbar { width: 4px; }
.toc-list::-webkit-scrollbar-track { background: transparent; }
.toc-list::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
.toc-list::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>

