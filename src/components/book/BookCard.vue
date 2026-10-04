<template>
  <div class="book-card" @click="$emit('click')" @contextmenu.prevent="$emit('contextmenu', $event)">
    <div class="book-card-cover">
      <BookCover
        :src="book.customCoverUrl || book.coverUrl || null"
        :title="book.name"
        :author="book.author"
        :disable-change="true"
        :base-url="book.bookUrl || null"
      />
    </div>
    <div class="book-info">
      <h4>{{ book.name || '未命名' }}</h4>
      <p>{{ book.author || '佚名' }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Book } from '@/types'
import BookCover from './BookCover.vue'

defineProps<{ book: Book }>()
defineEmits<{ click: []; contextmenu: [event: MouseEvent] }>()
</script>

<style scoped>
.book-card {
  cursor: pointer;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: transform 0.25s var(--ease-out), border-color 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
}
.book-card:hover {
  transform: translateY(-5px);
  border-color: rgba(212, 160, 23, 0.25);
  box-shadow: var(--shadow-md);
}
.book-card-cover {
  aspect-ratio: 2/3;
  width: 100%;
}
.book-info {
  padding: 10px 12px;
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
  margin: 3px 0 0;
}
</style>
