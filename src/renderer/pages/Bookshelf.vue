<template>
  <div class="bookshelf-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书架</h1>
        <p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索书名..."
            class="input-search"
          />
        </div>
        <button class="btn-secondary" @click="showAddUrlModal = true">添加网址</button>
        <button class="btn-secondary" @click="triggerImport">导入 TXT</button>
        <button class="btn-secondary" @click="fixBookSources">修复关联</button>
        <button class="btn-secondary" @click="refreshBooks">刷新</button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onImport" />

    <n-modal v-model:show="showAddUrlModal" preset="dialog" title="添加网址" positive-text="添加" @positive-click="addUrlBook">
      <div class="add-url-form">
        <div class="form-group">
          <label>书籍链接</label>
          <n-input v-model:value="addUrl" placeholder="输入书籍详情页或目录页链接..." />
        </div>
        <div class="form-group">
          <label>书籍变量（可选）</label>
          <n-input v-model:value="addUrlVariables" placeholder="如: 全、跳、[目录url]、单、录..." />
          <div class="form-hint">可用指令：单、直、跳、全、逆、原、图、字、动、静</div>
        </div>
        <div class="form-group">
          <label>选择书源</label>
          <select v-model="addUrlSourceId" class="form-select">
            <option v-for="source in sources" :key="source.id" :value="source.id">
              {{ source.bookSourceName || '未命名' }}
            </option>
          </select>
        </div>
      </div>
    </n-modal>

    <n-modal
      v-model:show="showFixModal"
      preset="dialog"
      title="修复书源关联"
      positive-text="确认修复"
      negative-text="取消"
      @positive-click="confirmFix"
      @negative-click="showFixModal = false"
    >
      <div class="fix-modal">
        <p>发现 <strong>{{ fixCandidates.length }}</strong> 本书未关联书源</p>
        <div v-if="fixCandidates.length > 0" class="fix-book-list">
          <div
            v-for="book in fixCandidates"
            :key="book.bookUrl"
            class="fix-book-item"
          >
            <span class="fix-book-name">{{ book.name }}</span>
            <span class="fix-book-origin">{{ book.originName || '未知来源' }}</span>
            <select v-model="book._selectedSourceId" class="fix-select">
              <option value="">选择书源...</option>
              <option
                v-for="source in sources"
                :key="source.id"
                :value="source.id"
              >
                {{ source.bookSourceName || '未命名' }}
              </option>
            </select>
          </div>
        </div>
        <div v-else class="fix-empty"><p>所有书籍都已关联书源</p></div>
      </div>
    </n-modal>

    <div v-if="bookshelfStore.loading" class="books-grid">
      <div v-for="i in 8" :key="i" class="book-card-skeleton">
        <div class="skeleton" style="aspect-ratio:2/3;border-radius:12px;"></div>
        <div class="skeleton" style="height:16px;width:80%;margin-top:12px;"></div>
        <div class="skeleton" style="height:12px;width:50%;margin-top:6px;"></div>
      </div>
    </div>

    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="books-grid">
      <div
        v-for="book in bookshelfStore.filteredBooks"
        :key="book.id"
        class="book-card"
        :class="{ 'no-source': !book.originName }"
        @click="openBook(book)"
      >
        <div class="book-cover">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            alt="封面"
            loading="lazy"
            @error="handleImageError"
          />
          <div v-else class="book-cover-placeholder">
            <span>{{ book.name?.charAt(0) || '?' }}</span>
          </div>
          <div v-if="!book.originName" class="badge-no-source">未关联</div>
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ book.name || '未命名' }}</h3>
          <p class="book-author">{{ book.author || '佚名' }}</p>
          <p v-if="book._custom" class="book-tag">{{ book._custom }}</p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>书架空空如也</h3>
      <p>导入 TXT、添加网址或搜索添加书籍</p>
      <div class="empty-actions">
        <button class="btn-primary" @click="triggerImport">导入 TXT</button>
        <button class="btn-primary" @click="showAddUrlModal = true">添加网址</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { useBookshelfStore } from '@/store'
import { store, reader as readerApi } from '@/api'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()

