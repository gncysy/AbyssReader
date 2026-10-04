<template>
  <div v-if="loading && books.length === 0" class="books-grid">
    <SkeletonCard v-for="i in skeletonCount" :key="i" />
  </div>
  <div v-else-if="books.length > 0" class="books-grid">
    <!-- 修复：用 bookUrl 做 key，避免书籍重排时复用错误 DOM -->
    <BookCard
      v-for="book in books"
      :key="book.bookUrl || book.name || Math.random().toString(36)"
      :book="book"
      @click="$emit('click-book', book)"
      @contextmenu="$emit('contextmenu-book', book, $event)"
    />
  </div>
  <EmptyState v-else :title="emptyTitle || '空空如也'" :description="emptyDescription" />
</template>

<script setup lang="ts">
import type { Book } from '@/types'
import BookCard from './BookCard.vue'
import SkeletonCard from '@/components/common/SkeletonCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const props = withDefaults(defineProps<{
  books: Book[]; loading?: boolean; skeletonCount?: number; emptyTitle?: string; emptyDescription?: string
}>(), { loading: false, skeletonCount: 8, emptyTitle: '空空如也', emptyDescription: '' })

defineEmits<{
  'click-book': [book: Book]
  'contextmenu-book': [book: Book, event: MouseEvent]
}>()

void props
</script>

<style scoped>
.books-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 22px; }
</style>
