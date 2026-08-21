<template>
  <Teleport to="body">
    <div v-if="book" class="reader-fullscreen" :data-theme="effectiveTheme">
      <Transition name="controls-slide">
        <header v-if="showControls" v-no-drag class="reader-header" @mouseenter="clearHideTimer" @mouseleave="resetHideTimer">
          <button class="btn-back" @click.stop="handleCloseAndEmit" aria-label="返回书架">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <span class="header-progress">{{ Math.round(scrollPercent * 100) }}%</span>
          <div class="reader-title-drag">
            <h2 class="reader-title clickable" @click.stop="openToc" title="点击打开目录">{{ currentChapter?.title || '加载中...' }}</h2>
          </div>
          <button class="btn-icon-header" @click.stop="openSettings" title="阅读设置">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </header>
      </Transition>

      <div class="reader-body" :class="{ 'reader-body-no-header': !showControls }">
        <ReaderContent
          ref="readerContentRef"
          :sanitized-content="sanitizedContent"
          :is-comic="isComic"
          :loading-content="loadingContent"
          :font-size="effectiveFontSize"
          :line-height="effectiveLineHeight"
          :chapter-index="chapterIndex"
          :total-chapters="chapters.length"
          :can-prev="chapterIndex > 0"
          :can-next="chapterIndex < chapters.length - 1"
          :comic-images="comicImages"
          @scroll="handleScroll"
          @content-click="handleContentClick"
          @text-select="handleTextSelect"
          @prev="prevChapter"
          @next="nextChapter"
          @retry-comic="retryComicImage"
        />
      </div>

      <div v-if="loadingContent" class="reader-loading"><LoadingSpinner /></div>

      <ContextMenu ref="readerCtxRef">
        <ContextMenuItem label="复制" @click="copySelectionFromCtx" />
        <ContextMenuItem label="字典" @click="openDictFromCtx" />
      </ContextMenu>

      <TocPopup ref="tocPopupRef" :chapters="chapters" :current-chapter-id="currentChapter?.id ?? null" @select="onTocSelect" />
      <ReaderSettings ref="settingsRef" />

      <DictPanel
        :visible="dictVisible"
        :rules="dictRules"
        :active-tab="dictActiveTab"
        :loading="dictLoading"
        :contents="dictContents"
        @update:visible="dictVisible = $event"
        @switch-tab="switchDictTab"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useReaderStore, useBookshelfStore } from '@/stores'
import { useReplaceRuleStore } from '@/stores/replace-rules.js'
import { useReaderContent } from '@/composables/useReaderContent.js'
import ReaderContent from './ReaderContent.vue'
import ReaderSettings from './ReaderSettings.vue'
import TocPopup from './TocPopup.vue'
import DictPanel from './DictPanel.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { ContextMenu, ContextMenuItem } from '@/components/common/ContextMenu/index.js'
import type { Book, BookSource, Chapter } from '@/types'

