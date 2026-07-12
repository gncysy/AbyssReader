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
        <div class="result-list">
          <div
            v-for="book in searchResults[sourceId]"
            :key="book.bookUrl"
            class="result-item"
          >
            <div class="result-cover">
              <img
                v-if="book.coverUrl"
                :src="book.coverUrl"
                loading="lazy"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-else class="cover-placeholder">{{ book.name?.charAt(0) || '?' }}</div>
            </div>
            <div class="result-info">
              <h4>{{ book.name || '无标题' }}</h4>
              <p>{{ book.author || '佚名' }}</p>
              <p v-if="book.lastChapter" class="result-last">{{ book.lastChapter }}</p>
            </div>
            <button class="btn-add" @click="addToShelf(book, sourceId)">+ 添加</button>
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
import { handleApiError } from '@/utils/error'
import type { Book, BookSource } from '@shared/types'

defineOptions({
  name: 'Search'
})

const message = useMessage()
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

  const cleanSources = enabledSources.map((source: any) => ({
    id: source.id,
    name: source.name,
    url: source.url,
    searchUrl: source.searchUrl,
    ruleSearch: source.ruleSearch || {},
    ruleBookInfo: source.ruleBookInfo || {},
    ruleToc: source.ruleToc || {},
    ruleContent: source.ruleContent || {},
    ruleExplore: source.ruleExplore || {},
    exploreUrl: source.exploreUrl || '',
    enabled: source.enabled,
    group: source.group || null,
    comment: source.comment || null,
    weight: source.weight || 0,
    header: source.header || null,
    enabledCookieJar: source.enabledCookieJar || false,
    jsLib: source.jsLib || null,
    loginUrl: source.loginUrl || null,
    loginUi: source.loginUi || null,
    respondTime: source.respondTime || 0,
    lastUpdateTime: source.lastUpdateTime || Date.now(),
    bookUrlPattern: source.bookUrlPattern || null,
    code: source.code || null,
    concurrentRate: source.concurrentRate || 0,
    _legado: source._legado || false,
    _desktop: true,
  }))

  const finalSources = JSON.parse(JSON.stringify(cleanSources))

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
    const result = await window.electronAPI.invoke('engine-batch-search-stream', finalSources, kw)

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

async function addToShelf(book: Book, sourceId: string) {
  const source = sources.value.find(s => s.id === sourceId)
  if (!source) {
    message.error('书源未找到')
    return
  }

  if (!book.name || !book.bookUrl) {
    message.warning('书籍信息不完整')
    return
  }

  try {
    const books = await store.get('books') || []
    if (books.find((b: Book) => b.bookUrl === book.bookUrl)) {
      message.warning('该书已在书架中')
      return
    }

    const newBook: Book = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
      name: book.name,
      author: book.author || '未知作者',
      coverUrl: book.coverUrl || '',
      intro: book.intro || '',
      lastChapter: book.lastChapter || '',
      bookUrl: book.bookUrl,
      tocUrl: book.tocUrl || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    books.unshift(newBook)
    await store.set('books', books)
    message.success(`已添加《${book.name}》到书架`)
  } catch (err: any) {
    message.error('添加失败: ' + (err.message || '未知错误'))
  }
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
.result-group { margin-bottom: 24px; }
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.group-header h3 { font-size: 16px; font-weight: 500; color: var(--text-primary); }
.group-header span { font-size: 13px; color: var(--text-muted); }

.result-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: default;
  transition: all 0.2s;
}
.result-item:hover { border-color: var(--brand); }

.result-cover {
  width: 40px;
  height: 56px;
  flex-shrink: 0;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}
.result-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--brand);
}

.result-info { flex: 1; min-width: 0; }
.result-info h4 { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.result-info p { font-size: 12px; color: var(--text-muted); }
.result-last { font-size: 12px; color: var(--text-muted); opacity: 0.6; margin-top: 2px; }

.btn-add {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--brand);
  background: var(--bg-active);
  border: 1px solid var(--brand);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}
.result-item:hover .btn-add { opacity: 1; }
.btn-add:hover { background: var(--brand); color: white; }

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
