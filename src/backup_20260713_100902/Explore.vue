<template>
  <div class="explore-page">
    <header class="page-header">
      <h1 class="page-title">发现</h1>
      <p class="page-subtitle">浏览书源分类</p>
    </header>

    <div class="explore-toolbar">
      <div class="toolbar-row">
        <select v-model="selectedSourceId" class="select-source" @change="onSourceChange">
          <option value="">选择书源...</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">
            {{ source.name }}
          </option>
        </select>

        <button class="btn-refresh" @click="refreshCategories" :disabled="!selectedSourceId || loading">
          ⟳ 刷新分类
        </button>
      </div>

      <div v-if="categories.length > 0" class="categories">
        <button
          v-for="cat in categories"
          :key="cat.url || cat.title"
          class="category-tag"
          :class="{ active: currentCategory?.url === cat.url }"
          @click="exploreCategory(cat)"
        >
          {{ cat.title }}
        </button>
      </div>

      <div v-if="books.length > 0" class="pagination">
        <button class="btn-page" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
          ‹ 上一页
        </button>
        <span class="page-info">第 {{ currentPage }} 页</span>
        <button class="btn-page" :disabled="!hasNextPage" @click="goToPage(currentPage + 1)">
          下一页 ›
        </button>
        <span v-if="totalBooks > 0" class="total-info">共 {{ totalBooks }} 本书</span>
      </div>
    </div>

    <div v-if="loading" class="books-grid">
      <div v-for="i in 12" :key="i" class="book-card-skeleton">
        <div class="skeleton" style="aspect-ratio:2/3;border-radius:12px;"></div>
        <div class="skeleton" style="height:16px;width:80%;margin-top:12px;"></div>
        <div class="skeleton" style="height:12px;width:50%;margin-top:6px;"></div>
      </div>
    </div>

    <div v-else-if="books.length > 0" class="books-grid">
      <div
        v-for="book in books"
        :key="book.bookUrl"
        class="book-card"
        @click="addToShelf(book)"
      >
        <div class="book-cover">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            loading="lazy"
            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
          />
          <div v-else class="book-cover-placeholder">{{ book.name?.charAt(0) || '?' }}</div>
        </div>
        <div class="book-info">
          <h4>{{ book.name || '未命名' }}</h4>
          <p>{{ book.author || '佚名' }}</p>
          <p v-if="book.lastChapter" class="book-last">{{ book.lastChapter }}</p>
        </div>
      </div>
    </div>

    <div v-else-if="selectedSourceId && !loading" class="empty-state">
      <div class="empty-icon">🧭</div>
      <h3>{{ categories.length === 0 ? '该书源暂无分类' : '选择分类开始浏览' }}</h3>
      <p>{{ categories.length === 0 ? '试试切换其他书源' : '点击上方分类标签查看书籍' }}</p>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📖</div>
      <h3>选择书源开始发现</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { store, source as sourceApi } from '@/api'
import { ipcInvoke } from '@/utils/ipc'
import { handleApiError } from '@/utils/error'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()

const sources = ref<BookSource[]>([])
const selectedSourceId = ref('')
const categories = ref<{ title: string; url: string }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)
const currentPage = ref(1)
const totalBooks = ref(0)

const hasNextPage = computed(() => {
  return books.value.length >= 20
})

const selectedSource = computed(() => {
  return sources.value.find(s => s.id === selectedSourceId.value)
})

async function loadSources() {
  try {
    const raw = await store.get('sources')
    sources.value = raw || []
    if (sources.value.length > 0) {
      const firstEnabled = sources.value.find(s => s.enabledExplore !== false && s.exploreUrl)
      if (firstEnabled) {
        selectedSourceId.value = firstEnabled.id
        await loadCategories()
      } else if (sources.value.length > 0) {
        selectedSourceId.value = sources.value[0].id
        await loadCategories()
      }
    }
  } catch (err: any) {
    message.error('加载书源失败: ' + err.message)
  }
}

async function loadCategories() {
  if (!selectedSourceId.value) {
    categories.value = []
    return
  }

  const source = selectedSource.value
  if (!source || !source.exploreUrl) {
    categories.value = []
    message.warning('该书源没有发现配置')
    return
  }

  try {
    console.log('[Explore] 通过 IPC 解析分类:', source.exploreUrl)
    const result = await ipcInvoke('engine-parse-explore-categories', source, source.exploreUrl, { page: currentPage.value })
    const parsed = result.success ? result.data : []
    categories.value = parsed
    if (categories.value.length > 0) {
      currentCategory.value = categories.value[0]
      await exploreCategory(categories.value[0])
    } else {
      books.value = []
      message.info('该书源暂无分类')
    }
  } catch (err: any) {
    message.error('加载分类失败: ' + err.message)
    categories.value = []
  }
}

async function refreshCategories() {
  await loadCategories()
}

async function onSourceChange() {
  currentPage.value = 1
  books.value = []
  categories.value = []
  await loadCategories()
}

async function exploreCategory(cat: { title: string; url: string }) {
  const source = selectedSource.value
  if (!source) {
    loading.value = false
    return
  }

  currentCategory.value = cat
  currentPage.value = 1
  await fetchExplore(cat.url)
}

async function fetchExplore(url: string) {
  const source = selectedSource.value
  if (!source) return

  loading.value = true
  books.value = []

  try {
    console.log('[Explore] 通过 IPC 执行发现:', url)
    const result = await ipcInvoke('engine-explore', source, url, { page: currentPage.value })
    if (!result.success) {
      throw new Error(result.error || '加载失败')
    }
    books.value = result.data || []
    totalBooks.value = books.value.length
  } catch (err: any) {
    const errorMsg = handleApiError(err, '加载失败')
    message.error(errorMsg)
    console.error('[Explore] 加载错误:', err)
  } finally {
    loading.value = false
  }
}

async function goToPage(page: number) {
  if (page < 1) return
  if (!currentCategory.value) return

  currentPage.value = page
  await fetchExplore(currentCategory.value.url)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function addToShelf(book: Book) {
  const source = selectedSource.value
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
      ...book,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
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
})
</script>

<style scoped>
.explore-page {
  position: relative;
  z-index: 1;
  padding-bottom: 40px;
}

.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
}
.page-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
}

.explore-toolbar {
  margin-bottom: 20px;
}

.toolbar-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.select-source {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  min-width: 180px;
}
.select-source:focus {
  border-color: var(--brand);
}
.select-source option {
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-refresh {
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-refresh:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--brand);
}
.btn-refresh:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  padding: 8px 0;
}

.category-tag {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.category-tag:hover {
  color: var(--text-primary);
}
.category-tag.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
}

.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  flex-wrap: wrap;
}

.btn-page {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-page:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--brand);
}
.btn-page:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
}
.total-info {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: 8px;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}

.book-card {
  cursor: pointer;
  transition: transform 0.2s;
}
.book-card:hover {
  transform: translateY(-4px);
}

.book-cover {
  aspect-ratio: 2/3;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.book-cover-placeholder {
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
  margin-top: 8px;
}
.book-info h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-info p {
  font-size: 12px;
  color: var(--text-muted);
}
.book-last {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.6;
  margin-top: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  text-align: center;
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}
.empty-state h3 {
  font-size: 20px;
  color: var(--text-secondary);
}
.empty-state p {
  font-size: 14px;
  color: var(--text-muted);
}

.book-card-skeleton .skeleton {
  background: var(--bg-card);
  border-radius: 4px;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}
</style>
