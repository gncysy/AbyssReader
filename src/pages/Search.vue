<template>
  <div class="p-10">
    <div class="mb-10">
      <h2 class="font-display text-3xl font-bold text-ink dark:text-parchment">搜索书籍</h2>
      <p class="text-parchment-muted text-sm mt-2 tracking-wide">多源并发搜索，结果即时呈现</p>
    </div>

    <div class="flex gap-4 mb-6 flex-wrap items-end">
      <div class="relative flex-1 min-w-[200px]">
        <input
          v-model="keyword"
          type="text"
          placeholder="输入书名或作者..."
          class="input-underline"
          @keyup.enter="doSearch"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-parchment-muted">并发</span>
        <input
          v-model.number="concurrency"
          type="number"
          min="1"
          max="20"
          class="w-14 bg-transparent border border-parchment-muted/30 rounded-sm px-2 py-1 text-xs text-parchment-dim outline-none focus:border-amber"
        />
      </div>
      <button
        @click="doSearch"
        :disabled="loading || !keyword.trim() || selectedSources.length === 0"
        class="btn-primary"
      >
        <span v-if="loading" class="flex items-center gap-2">
          <span class="animate-spin inline-block w-3 h-3 border border-amber border-t-transparent rounded-full"></span>
          搜索中 {{ completedCount }}/{{ selectedSources.length }}
        </span>
        <span v-else>搜索</span>
      </button>
    </div>

    <div class="mb-6">
      <p class="text-xs text-parchment-muted mb-2 tracking-wider">选择书源（至少选一个）</p>
      <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        <button
          v-for="source in sources"
          :key="source.id"
          @click="toggleSource(source.id)"
          :class="[
            'text-xs px-3 py-1 border transition-colors rounded-sm',
            selectedSources.includes(source.id)
              ? 'bg-amber/15 text-amber border-amber'
              : 'border-parchment-muted/30 text-parchment-muted hover:border-parchment-muted'
          ]"
        >
          {{ source.name }}
        </button>
      </div>
    </div>

    <div v-if="Object.keys(searchResults).length > 0" class="space-y-8">
      <div v-for="sourceId in Object.keys(searchResults)" :key="sourceId">
        <div class="flex items-baseline justify-between mb-3">
          <h3 class="font-display text-lg font-semibold text-amber tracking-wide">
            {{ getSourceName(sourceId) }}
          </h3>
          <span class="text-xs text-parchment-muted">
            {{ searchResults[sourceId].length === 0 ? '无结果' : '共 ' + searchResults[sourceId].length + ' 本' }}
          </span>
        </div>
        <div v-if="searchResults[sourceId].length > 0" class="space-y-1">
          <div
            v-for="book in searchResults[sourceId]"
            :key="sourceId + '-' + book.bookUrl"
            class="surface-raised p-5 cursor-pointer hover:glow-amber transition-all duration-300"
            @click="addToShelf(book, sourceId)"
          >
            <div class="flex gap-5">
              <div class="w-16 h-24 flex-shrink-0 overflow-hidden bg-ink-light dark:bg-ink-surface">
                <img
                  v-if="book.cover"
                  :src="book.cover"
                  class="w-full h-full object-cover"
                  @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <span class="font-display text-2xl text-amber/50">{{ book.name?.charAt(0) || '?' }}</span>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-display text-lg font-semibold text-ink dark:text-parchment truncate">
                  {{ book.name }}
                </h3>
                <p class="text-parchment-muted text-sm mt-1">{{ book.author || '佚名' }}</p>
                <p v-if="book.intro" class="text-parchment-muted/70 text-xs mt-2 line-clamp-2 leading-relaxed">
                  {{ book.intro }}
                </p>
                <div class="flex gap-3 mt-3 flex-wrap">
                  <span v-if="book.lastChapter" class="text-[10px] text-amber/70 truncate">
                    {{ book.lastChapter }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading && searched" class="text-center text-parchment-muted py-20">
      <p class="font-display text-6xl text-parchment-muted/30 mb-6">~</p>
      <p class="tracking-wider">未找到相关书籍</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getBookSources, addToBookshelf, type BookSource, type Book } from '../api/tauri'
import { RuleEngine } from '../engine/ruleEngine'

const sources = ref<BookSource[]>([])
const selectedSources = ref<string[]>([])
const keyword = ref('')
const loading = ref(false)
const completedCount = ref(0)
const searched = ref(false)
const searchResults = reactive<Record<string, any[]>>({})
const concurrency = ref(5)

async function loadSources() {
  sources.value = await getBookSources()
  const firstEnabled = sources.value.find(s => s.enabled)
  if (firstEnabled && selectedSources.value.length === 0) {
    selectedSources.value = [firstEnabled.id]
  }
}

function toggleSource(id: string) {
  const idx = selectedSources.value.indexOf(id)
  if (idx >= 0) selectedSources.value.splice(idx, 1)
  else selectedSources.value.push(id)
}

function getSourceName(id: string) {
  return sources.value.find(s => s.id === id)?.name || id
}

async function doSearch() {
  if (!keyword.value.trim() || selectedSources.value.length === 0) return

  loading.value = true
  searched.value = true
  completedCount.value = 0
  Object.keys(searchResults).forEach(key => delete searchResults[key])

  const queue = [...selectedSources.value]
  const limit = Math.max(1, concurrency.value)

  async function worker() {
    while (queue.length > 0) {
      const sourceId = queue.shift()!
      const source = sources.value.find(s => s.id === sourceId)
      if (!source) continue

      try {
        const books = await RuleEngine.search(source, keyword.value)
        searchResults[sourceId] = books
      } catch (err) {
        console.error(`书源 ${getSourceName(sourceId)} 搜索失败:`, err)
        searchResults[sourceId] = []
      }
      completedCount.value++
    }
  }

  const workers = Array.from({ length: limit }, () => worker())
  await Promise.all(workers)
  loading.value = false
}

async function addToShelf(book: any, sourceId: string) {
  const source = sources.value.find(s => s.id === sourceId)
  if (!source) return

  const newBook: Book = {
    id: 0,
    sourceId: source.id,
    sourceName: source.name,
    name: book.name,
    author: book.author,
    coverUrl: book.cover,
    intro: book.intro,
    lastChapter: book.lastChapter,
    bookUrl: book.bookUrl,
    tocUrl: book.tocUrl,
  }

  try {
    await addToBookshelf(newBook)
    alert(`已添加《${book.name}》到书架`)
  } catch (err) {
    console.error('添加失败:', err)
    alert('添加失败')
  }
}

onMounted(() => {
  loadSources()
})
</script>
