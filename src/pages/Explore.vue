<template>
  <div class="p-10">
    <div class="mb-10">
      <h2 class="font-display text-3xl font-bold text-ink dark:text-parchment">发现</h2>
      <p class="text-parchment-muted text-sm mt-2 tracking-wide">浏览书源分类与排行榜</p>
    </div>

    <div class="mb-6">
      <select v-model="selectedSourceId" @change="loadCategories" class="select-styled min-w-[200px]">
        <option value="">选择书源...</option>
        <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
    </div>

    <div v-if="categories.length > 0" class="flex flex-wrap gap-2 mb-8">
      <button
        v-for="(cat, idx) in categories"
        :key="idx"
        @click="exploreCategory(cat)"
        :class="[
          'text-xs px-3 py-1.5 border transition-colors',
          currentCategory?.url === cat.url ? 'bg-amber/15 text-amber border-amber' : 'border-parchment-muted/30 text-parchment-muted hover:border-parchment-muted'
        ]"
      >
        {{ cat.title }}
      </button>
    </div>

    <div v-if="currentCategory && exploreResults.length > 0" class="mb-6">
      <h3 class="font-display text-lg font-semibold text-amber mb-4 tracking-wide">
        {{ currentCategory.title }}
        <span class="text-parchment-muted text-sm font-normal ml-2">共 {{ exploreResults.length }} 本</span>
      </h3>
      <div class="space-y-1">
        <div
          v-for="book in exploreResults"
          :key="book.bookUrl"
          class="surface-raised p-5 cursor-pointer hover:glow-amber transition-all duration-300"
          @click="addToShelf(book)"
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
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loadingExplore" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-amber"></div>
      <p class="mt-2 text-parchment-muted text-sm">加载中...</p>
    </div>
    <div v-if="!loadingExplore && currentCategory && exploreResults.length === 0" class="text-center text-parchment-muted py-12">
      <p class="tracking-wider">暂无书籍</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getBookSources, addToBookshelf, getExploreCategories, type BookSource, type Book } from '../api/tauri'
import { RuleEngine } from '../engine/ruleEngine'

const sources = ref<BookSource[]>([])
const selectedSourceId = ref('')
const categories = ref<{ title: string; url: string }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const exploreResults = ref<any[]>([])
const loadingExplore = ref(false)

async function loadSources() {
  sources.value = await getBookSources()
}

async function loadCategories() {
  if (!selectedSourceId.value) {
    categories.value = []
    return
  }
  try {
    categories.value = await getExploreCategories(selectedSourceId.value)
  } catch (err) {
    console.error('加载分类失败:', err)
    categories.value = []
  }
}

async function exploreCategory(cat: { title: string; url: string }) {
  currentCategory.value = cat
  loadingExplore.value = true
  exploreResults.value = []
  try {
    const source = sources.value.find(s => s.id === selectedSourceId.value)
    if (!source) throw new Error('书源未找到')
    const books = await RuleEngine.explore(source, cat.url)
    exploreResults.value = books
  } catch (err) {
    console.error('获取发现列表失败:', err)
  } finally {
    loadingExplore.value = false
  }
}

async function addToShelf(book: any) {
  const source = sources.value.find(s => s.id === selectedSourceId.value)
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
    tocUrl: undefined,
  }
  try {
    await addToBookshelf(newBook)
    alert(`已添加《${book.name}》到书架`)
  } catch (err) {
    console.error(err)
    alert('添加失败')
  }
}

onMounted(() => {
  loadSources()
})
</script>