const props = defineProps<{ book: Book | null; source?: BookSource | null; initialChapters?: Chapter[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const readerStore = useReaderStore()
const bookshelfStore = useBookshelfStore()
const replaceRuleStore = useReplaceRuleStore()

const sourceValue = props.source ?? null
const rc = useReaderContent(props.book, sourceValue, props.initialChapters)

const {
  loadingContent, chapterIndex, chapters, isComic, comicImages, scrollPercent, currentChapter,
  dictVisible, dictRules, dictActiveTab, dictLoading, dictContents, showControls,
  effectiveTheme, effectiveFontSize, effectiveLineHeight, sanitizedContent,
  tocPopupRef, settingsRef, readerCtxRef,
  loadChaptersForBook, loadChapter,
  prevChapter, nextChapter, retryComicImage, handleClose, handleKeydown,
  openToc, openSettings, onTocSelect, handleContentClick, handleTextSelect,
  copySelectionFromCtx, openDictFromCtx, switchDictTab,
  clearHideTimer, resetHideTimer,
} = rc

const readerContentRef = ref<InstanceType<typeof ReaderContent> | null>(null)

// 修复：把 ReaderContent 的 contentRef 同步到 useReaderContent 的 contentRef
watch(readerContentRef, (comp) => {
  if (comp && comp.contentRef) {
    rc.contentRef.value = comp.contentRef
  }
}, { immediate: true })

let isClosed = false

function handleScroll(): void {
  rc.handleScroll()
}

async function handleCloseAndEmit(): Promise<void> {
  if (isClosed) return
  isClosed = true
  await handleClose()
  emit('close')
}

onMounted(async () => {
  readerStore.loadSettings()
  replaceRuleStore.loadRules()
  if (props.book && sourceValue) {
    await loadChaptersForBook(props.book, sourceValue, props.initialChapters)
    const forcedIndex = (props.book as unknown as Record<string, unknown>)._forceChapterIndex
    if (typeof forcedIndex === 'number' && forcedIndex >= 0 && forcedIndex < chapters.value.length) {
      chapterIndex.value = forcedIndex
    } else {
      const progress = await readerStore.loadProgress(props.book.bookUrl, props.book.name, props.book.author)
      if (progress) {
        const idx = chapters.value.findIndex((ch) => Number(ch.id) === Number(progress.chapterId))
        if (idx !== -1) chapterIndex.value = idx
      }
    }
    await loadChapter()
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(async () => {
  window.removeEventListener('keydown', handleKeydown)
  if (!isClosed) {
    isClosed = true
    await handleClose()
  }
})
</script>

<style scoped>
.reader-fullscreen {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  background: var(--bg);
  color: var(--text-primary);
  transition: background 0.3s ease, color 0.3s ease;
}
.reader-fullscreen[data-theme="dark"] {
  --bg: #0f0f0f; --bg-card: #1a1a1a; --bg-hover: #2a2a2a;
  --text-primary: #f0f0f0; --text-secondary: #b0b0b0; --text-muted: #999999;
  --border-color: rgba(255,255,255,0.08);
}
.reader-fullscreen[data-theme="light"] {
  --bg: #f5f5f5; --bg-card: #ffffff; --bg-hover: #f0f0f0;
  --text-primary: #1a1a1a; --text-secondary: #555555; --text-muted: #777777;
  --border-color: rgba(0,0,0,0.08);
}
.reader-fullscreen[data-theme="sepia"] {
  --bg: #f4ecd8; --bg-card: #faf5e8; --bg-hover: rgba(139,119,80,0.1);
  --text-primary: #3d2b1f; --text-secondary: #6b5540; --text-muted: #8a7560;
  --border-color: rgba(139,119,80,0.15);
}
.reader-header {
  position: absolute;
  display: flex;
  align-items: center;
  padding: 6px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  height: 48px;
  flex-shrink: 0;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.btn-back { background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 0; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; min-width: 38px; min-height: 38px; -webkit-app-region: no-drag; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color); }
.header-progress { font-size: 13px; color: var(--text-muted); font-weight: 500; min-width: 48px; text-align: center; flex-shrink: 0; }
.reader-title-drag {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: 400px;
  width: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.reader-title { font-size: 14px; font-weight: 500; color: var(--text-secondary); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.reader-title.clickable { cursor: pointer; }
.reader-title.clickable:hover { color: var(--text-primary); }
.btn-icon-header { width: 38px; height: 38px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; -webkit-app-region: no-drag; margin-left: auto; flex-shrink: 0; }
.btn-icon-header:hover { background: var(--bg-hover); color: var(--text-primary); }
.reader-body {
  flex: 1;
  padding-top: 48px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: padding-top 0.3s var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
}
.reader-body-no-header {
  padding-top: 0;
}
.reader-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 20; }
.controls-slide-enter-active, .controls-slide-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.controls-slide-enter-from, .controls-slide-leave-to { opacity: 0; }
.reader-header.controls-slide-enter-from, .reader-header.controls-slide-leave-to { transform: translateY(-100%); }
</style>
