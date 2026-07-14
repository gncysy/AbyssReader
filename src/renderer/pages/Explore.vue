<template>
  <div class="explore-page">
    <header class="page-header">
      <h1 class="page-title">发现</h1>
      <p class="page-subtitle">浏览书源分类</p>
    </header>

    <div class="explore-toolbar">
      <select v-model="selectedSourceId" class="select-source" @change="onSourceChange">
        <option value="">选择书源...</option>
        <option v-for="source in sources" :key="source.id" :value="source.id">
          {{ source.bookSourceName || source.name }}
        </option>
      </select>

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
    </div>

    <div v-if="loading" class="books-grid">
      <div v-for="i in 12" :key="i" class="book-card-skeleton">
        <div class="skeleton" style="aspect-ratio:2/3;border-radius:12px;"></div>
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
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/api'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const sources = ref<BookSource[]>([])
const selectedSourceId = ref('')
const categories = ref<{ title: string; url: string; style?: any }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)

function cleanSource(source: BookSource): any {
  return {
    id: String(source.id || ''),
    name: String(source.bookSourceName || source.name || ''),
    bookSourceName: String(source.bookSourceName || source.name || ''),
    bookSourceUrl: String(source.bookSourceUrl || source.url || ''),
    url: String(source.url || ''),
    searchUrl: String(source.searchUrl || ''),
    ruleSearch: source.ruleSearch || {},
    ruleBookInfo: source.ruleBookInfo || {},
    ruleToc: source.ruleToc || {},
    ruleContent: source.ruleContent || {},
    ruleExplore: source.ruleExplore || {},
    exploreUrl: String(source.exploreUrl || ''),
    enabled: true,
    header: typeof source.header === 'string' ? source.header : null,
    code: source.code ? String(source.code) : null,
    _legado: !!source.code,
    _desktop: true,
  }
}

async function loadSources() {
  try {
    const raw = await store.get('sources')
    sources.value = raw || []
    if (sources.value.length > 0) {
      const firstWithExplore = sources.value.find(s => s.exploreUrl && s.exploreUrl.trim())
      if (firstWithExplore) {
        selectedSourceId.value = firstWithExplore.id
        await loadCategories()
      } else {
        selectedSourceId.value = sources.value[0].id
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

  const source = sources.value.find(s => s.id === selectedSourceId.value)
  if (!source || !source.exploreUrl || !source.exploreUrl.trim()) {
    categories.value = []
    return
  }

  try {
    const result = await window.electronAPI.invoke('get-explore-categories', source.id)
    if (result && Array.isArray(result) && result.length > 0) {
      categories.value = result
      if (categories.value.length > 0) {
        await exploreCategory(categories.value[0])
      }
    } else {
      categories.value = []
    }
  } catch (err: any) {
    console.error('[Explore] 加载分类失败:', err)
    categories.value = []
  }
}

async function onSourceChange() {
  await loadCategories()
}

async function exploreCategory(cat: { title: string; url: string }) {
  const source = sources.value.find(s => s.id === selectedSourceId.value)
  if (!source) {
    console.warn('[Explore] 书源未找到')
    return
  }

  currentCategory.value = cat
  loading.value = true
  books.value = []

  if (!cat.url || cat.url.trim() === '') {
    loading.value = false
    return
  }

  try {
    const cleanSource = {
      id: String(source.id || ''),
      name: String(source.bookSourceName || source.name || ''),
      bookSourceName: String(source.bookSourceName || source.name || ''),
      bookSourceUrl: String(source.bookSourceUrl || source.url || ''),
      url: String(source.url || ''),
      searchUrl: String(source.searchUrl || ''),
      exploreUrl: String(source.exploreUrl || ''),
      ruleExplore: {
        bookList: source.ruleExplore?.bookList || '',
        name: source.ruleExplore?.name || '',
        author: source.ruleExplore?.author || '',
        bookUrl: source.ruleExplore?.bookUrl || '',
        coverUrl: source.ruleExplore?.coverUrl || '',
        intro: source.ruleExplore?.intro || '',
        kind: source.ruleExplore?.kind || '',
        lastChapter: source.ruleExplore?.lastChapter || '',
        wordCount: source.ruleExplore?.wordCount || '',
      },
      ruleSearch: source.ruleSearch || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleBookInfo: source.ruleBookInfo || {},
      header: typeof source.header === 'string' ? source.header : null,
      enabled: true,
    }

    let categoryUrl = cat.url
    if (categoryUrl && categoryUrl.includes('{{page}}')) {
      categoryUrl = categoryUrl.replace(/\{\{page\}\}/g, '1')
    }
    console.log('[Explore] 调用 explore-books-by-id:', { source: cleanSource.name, categoryUrl })
    const result = await window.electronAPI.invoke('explore-books-by-id', source.id, categoryUrl, 1)
    console.log('[Explore] 返回结果:', result)

    if (result && result.success && Array.isArray(result.data)) {
      books.value = result.data
    } else if (result && Array.isArray(result)) {
      books.value = result
    } else {
      books.value = []
    }
  } catch (err: any) {
    console.error('[Explore] 加载书籍失败:', err)
    books.value = []
  } finally {
    loading.value = false
  }
}

async function addToShelf(book: Book) {
  const source = sources.value.find(s => s.id === selectedSourceId.value)
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

    const newBook = {
      ...book,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      origin: source.bookSourceUrl || source.url || '',
      originName: source.bookSourceName || source.name || '',
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
.explore-page { position: relative; z-index: 1; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

.explore-toolbar { margin-bottom: 16px; }
.select-source {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 12px;
  outline: none;
  min-width: 180px;
}
.select-source:focus { border-color: var(--brand); }
.select-source option { background: var(--bg-card); color: var(--text-primary); }

.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
}
.category-tag:hover { color: var(--text-primary); }
.category-tag.active { color: var(--brand); border-bottom-color: var(--brand); }

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}
.book-card {
  cursor: pointer;
  transition: transform 0.2s;
}
.book-card:hover { transform: translateY(-4px); }

.book-cover {
  aspect-ratio: 2/3;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.book-cover img { width: 100%; height: 100%; object-fit: cover; }
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

.book-info { margin-top: 8px; }
.book-info h4 { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.book-info p { font-size: 12px; color: var(--text-muted); }
.book-last { font-size: 11px; color: var(--text-muted); opacity: 0.6; margin-top: 2px; }

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

.book-card-skeleton .skeleton { background: var(--bg-card); border-radius: 4px; animation: shimmer 1.5s infinite; }
@keyframes shimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
</style>
