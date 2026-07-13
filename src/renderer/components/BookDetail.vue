<template>
  <div class="detail-overlay" @click.self="handleClose">
    <div class="detail-container">
      <header class="detail-header">
        <button class="btn-back" @click="handleClose">✕</button>
        <h2 class="detail-title">{{ book?.name || '加载中...' }}</h2>
      </header>

      <div class="detail-body" v-if="book">
        <div class="detail-cover">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            alt="封面"
            @error="handleImageError"
          />
          <div v-else class="cover-placeholder">{{ book.name?.charAt(0) || '?' }}</div>
        </div>
        <div class="detail-info">
          <div class="info-row"><span class="label">作者</span><span>{{ book.author || '未知' }}</span></div>
          <div class="info-row"><span class="label">分类</span><span>{{ book.kind || '未分类' }}</span></div>
          <div class="info-row"><span class="label">来源</span><span>{{ book.sourceId === 'local' ? '📁 本地文件' : (source?.name || '未知') }}</span></div>
          <div class="info-row"><span class="label">进度</span><span>{{ progressText }}</span></div>
          <div class="info-row intro-row">
            <span class="label">简介</span>
            <p class="intro-text">{{ book.intro || '暂无简介' }}</p>
          </div>
        </div>
      </div>

      <div class="detail-toc">
        <h3>目录 <span class="toc-count">{{ chapters.length }} 章</span></h3>
        <div class="toc-list" v-if="!loadingToc">
          <div
            v-for="ch in displayChapters"
            :key="ch.id"
            class="toc-item"
            :class="{ active: ch.id === currentChapterId }"
            @click="handleChapterClick(ch)"
          >
            <span>{{ ch.title }}</span>
            <span v-if="ch.isVip" class="badge-vip">VIP</span>
            <span v-if="ch.id === currentChapterId" class="badge-current">当前</span>
          </div>
          <div v-if="chapters.length === 0 && !loadingToc" class="toc-empty">暂无目录</div>
        </div>
        <div v-else class="toc-loading">加载目录中...</div>
      </div>

      <footer class="detail-footer">
        <button class="btn-danger" @click="handleRemoveFromShelf">移出书架</button>
        <button class="btn-primary" @click="handleRead">📖 继续阅读</button>
        <button class="btn-secondary" @click="handleAddToShelf">
          {{ isInShelf ? '✅ 已在书架' : '➕ 添加到书架' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useBookshelfStore, useReadingStore } from '@/store'
import { engine as engineApi, reader as readerApi } from '@/api'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{
  book: Book
  source: BookSource | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const dialog = useDialog()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()

const chapters = ref<Chapter[]>([])
const loadingToc = ref(false)
const currentChapterId = ref(0)
const isInShelf = computed(() => bookshelfStore.hasBook(props.book?.bookUrl || ''))

const displayChapters = computed(() => chapters.value.slice(0, 50))

const progressText = computed(() => {
  if (!props.book) return '未开始'
  if (chapters.value.length === 0) return '加载中...'
  const idx = chapters.value.findIndex(c => c.id === currentChapterId.value)
  if (idx === -1) return '未开始'
  return `第 ${idx + 1}/${chapters.value.length} 章`
})

async function loadToc() {
  if (!props.book || loadingToc.value) return
  
  if (props.book.sourceId === 'local') {
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

  if (!props.source) {
    console.warn('[BookDetail] 网络书籍但 source 为空')
    return
  }

  loadingToc.value = true
  try {
    let tocUrl = props.book.tocUrl || props.book.bookUrl
    let cleanSource = null
    
    try {
      cleanSource = JSON.parse(JSON.stringify(props.source))
    } catch (e) {
      cleanSource = {
        id: props.source.id,
        name: props.source.name,
        url: props.source.url,
        searchUrl: props.source.searchUrl || '',
        ruleToc: props.source.ruleToc || {},
        ruleContent: props.source.ruleContent || {},
        ruleBookInfo: props.source.ruleBookInfo || {},
        ruleSearch: props.source.ruleSearch || {},
        header: props.source.header || null,
        enabled: true,
      }
    }

    const result = await window.electronAPI.engineGetToc(cleanSource, tocUrl)

    if (result.success) {
      chapters.value = result.data || []
    } else {
      message.warning('加载目录失败: ' + (result.error || '未知错误'))
    }
  } catch (err: any) {
    console.error('[BookDetail] 加载目录失败:', err)
    message.error('加载目录失败')
  } finally {
    loadingToc.value = false
    await restoreProgress()
  }
}

async function restoreProgress() {
  if (!props.book || chapters.value.length === 0) return
  
  try {
    let targetChapterId = (props.book as any).current_chapter_id
    
    if (targetChapterId === undefined || targetChapterId === null) {
      const progress = await readingStore.loadProgress(String(props.book.id))
      if (progress) {
        targetChapterId = progress.chapterId
      }
    }
    
    if (targetChapterId !== undefined && targetChapterId !== null) {
      const found = chapters.value.find(c => Number(c.id) === Number(targetChapterId))
      if (found) {
        currentChapterId.value = found.id
      } else {
        currentChapterId.value = chapters.value[0]?.id || 0
      }
    } else {
      currentChapterId.value = chapters.value[0]?.id || 0
    }
  } catch (err) {
    console.warn('[BookDetail] 恢复进度失败:', err)
    currentChapterId.value = chapters.value[0]?.id || 0
  }
}

function handleChapterClick(ch: Chapter) {
  if (!props.book) return
  
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  if (idx === -1) return
  
  currentChapterId.value = ch.id
  
  const bookWithProgress = { ...props.book, current_chapter_id: idx }
  bookshelfStore.closeDetail()
  
  const source = props.book.sourceId === 'local' ? null : props.source
  bookshelfStore.openReader(bookWithProgress, source)
}

function handleRead() {
  if (!props.book) {
    message.error('书籍信息为空')
    return
  }
  
  let chapterIndex = 0
  if (currentChapterId.value !== undefined && currentChapterId.value !== null) {
    const found = chapters.value.findIndex(c => c.id === currentChapterId.value)
    if (found !== -1) chapterIndex = found
  }
  
  if (props.book.sourceId === 'local') {
    const bookWithProgress = { ...props.book, current_chapter_id: chapterIndex }
    bookshelfStore.closeDetail()
    bookshelfStore.openReader(bookWithProgress, null)
    return
  }
  
  if (!props.source) {
    message.error('书源未找到，请检查书源是否已导入')
    return
  }
  
  const bookWithProgress = { ...props.book, current_chapter_id: chapterIndex }
  bookshelfStore.closeDetail()
        // 清理 source
      let cleanSource = null
      if (props.source) {
        try {
          cleanSource = JSON.parse(JSON.stringify(props.source))
        } catch {
          cleanSource = {
            id: props.source.id || '',
            name: props.source.name || '',
            url: props.source.url || '',
            ruleToc: props.source.ruleToc || {},
            ruleContent: props.source.ruleContent || {},
            ruleBookInfo: props.source.ruleBookInfo || {},
            ruleSearch: props.source.ruleSearch || {},
            header: typeof props.source.header === 'string' ? props.source.header : null,
            enabled: true,
          }
        }
      }
      bookshelfStore.openReader(bookWithProgress, cleanSource)
}

async function handleAddToShelf() {
  if (isInShelf.value) {
    message.info('已在书架中')
    return
  }
  if (!props.book) return
  const success = await bookshelfStore.addBook(props.book)
  if (success) {
    message.success(`已添加《${props.book.name}》到书架`)
  } else {
    message.warning('添加失败，可能已存在')
  }
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

function handleClose() {
  emit('close')
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    const placeholder = parent.querySelector('.cover-placeholder')
    if (placeholder) {
      ;(placeholder as HTMLElement).style.display = 'flex'
    }
  }
}

onMounted(() => {
  loadToc()
})

watch(() => props.book, () => {
  loadToc()
})
</script>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

.detail-container {
  width: 100%;
  max-width: 780px;
  height: 90vh;
  max-height: 820px;
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.detail-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  min-height: 52px;
}

.btn-back {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 8px;
  margin-right: 12px;
  transition: color 0.2s;
}
.btn-back:hover { color: var(--text-primary); }

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-body {
  display: flex;
  gap: 24px;
  padding: 20px 24px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
}

.detail-cover {
  width: 140px;
  height: 190px;
  flex-shrink: 0;
  background: var(--bg-hover);
  border-radius: 8px;
  overflow: hidden;
}
.detail-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: var(--brand);
  background: var(--bg-hover);
}

.detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.info-row {
  display: flex;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}
.info-row .label {
  color: var(--text-muted);
  width: 50px;
  flex-shrink: 0;
}
.intro-row {
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.intro-row .label { width: auto; }
.intro-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow-y: auto;
  max-height: 80px;
}

.detail-toc {
  flex: 1;
  padding: 12px 24px 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.detail-toc h3 {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
  flex-shrink: 0;
}
.toc-count {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 13px;
  margin-left: 8px;
}
.toc-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}
.toc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
  gap: 8px;
}
.toc-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.toc-item.active {
  color: var(--brand);
  background: var(--bg-active);
}
.badge-vip {
  font-size: 10px;
  color: #d4a017;
  background: rgba(212, 160, 23, 0.12);
  padding: 1px 8px;
  border-radius: 4px;
}
.badge-current {
  font-size: 10px;
  color: #4caf50;
  background: rgba(76, 175, 80, 0.12);
  padding: 1px 8px;
  border-radius: 4px;
}
.toc-empty, .toc-loading {
  color: var(--text-muted);
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}

.detail-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  justify-content: flex-end;
}

.btn-primary {
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  color: #0d0d0d;
  background: var(--brand);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: var(--brand-hover);
  transform: translateY(-1px);
}

.btn-secondary {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover {
  color: var(--text-primary);
  border-color: var(--brand);
}

.btn-danger {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #c0392b;
  background: rgba(192, 57, 43, 0.10);
  border: 1px solid rgba(192, 57, 43, 0.20);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover {
  background: #c0392b;
  color: white;
}
</style>

