<template>
  <div class="chapter-list-container">
    <div class="chapter-header">
      <h3>目录</h3>
      <span class="chapter-count">{{ chapters.length }} 章</span>
      <div class="chapter-search" v-if="!loading && chapters.length > 0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="filter" type="text" placeholder="搜索..." class="search-input-inline" />
      </div>
      <Pagination v-if="totalPages > 1" :current-page="currentPage" :total-pages="totalPages" @go-page="handleGoPage" />
    </div>
    <div v-if="!loading" class="chapter-list">
      <ChapterItem v-for="ch in pagedChapters" :key="ch.id" :chapter="ch" :active="ch.id === currentChapterId" @click="$emit('select', ch)" />
      <EmptyState v-if="chapters.length === 0" title="暂无目录" />
    </div>
    <div v-else class="chapter-loading">
      <LoadingSpinner />
      <span>加载目录中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Chapter } from '@/types'
import ChapterItem from './ChapterItem.vue'
import Pagination from '@/components/common/Pagination.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const props = withDefaults(defineProps<{
  chapters: Chapter[]
  currentChapterId: number | null
  loading?: boolean
  pageSize?: number
}>(), {
  pageSize: 200,
})

defineEmits<{ select: [chapter: Chapter] }>()

const filter = ref('')
const currentPage = ref(0)

const safeChapters = computed(() => Array.isArray(props.chapters) ? props.chapters : [])
const filteredChapters = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  if (!kw) return safeChapters.value
  return safeChapters.value.filter((ch) => ch.title.toLowerCase().includes(kw))
})

const totalPages = computed(() => Math.ceil(Math.max(1, filteredChapters.value.length) / props.pageSize))

const pagedChapters = computed(() => {
  const start = currentPage.value * props.pageSize
  return filteredChapters.value.slice(start, start + props.pageSize)
})

watch(filter, () => { currentPage.value = 0 })

function handleGoPage(page: number): void {
  currentPage.value = page
}

function jumpToActiveChapter(): void {
  const id = props.currentChapterId
  if (id === null || id === undefined) return
  const idx = filteredChapters.value.findIndex((ch) => ch.id === id)
  if (idx === -1) return
  const page = Math.floor(idx / props.pageSize)
  if (page !== currentPage.value && page < totalPages.value) {
    currentPage.value = page
  }
}

watch(() => props.currentChapterId, () => {
  jumpToActiveChapter()
}, { immediate: true })

// 修复：使用浅监听替代 deep: true，避免大数组深度比较
// props.chapters 的引用变化时触发
watch(() => props.chapters, () => {
  jumpToActiveChapter()
})
</script>

<style scoped>
.chapter-list-container { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.chapter-header { display: flex; align-items: center; padding: 12px 0 8px; border-bottom: 1px solid var(--border-color); gap: 10px; }
.chapter-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; flex-shrink: 0; }
.chapter-count { font-size: 13px; color: var(--text-muted); flex-shrink: 0; }
.chapter-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.search-icon { flex-shrink: 0; color: var(--text-muted); }
.search-input-inline { flex: 1; min-width: 80px; padding: 4px 8px; font-size: 12px; color: var(--text-primary); background: transparent; border: none; border-bottom: 1px solid var(--border-color); outline: none; border-radius: 0; }
.search-input-inline:focus { border-bottom-color: var(--brand); }
.chapter-list { flex: 1; overflow-y: auto; padding: 6px 0; display: flex; flex-direction: column; gap: 2px; }
.chapter-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 40px; color: var(--text-muted); }
</style>
