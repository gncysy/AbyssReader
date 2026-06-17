<template>
  <div class="card cursor-pointer hover:scale-105 transition-transform" @click="$emit('click')">
    <div class="aspect-[2/3] bg-dark-hover rounded-lg flex items-center justify-center mb-3">
      <img
        v-if="book.coverUrl"
        :src="book.coverUrl"
        class="w-full h-full object-cover rounded-lg"
        @error="handleImageError"
      />
      <span v-else class="text-4xl">📖</span>
    </div>
    <h3 class="font-bold text-sm line-clamp-1">{{ book.name }}</h3>
    <p class="text-gray-400 text-xs">{{ book.author || '未知作者' }}</p>
    <p v-if="book.lastChapter" class="text-accent text-xs mt-1 line-clamp-1">{{ book.lastChapter }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Book } from '../api/tauri'

defineProps<{
  book: Book
}>()

defineEmits<{
  click: []
}>()

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>
