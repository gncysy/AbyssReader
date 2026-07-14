<template>
  <div class="search-page">
    <header class="page-header">
      <h1 class="page-title">搜索</h1>
      <p class="page-subtitle">多书源并发搜索</p>
    </header>

    <div class="search-bar">
      <div class="search-input-wrapper">
        <input
          ref="searchInput"
          v-model="keyword"
          type="text"
          placeholder="输入书名或作者..."
          class="search-input"
          @keydown.enter="doSearch"
        />
      </div>
      <div class="search-actions">
        <button class="btn-primary" :disabled="loading || !keyword.trim()" @click="doSearch">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button class="btn-secondary" @click="clearResults">清空</button>
      </div>
    </div>

    <div v-if="loading" class="search-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: (completedCount / totalSources * 100) + '%' }"></div>
      </div>
      <span class="progress-text">{{ completedCount }} / {{ totalSources }}</span>
    </div>

    <div v-if="resultSourceIds.length > 0" class="results">
      <div v-for="sourceId in resultSourceIds" :key="sourceId" class="result-group">
        <div class="group-header">
          <h3>{{ getSourceName(sourceId) }}</h3>
          <span>{{ searchResults[sourceId]?.length || 0 }} 本</span>
        </div>
        <!-- 卡片网格 -->
        <div class="books-grid">
          <div
            v-for="book in searchResults[sourceId]"
            :key="book.bookUrl"
            class="book-card"
            @click="openBookDetail(book, sourceId)"
          >
            <div class="book-cover">
              <img
                v-if="book.coverUrl"
                :src="book.coverUrl"
                loading="lazy"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-else class="cover-placeholder">{{ book.name?.charAt(0) || '?' }}</div>
            </div>
            <div class="book-info">
              <h4>{{ book.name || '无标题' }}</h4>
              <p>{{ book.author || '佚名' }}</p>
              <p v-if="book.lastChapter" class="book-last">{{ book.lastChapter }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="searched && !loading" class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>未找到相关书籍</h3>
      <p>试试其他关键词</p>
    </div>

    <div v-else class="empty-state initial">
      <div class="empty-icon">📖</div>
      <h3>输入关键词开始搜索</h3>
      <p>支持书名、作者搜索，多书源并发</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store, engine as engineApi } from '@/api'
import { useBookshelfStore } from '@/store'
import { handleApiError } from '@/utils/error'
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

let unlistenProgress: (() => void) | null = null

const resultSourceIds = computed(() =>
  Object.keys(searchResults.value).filter(id => searchResults.value[id]?.length > 0)
)

async function loadSources() {
  try {
    const raw = await store.get('sources')
    sources.value = raw || []
  } catch (err: any) {
    message.error('加载书源失败: ' + err.message)
  }
}

function getSourceName(id: string) {
  return sources.value.find(s => s.id === id)?.name || id
}

function clearResults() {
  searchResults.value = {}
  searched.value = false
  completedCount.value = 0
  totalSources.value = 0
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) {
    message.warning('请输入关键词')
    searchInput.value?.focus()
    return
  }

  const enabledSources = sources.value.filter(s => s.enabled)
  if (enabledSources.length === 0) {
    message.warning('没有已启用的书源')
    return
  }

  loading.value = true
  searched.value = true
  completedCount.value = 0
  totalSources.value = enabledSources.length
  searchResults.value = {}

  const cleanSources = enabledSources.map((source: any) => {
    const clean = JSON.parse(JSON.stringify(source))
    return clean
  })

  if (unlistenProgress) {
    unlistenProgress()
    unlistenProgress = null
  }

  unlistenProgress = window.electronAPI.on('search-progress', (data: any) => {
    completedCount.value = data.completed
    const cleanBooks = (data.books || []).map((book: any) => ({
      id: book.id,
      sourceId: book.sourceId,
      sourceName: book.sourceName,
      name: book.name,
      author: book.author,
      coverUrl: book.coverUrl || null,
      intro: book.intro || null,
      kind: book.kind || null,
      lastChapter: book.lastChapter || null,
      bookUrl: book.bookUrl,
      tocUrl: book.tocUrl || null,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    }))
    searchResults.value[data.sourceId] = cleanBooks
  })

  try {
    const result = await window.electronAPI.invoke('engine-batch-search-stream', cleanSources, kw)

    if (!result.success) {
      throw new Error(result.error)
    }

    const data = result.data || {}
    let totalBooks = 0
    for (const [id, books] of Object.entries(data)) {
      if (!searchResults.value[id]) {
        const cleanBooks = (books || []).map((book: any) => ({
          id: book.id,
          sourceId: book.sourceId,
          sourceName: book.sourceName,
          name: book.name,
          author: book.author,
          coverUrl: book.coverUrl || null,
          intro: book.intro || null,
          kind: book.kind || null,
          lastChapter: book.lastChapter || null,
          bookUrl: book.bookUrl,
          tocUrl: book.tocUrl || null,
          createdAt: book.createdAt,
          updatedAt: book.updatedAt,
        }))
        searchResults.value[id] = cleanBooks
        totalBooks += cleanBooks.length
      } else {
        totalBooks += searchResults.value[id].length
      }
    }

    if (totalBooks === 0) {
      message.info('未找到相关书籍')
    } else {
      message.success(`找到 ${totalBooks} 本书`)
    }
  } catch (err: any) {
    const errorMsg = handleApiError(err, '搜索失败，请稍后重试')
    message.error(errorMsg)
    console.error('[Search] 搜索错误:', err)
  } finally {
    loading.value = false
    if (unlistenProgress) {
      unlistenProgress()
      unlistenProgress = null
    }
  }
}

function openBookDetail(book: Book, sourceId: string) {
  const source = sources.value.find(s => s.id === sourceId)
  if (!source) {
    message.error('书源未找到')
    return
  }
  bookshelfStore.openDetail(book, source)
}

onMounted(() => {
  loadSources()
  setTimeout(() => searchInput.value?.focus(), 100)
})

onUnmounted(() => {
  if (unlistenProgress) {
    unlistenProgress()
    unlistenProgress = null
  }
})
</script>

<style scoped>
.search-page { position: relative; z-index: 1; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.search-input-wrapper { flex: 1; }
.search-input {
  width: 100%;
  padding: 10px 16px;
  font-size: 15px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
}
.search-input:focus { border-color: var(--brand); }
.search-input::placeholder { color: var(--text-muted); }
.search-actions { display: flex; gap: 8px; }

.search-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--brand);
  border-radius: 4px;
  transition: width 0.3s;
}
.progress-text { font-size: 12px; color: var(--text-muted); }

.results { margin-top: 16px; }
.result-group { margin-bottom: 32px; }
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}
.group-header h3 { font-size: 16px; font-weight: 500; color: var(--text-primary); }
.group-header span { font-size: 13px; color: var(--text-muted); }

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.book-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}
.book-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  border-color: var(--brand);
}

.book-cover {
  aspect-ratio: 2/3;
  background: var(--bg-hover);
  overflow: hidden;
}
.book-cover img {
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

.book-info {
  padding: 8px 10px;
}
.book-info h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-info p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}
.book-last {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.6;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  text-align: center;
}
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
.empty-state h3 { font-size: 20px; color: var(--text-secondary); }
.empty-state p { font-size: 14px; color: var(--text-muted); }
.empty-state.initial { padding: 80px 0; }
</style>



