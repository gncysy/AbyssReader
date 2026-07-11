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
          {{ source.name }}
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
import { store, source as sourceApi } from '@/api'
import { handleApiError } from '@/utils/error'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const sources = ref<BookSource[]>([])
const selectedSourceId = ref('')
const categories = ref<{ title: string; url: string }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)

// 通过 IPC 调用主进程解析规则
async function parseRule(data: any, rule: string, context: any = {}): Promise<any> {
  if (!rule) return null
  try {
    const result = await window.electronAPI.invoke('parse-rule', context.source || {}, rule, data, context)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function loadSources() {
  try {
    const raw = await store.get('sources')
    sources.value = raw || []
    if (sources.value.length > 0) {
      selectedSourceId.value = sources.value[0].id
      await onSourceChange()
    }
  } catch (err: any) {
    message.error('加载书源失败: ' + err.message)
  }
}

async function onSourceChange() {
  categories.value = []
  currentCategory.value = null
  books.value = []

  if (!selectedSourceId.value) return

  try {
    const result = await sourceApi.getExploreCategories(selectedSourceId.value)
    categories.value = result || []
    if (categories.value.length > 0) {
      await exploreCategory(categories.value[0])
    }
  } catch (err: any) {
    message.error('加载分类失败: ' + err.message)
  }
}

async function parseBookItem(
  item: any,
  source: BookSource,
  rule: any
): Promise<Book | null> {
  try {
    const context = { source, baseUrl: source.url, item }

    const name = await parseRule(item, rule.name || '', context)
    if (!name || !String(name).trim()) return null

    const bookUrl = await parseRule(item, rule.bookUrl || '', context)
    if (!bookUrl) return null

    const author = await parseRule(item, rule.author || '', context) || '未知作者'
    const coverUrl = await parseRule(item, rule.coverUrl || '', context)
    const lastChapter = await parseRule(item, rule.lastChapter || '', context)
    const intro = await parseRule(item, rule.intro || '', context)

    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? String(coverUrl) : null,
      intro: intro ? String(intro).substring(0, 500) : null,
      bookUrl: String(bookUrl),
      lastChapter: lastChapter ? String(lastChapter) : null,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[Explore] 解析书籍失败:', err)
    return null
  }
}

async function exploreCategory(cat: { title: string; url: string }) {
  const source = sources.value.find(s => s.id === selectedSourceId.value)
  if (!source) {
    loading.value = false
    return
  }

  currentCategory.value = cat
  loading.value = true
  books.value = []

  if (!cat.url || cat.url.trim() === '') {
    message.info('该分类没有对应的 URL')
    loading.value = false
    return
  }

  let fullUrl = cat.url
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    const base = source.url.replace(/\/+$/, '')
    fullUrl = base + (fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl)
  }

  try {
    const response = await window.electronAPI.fetch(fullUrl, {
      method: 'GET',
      headers: source.header ? JSON.parse(source.header) : {},
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers?.['content-type'] || ''
    let data = response.data

    if (contentType.includes('application/json') || typeof data === 'object') {
      try {
        const json = typeof data === 'string' ? JSON.parse(data) : data
        const list = json.data || json.list || json.books || json.items || json
        if (Array.isArray(list)) {
          const rule = source.ruleExplore
          if (rule) {
            const parsedBooks: Book[] = []
            for (const item of list) {
              const book = await parseBookItem(item, source, rule)
              if (book) parsedBooks.push(book)
            }
            books.value = parsedBooks
            loading.value = false
            return
          }
        }
      } catch {}
    }

    const html = typeof data === 'string' ? data : String(data)
    const rule = source.ruleExplore
    if (rule && rule.bookList) {
      const context = { source, baseUrl: source.url, key: '', page: 1 }
      const listResult = await parseRule(html, rule.bookList, context)
      if (Array.isArray(listResult)) {
        const parsedBooks: Book[] = []
        for (const item of listResult) {
          const book = await parseBookItem(item, source, rule)
          if (book) parsedBooks.push(book)
        }
        books.value = parsedBooks
      }
    }
  } catch (err: any) {
    const errorMsg = handleApiError(err, '加载分类失败')
    message.error(errorMsg)
    console.error('[Explore] 加载分类错误:', err)
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

onMounted(() => loadSources())
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
}
.select-source:focus { border-color: var(--brand); }

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
