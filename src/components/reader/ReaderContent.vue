<template>
  <div class="reader-content-wrapper">
    <div ref="contentRef" class="reader-content" @scroll="handleScroll" @click="handleContentClick" @mouseup="handleTextSelect">
      <div v-if="isComic" class="content-comic">
        <div v-for="(img, i) in comicImages" :key="i" class="comic-page">
          <img v-if="img.data || img.directUrl" :src="img.data || img.directUrl" :alt="'第' + (i + 1) + '页'" style="display:block;width:100%;height:auto" @error="img.status='error'" />
          <div v-else-if="img.status === 'error'" class="comic-placeholder comic-error" @click="$emit('retry-comic', i)"><span>第 {{ i + 1 }} 页加载失败</span><span>点击重试</span></div>
          <div v-else class="comic-placeholder"><LoadingSpinner /><span>第 {{ i + 1 }} 页加载中...</span></div>
        </div>
      </div>
      <div v-else class="content-inner" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }" v-html="sanitizedContent"></div>
      <div v-if="!isComic && !loadingContent && totalChapters > 0" class="content-nav">
        <button class="btn-chapter-inline" :disabled="!canPrev" @click.stop="$emit('prev')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span>上一章</span>
        </button>
        <span class="chapter-nav-info">{{ chapterIndex + 1 }} / {{ totalChapters }}</span>
        <button class="btn-chapter-inline" :disabled="!canNext" @click.stop="$emit('next')">
          <span>下一章</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
    <ScrollThumb :container-ref="contentRefObj" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ScrollThumb from './ScrollThumb.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import type { ComicImage } from '@engine/business/comic/index.js'

defineProps<{
  sanitizedContent: string
  isComic: boolean
  loadingContent: boolean
  fontSize: number
  lineHeight: number
  chapterIndex: number
  totalChapters: number
  canPrev: boolean
  canNext: boolean
  comicImages: ComicImage[]
}>()

const emit = defineEmits<{
  scroll: []
  contentClick: []
  textSelect: []
  prev: []
  next: []
  'retry-comic': [index: number]
}>()

const contentRef = ref<HTMLElement | null>(null)

const contentRefObj = computed(() => ({ value: contentRef.value }))

function handleScroll(): void { emit('scroll') }
function handleContentClick(e: MouseEvent): void { if ((e.target as HTMLElement).closest('button, a')) return; emit('contentClick') }
function handleTextSelect(): void { emit('textSelect') }

defineExpose({ contentRef })
</script>

<style scoped>
.reader-content-wrapper { position: relative; flex: 1; overflow: hidden; }
.reader-content { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; user-select: text; scrollbar-width: none; -ms-overflow-style: none; }
.reader-content::-webkit-scrollbar { display: none !important; }
.content-inner { max-width: 720px; margin: 0 auto; padding: 28px 36px 12px; }
.content-comic { width: 100%; }
.comic-page { width: 100%; min-height: 100px; }
.comic-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; min-height: 200px; }
.comic-error { cursor: pointer; }
.comic-error:hover { background: var(--bg-hover); }
.content-nav { display: flex; align-items: center; justify-content: center; gap: 24px; padding: 20px 0 40px; max-width: 720px; margin: 0 auto; }
.chapter-nav-info { font-size: 12px; color: var(--text-muted); min-width: 60px; text-align: center; }
.btn-chapter-inline { display: inline-flex; align-items: center; gap: 4px; padding: 8px 18px; font-size: 14px; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; transition: color 0.18s, border-color 0.18s, background 0.18s; }
.btn-chapter-inline:hover:not(:disabled) { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); }
.btn-chapter-inline:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
