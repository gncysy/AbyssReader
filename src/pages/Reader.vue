<template>
  <div class="reader-container h-full flex flex-col transition-colors duration-500" :class="[themeClass]">
    <!-- 头部 -->
    <div class="reader-header p-4 border-b flex justify-between items-center">
      <button @click="$emit('close')" class="text-parchment-muted hover:text-amber transition-colors text-sm tracking-wider">
        ← 返回书架
      </button>
      <h3 class="font-display text-sm text-parchment-dim truncate mx-4">
        {{ currentChapter?.title || '...' }}
      </h3>
      <div class="flex gap-2">
        <button @click="prevChapter" :disabled="chapterIndex <= 0"
          class="btn-secondary text-xs px-3 py-1 disabled:opacity-20">
          上一章
        </button>
        <button @click="nextChapter" :disabled="chapterIndex >= chapters.length - 1"
          class="btn-secondary text-xs px-3 py-1 disabled:opacity-20">
          下一章
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto px-8 py-12" ref="contentRef">
      <div
        class="prose max-w-2xl mx-auto reader-content font-reading leading-relaxed drop-cap"
        :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight.toFixed(1) }"
        v-html="content"
      ></div>
    </div>

    <!-- 底部 -->
    <div class="reader-footer p-3 border-t flex justify-center items-center gap-6">
      <div class="flex gap-1">
        <button
          v-for="theme in themes"
          :key="theme.value"
          @click="currentTheme = theme.value"
          :class="[
            'text-[10px] tracking-widest px-2 py-1 transition-colors',
            currentTheme === theme.value ? 'text-amber' : 'text-parchment-muted/60 hover:text-parchment-muted'
          ]"
        >{{ theme.label }}</button>
      </div>
      <span class="text-parchment-muted/30">|</span>
      <button @click="decreaseFontSize" class="text-parchment-muted/60 hover:text-parchment text-xs px-1">A-</button>
      <span class="text-xs text-parchment-muted w-8 text-center">{{ fontSize }}</span>
      <button @click="increaseFontSize" class="text-parchment-muted/60 hover:text-parchment text-xs px-1">A+</button>
      <span class="text-parchment-muted/30">|</span>
      <button @click="decreaseLineHeight" class="text-parchment-muted/60 hover:text-parchment text-xs px-1">↕-</button>
      <span class="text-xs text-parchment-muted w-6 text-center">{{ lineHeight.toFixed(1) }}</span>
      <button @click="increaseLineHeight" class="text-parchment-muted/60 hover:text-parchment text-xs px-1">↕+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  chapters: any[]
  currentChapterIndex: number
  content: string
}>()

const emit = defineEmits<{
  close: []
  prev: []
  next: []
  progress: [chapterId: number, scrollPosition: number]
}>()

const chapterIndex = ref(props.currentChapterIndex)
const currentChapter = ref<any | null>(props.chapters[props.currentChapterIndex] || null)
const content = ref(props.content)
const contentRef = ref<HTMLElement | null>(null)

const fontSize = ref(16)
function increaseFontSize() { fontSize.value = Math.min(32, fontSize.value + 1) }
function decreaseFontSize() { fontSize.value = Math.max(12, fontSize.value - 1) }

const lineHeight = ref(16)
function increaseLineHeight() { lineHeight.value = Math.min(30, lineHeight.value + 1) }
function decreaseLineHeight() { lineHeight.value = Math.max(12, lineHeight.value - 1) }

const themes = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' },
  { label: '护眼', value: 'sepia' },
]
const currentTheme = ref('dark')
const themeClass = computed(() => `reader-theme-${currentTheme.value}`)

watch(() => props.currentChapterIndex, (newVal) => {
  chapterIndex.value = newVal
  currentChapter.value = props.chapters[newVal] || null
})
watch(() => props.content, (newVal) => { content.value = newVal })

const prevChapter = () => { if (chapterIndex.value > 0) emit('prev') }
const nextChapter = () => { if (chapterIndex.value < props.chapters.length - 1) emit('next') }

const handleScroll = () => {
  if (contentRef.value && currentChapter.value) {
    emit('progress', currentChapter.value.id || 0, contentRef.value.scrollTop / contentRef.value.scrollHeight)
  }
}

onMounted(() => {
  contentRef.value?.addEventListener('scroll', handleScroll)
})
onUnmounted(() => {
  contentRef.value?.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
.prose {
  max-width: 100%;
}
.prose p {
  margin-bottom: 1em;
}

.reader-theme-dark {
  background-color: #0d0d0d;
}
.reader-theme-dark .reader-header,
.reader-theme-dark .reader-footer {
  background-color: #1a1815;
  border-color: rgba(58, 54, 48, 0.4);
}
.reader-theme-dark .reader-content {
  color: #f0e6d3;
}

.reader-theme-light {
  background-color: #faf8f2;
}
.reader-theme-light .reader-header,
.reader-theme-light .reader-footer {
  background-color: #f0ebe0;
  border-color: rgba(107, 101, 96, 0.15);
}
.reader-theme-light .reader-content {
  color: #1a1815;
}

.reader-theme-sepia {
  background-color: #f4ecd8;
}
.reader-theme-sepia .reader-header,
.reader-theme-sepia .reader-footer {
  background-color: #ebe2c9;
  border-color: rgba(139, 119, 80, 0.2);
}
.reader-theme-sepia .reader-content {
  color: #5b4636;
}
</style>
