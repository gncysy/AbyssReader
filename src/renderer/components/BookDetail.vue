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
          <div class="info-row"><span class="label">字数</span><span>{{ book.wordCount || '未知' }}</span></div>
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
            @click="handleChapterClick(ch)"
          >
            <span>{{ ch.title }}</span>
            <span v-if="ch.isVip" class="badge-vip">VIP</span>
          </div>
          <div v-if="chapters.length === 0" class="toc-empty">暂无目录</div>
        </div>
        <div v-else class="toc-loading">加载目录中...</div>
      </div>

      <footer class="detail-footer">
        <button class="btn-primary" @click="handleRead">📖 阅读</button>
        <button class="btn-secondary" @click="handleAddToShelf">
          {{ isInShelf ? '✅ 已在书架' : '➕ 添加到书架' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useBookshelfStore } from '@/store'
import { engine as engineApi } from '@/api'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{
  book: Book
  source: BookSource | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const bookshelfStore = useBookshelfStore()

const chapters = ref<Chapter[]>([])
const loadingToc = ref(false)
const isInShelf = computed(() => bookshelfStore.hasBook(props.book?.bookUrl || ''))

const displayChapters = computed(() => chapters.value.slice(0, 50))

async function loadToc() {
  if (!props.book || !props.source) return
  if (loadingToc.value) return

  loadingToc.value = true
  try {
    let tocUrl = props.book.tocUrl || props.book.bookUrl
    let cleanSource = null
    
    try {
      cleanSource = JSON.parse(JSON.stringify(props.source))
    } catch (e) {
      console.warn('[BookDetail] source 不可序列化，使用最小对象')
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

    // 如果 tocUrl 是 book_ 占位符，尝试重新搜索获取正确的 bookUrl
    if (tocUrl && tocUrl.startsWith('book_')) {
      console.log('[BookDetail] tocUrl 是占位符，尝试重新搜索获取正确 URL')
      try {
        const searchResult = await window.electronAPI.engineSearch(cleanSource, props.book.name, 1)
        if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
          const found = searchResult.data.find((b: any) => b.name === props.book.name)
          if (found && found.bookUrl && found.bookUrl.startsWith('http')) {
            console.log('[BookDetail] 重新搜索找到正确 bookUrl:', found.bookUrl)
            const bookInfoResult = await window.electronAPI.engineGetBookInfo(cleanSource, found.bookUrl)
            if (bookInfoResult.success && bookInfoResult.data) {
              const data = bookInfoResult.data
              if (data.tocUrl && data.tocUrl.startsWith('http')) {
                tocUrl = data.tocUrl
                console.log('[BookDetail] 重新获取到 tocUrl:', tocUrl)
              }
              // 更新书籍信息到 store
              if (data.name) props.book.name = data.name
              if (data.author) props.book.author = data.author
              if (data.coverUrl) props.book.coverUrl = data.coverUrl
              if (data.intro) props.book.intro = data.intro
            }
          }
        }
      } catch (e) {
        console.warn('[BookDetail] 重新搜索失败:', e)
      }
    }

    console.log('[BookDetail] 最终 tocUrl:', tocUrl)
    const result = await window.electronAPI.engineGetToc(cleanSource, tocUrl)
    console.log('[BookDetail] engineGetToc 返回:', result)

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
  }
}

function handleChapterClick(ch: Chapter) {
  if (!props.book || !props.source) return
  const idx = chapters.value.findIndex(c => c.id === ch.id)
  if (idx === -1) return
  const bookWithProgress = { ...props.book, current_chapter_id: idx }
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(bookWithProgress, props.source)
}

function handleRead() {
  if (!props.book || !props.source) return
  bookshelfStore.closeDetail()
  bookshelfStore.openReader(props.book, props.source)
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
.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
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
.intro-row .label {
  width: auto;
}
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
}
.toc-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.badge-vip {
  font-size: 10px;
  color: #d4a017;
  background: rgba(212, 160, 23, 0.12);
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
</style>