const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showAddUrlModal = ref(false)
const addUrl = ref('')
const addUrlVariables = ref('')
const addUrlSourceId = ref('')

const showFixModal = ref(false)
const fixCandidates = ref<any[]>([])

watch(searchText, (val) => {
  bookshelfStore.setFilter(val)
})

async function loadSources() {
  try {
    const sourceData = await store.get('sources')
    sources.value = sourceData || []
    if (sources.value.length > 0 && !addUrlSourceId.value) {
      addUrlSourceId.value = sources.value[0].id
    }
  } catch (err: any) {
    console.error('加载书源失败:', err)
  }
}

async function refreshBooks() {
  await bookshelfStore.loadBooks()
  await loadSources()
  message.success('已刷新')
}

function triggerImport() {
  fileInput.value?.click()
}

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    if (!text || text.trim().length === 0) {
      message.warning('文件内容为空')
      return
    }
    const name = file.name.replace(/\.txt$/i, '')
    const result = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks()
    message.success(`已导入《${result.name}》`)
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    input.value = ''
  }
}

async function addUrlBook() {
  if (!addUrl.value.trim()) {
    message.warning('请输入书籍链接')
    return
  }

  const source = sources.value.find(s => s.id === addUrlSourceId.value)
  if (!source) {
    message.error('请选择书源')
    return
  }

  let bookUrl = addUrl.value.trim()
  if (addUrlVariables.value.trim()) {
    const vars = addUrlVariables.value.trim()
    if (bookUrl.includes('?')) {
      bookUrl += '&' + vars
    } else {
      bookUrl += '?' + vars
    }
  }

  try {
    const cleanSource = {
      id: source.id,
      bookSourceName: source.bookSourceName || '',
      bookSourceUrl: source.bookSourceUrl || source.url || '',
      name: source.bookSourceName || '',
      url: source.url || '',
      searchUrl: source.searchUrl || '',
      ruleSearch: source.ruleSearch || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleExplore: source.ruleExplore || {},
      exploreUrl: source.exploreUrl || '',
      enabled: true,
      group: source.group || null,
      comment: source.comment || null,
      weight: source.weight || 0,
      header: typeof source.header === 'string' ? source.header : null,
      enabledCookieJar: source.enabledCookieJar || false,
      jsLib: source.jsLib || null,
      loginUrl: source.loginUrl || null,
      loginUi: source.loginUi || null,
      respondTime: source.respondTime || 0,
      lastUpdateTime: source.lastUpdateTime || Date.now(),
      bookUrlPattern: source.bookUrlPattern || null,
      code: source.code || null,
      _legado: !!source.code,
      _desktop: true,
    }

    const result = await window.electronAPI.engineGetBookInfo(cleanSource, bookUrl)
    if (!result.success || !result.data) {
      throw new Error(result.error || '获取书籍信息失败')
    }

    const bookData = result.data
    const newBook = {
      ...bookData,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      origin: source.bookSourceUrl || source.url || '',
      originName: source.bookSourceName || source.name || '',
      _custom: addUrlVariables.value.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const books = await store.get('books') || []
    books.unshift(newBook)
    await store.set('books', books)
    await bookshelfStore.loadBooks()

    message.success(`已添加《${newBook.name}》到书架`)
    showAddUrlModal.value = false
    addUrl.value = ''
    addUrlVariables.value = ''
  } catch (err: any) {
    message.error('添加失败: ' + err.message)
  }
}

async function fixBookSources() {
  await loadSources()
  const books = await store.get('books') || []
  const candidates = books.filter((b: any) => !b.originName)

  if (candidates.length === 0) {
    message.success('所有书籍都已关联书源')
    return
  }

  fixCandidates.value = candidates.map((b: any) => ({
    ...b,
    _selectedSourceId: ''
  }))

  showFixModal.value = true
}

async function confirmFix() {
  const selected = fixCandidates.value.filter(b => b._selectedSourceId)

  if (selected.length === 0) {
    message.warning('请至少为一本书选择书源')
    return
  }

  const books = await store.get('books') || []

  selected.forEach(fixBook => {
    const source = sources.value.find(s => s.id === fixBook._selectedSourceId)
    if (source) {
      const target = books.find((b: any) => b.bookUrl === fixBook.bookUrl)
      if (target) {
        target.origin = source.bookSourceUrl || source.url || ''
        target.originName = source.bookSourceName || source.name || ''
        console.log(`修复: ${target.name} -> ${target.originName}`)
      }
    }
  })

  await store.set('books', books)
  await bookshelfStore.loadBooks()

  message.success(`已修复 ${selected.length} 本书的关联`)
  showFixModal.value = false
  fixCandidates.value = []
}

function cleanSource(source: any): any {
  if (!source) return null
  try {
    return JSON.parse(JSON.stringify({
      id: source.id,
      bookSourceName: source.bookSourceName || '',
      bookSourceUrl: source.bookSourceUrl || source.url || '',
      name: source.bookSourceName || '',
      url: source.url || '',
      searchUrl: source.searchUrl || '',
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleSearch: source.ruleSearch || {},
      header: typeof source.header === 'string' ? source.header : null,
      enabled: true,
    }))
  } catch {
    return {
      id: source.id || '',
      bookSourceName: source.bookSourceName || '',
      bookSourceUrl: source.bookSourceUrl || source.url || '',
      name: source.bookSourceName || '',
      url: source.url || '',
      searchUrl: source.searchUrl || '',
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleSearch: source.ruleSearch || {},
      header: typeof source.header === 'string' ? source.header : null,
      enabled: true,
    }
  }
}

function openBook(book: Book) {
  const rawSource = sources.value.find(s => s.bookSourceName === book.originName)
  const source = cleanSource(rawSource)
  bookshelfStore.openDetail(book, source)
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const parent = img.parentElement
  if (parent) {
    const placeholder = parent.querySelector('.book-cover-placeholder')
    if (placeholder) {
      ;(placeholder as HTMLElement).style.display = 'flex'
    }
  }
}

onMounted(() => {
  Promise.all([bookshelfStore.loadBooks(), loadSources()])
})
</script>

<style scoped>
.bookshelf-page { position: relative; z-index: 1; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.search-wrapper { position: relative; }
.input-search {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  width: 200px;
  transition: border-color 0.2s;
}
.input-search:focus { border-color: var(--brand); }
.input-search::placeholder { color: var(--text-muted); }

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
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
.book-card.no-source {
  border-color: rgba(231, 76, 60, 0.3);
}

.book-cover {
  aspect-ratio: 2/3;
  background: var(--bg-card);
  overflow: hidden;
  position: relative;
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

.badge-no-source {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(231, 76, 60, 0.85);
  color: #fff;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.book-info { padding: 8px 10px; }
.book-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.book-author {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}
.book-tag {
  font-size: 10px;
  color: var(--brand);
  margin: 2px 0 0;
}

.fix-modal { padding: 8px 0; }
.fix-book-list {
  max-height: 400px;
  overflow-y: auto;
  margin-top: 12px;
}
.fix-book-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}
.fix-book-item:hover { background: var(--bg-hover); }
.fix-book-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}
.fix-book-origin {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fix-select {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  min-width: 120px;
}
.fix-select:focus { border-color: var(--brand); outline: none; }
.fix-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  text-align: center;
}
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
.empty-state h3 { font-size: 20px; color: var(--text-secondary); margin-bottom: 8px; }
.empty-state p { font-size: 14px; color: var(--text-muted); margin-bottom: 24px; }
.empty-actions { display: flex; gap: 12px; }

.hidden { display: none; }

.book-card-skeleton .skeleton { background: var(--bg-card); border-radius: 4px; animation: shimmer 1.5s infinite; }
@keyframes shimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }

.add-url-form { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 4px;
  line-height: 1.6;
}
.form-select {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
}
.form-select:focus { border-color: var(--brand); }

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
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
  box-shadow: 0 4px 20px rgba(212, 160, 23, 0.25);
}
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
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
  background: var(--bg-hover);
  border-color: var(--brand);
}
</style>


