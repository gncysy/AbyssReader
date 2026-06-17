<template>
  <div class="chapter-list">
    <div class="flex justify-between items-center mb-4">
      <h3 class="font-bold">📑 目录</h3>
      <span class="text-xs text-gray-400">共 {{ chapters.length }} 章</span>
    </div>

    <div class="space-y-1 max-h-[400px] overflow-y-auto">
      <div
        v-for="(chapter, idx) in chapters"
        :key="chapter.id || idx"
        :class="[
          'px-3 py-2 rounded-lg cursor-pointer text-sm transition',
          idx === currentIndex ? 'bg-accent text-white' : 'hover:bg-dark-hover'
        ]"
        @click="$emit('select', idx)"
      >
        <div class="flex justify-between items-center">
          <span class="truncate flex-1">{{ chapter.title }}</span>
          <span v-if="chapter.isRead" class="text-xs text-green-400 ml-2">✓</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  chapters: any[]
  currentIndex: number
}>()

defineEmits<{
  select: [index: number]
}>()
</script>
