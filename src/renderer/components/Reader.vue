<template>
  <div v-if="book" class="reader-fullscreen" :class="themeClass">
    <header class="reader-header">
      <button class="btn-back" @click="handleClose">← 返回</button>
      <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
      <div class="header-actions">
        <button class="btn-chapter" :disabled="chapterIndex <= 0" @click="prevChapter">上一章</button>
        <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter">下一章</button>
      </div>
    </header>

    <Transition name="toc-slide">
      <aside v-if="showToc" class="reader-toc">
        <div class="toc-header">
          <span>目录</span>
          <button class="toc-close" @click="showToc = false">✕</button>
        </div>
        <div class="toc-list">
          <button
            v-for="(ch, idx) in chapters"
            :key="ch.id || idx"
            class="toc-item"
            :class="{ active: idx === chapterIndex }"
            @click="goToChapter(idx)"
          >
            {{ ch.title || '无标题' }}
          </button>
        </div>
      </aside>
    </Transition>

    <button class="btn-toc-toggle" @click="showToc = !showToc">☰</button>

    <div ref="contentRef" class="reader-content" @scroll="handleScroll">
      <div
        class="content-inner"
        :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }"
        v-html="sanitizedContent"
      ></div>
    </div>

    <footer class="reader-footer">
      <span class="progress-text">{{ Math.round(scrollPercent * 100) }}%</span>
      <div class="footer-center">
        <button
          v-for="theme in themes"
          :key="theme.value"
          class="btn-theme"
          :class="{ active: currentTheme === theme.value }"
          @click="setTheme(theme.value)"
        >
          {{ theme.label }}
        </button>
        <button class="btn-size" @click="decreaseFontSize">A−</button>
        <span>{{ fontSize }}</span>
        <button class="btn-size" @click="increaseFontSize">A+</button>
      </div>
      <span class="chapter-info">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
    </footer>

    <div v-if="loadingContent" class="reader-loading">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { store, reader as readerApi } from '@/api'
import { useReadingStore } from '@/store'
import { debounce } from '@/utils/helpers'
import { READER_THEMES } from '@shared/constants'
import type { Book, BookSource, Chapter } from '@shared/types'

const props = defineProps<{
  book: Book
  source?: BookSource | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const readingStore = useReadingStore()

const fontSize = computed({
  get: () => readingStore.fontSize,
  set: (val: number) => readingStore.setFontSize(val),
})

const lineHeight = computed({
  get: () => readingStore.lineHeight,
  set: (val: number) => readingStore.setLineHeight(val),
})

const currentTheme = computed({
  get: () => readingStore.theme,
  set: (val: string) => readingStore.setTheme(val),
})

const chapters = ref<Chapter[]>([])
const chapterIndex = ref(0)
const content = ref('')
const loadingContent = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const showToc = ref(false)

const themes = READER_THEMES
const themeClass = computed(() => `reader-theme-${currentTheme.value}`)
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

const sanitizedContent = computed(() => {
  if (!content.value) return ''
  return DOMPurify.sanitize(content.value, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'a', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th'
    ],
    ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'title', 'class'],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
      'onkeydown', 'onkeyup', 'onkeypress', 'ondrag', 'ondrop',
      'onabort', 'onbeforeunload', 'onunload'
    ],
    ALLOWED_URI_REGEXP: /^(https?:\/\/|mailto:)/i,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link'],
    ADD_DATA_URI_TAGS: ['img'],
    ADD_TAGS: ['a'],
    ADD_ATTR: ['rel'],
    KEEP_CONTENT: true,
  })
})

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function setTheme(value: string) { readingStore.setTheme(value) }

function cleanSourceForIPC(source: any): any {
  if (!source) return null
  return JSON.parse(JSON.stringify({
    id: source.id || '',
    bookSourceName: source.bookSourceName || '',
    bookSourceUrl: source.bookSourceUrl || source.url || '',
    url: source.url || '',
    searchUrl: source.searchUrl || '',
    ruleToc: source.ruleToc || {},
    ruleContent: source.ruleContent || {},
    ruleBookInfo: source.ruleBookInfo || {},
    ruleSearch: source.ruleSearch || {},
    header: typeof source.header === 'string' ? source.header : null,
    enabled: true,
  }))
}

function cleanBookForIPC(book: any): any {
  if (!book) return null
  return JSON.parse(JSON.stringify({
    ...book,
    kind: book.kind || '',
    id: book.id || book.bookUrl || '',
  }))
}

async function loadChapters() {
  console.log('[Reader] loadChapters 被调用, book:', props.book)
  if (!props.book) return

  try {
    const isLocal = props.book.bookUrl?.startsWith('local://') || props.book.sourceId === 'local'
    if (isLocal) {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data = await readerApi.getLocalBookChapters(bookId)
      if (!data || data.length === 0) {
        message.warning('该书没有章节')
        loadingContent.value = false
        return
      }
      chapters.value = data.map((c: any, idx: number) => ({
        id: Number(c.id) || idx,
        title: c.title || `第${idx+1}章`,
        url: `local://${bookId}/${c.id}`,
        index: idx,
        content: c.content || '',
      }))

      const progress = await readingStore.loadProgress(String(props.book.bookUrl))
      if (progress) {
        const idx = chapters.value.findIndex(c => Number(c.id) === Number(progress.chapterId))
        if (idx !== -1) chapterIndex.value = idx
        if (progress.scrollPercent) scrollPercent.value = progress.scrollPercent / 100
      }
      await loadContent()
      return
    }

    if (!props.source) {
      message.warning('书源未找到')
      return
    }

    const cleanSourceObj = cleanSourceForIPC(props.source)
    const tocUrl = props.book.tocUrl || props.book.bookUrl
    const bookWithKind = cleanBookForIPC(props.book)

    console.log('[Reader] 调用 engineGetToc, tocUrl:', tocUrl)
    console.log('[Reader] bookWithKind.kind:', bookWithKind.kind)

    const result = await window.electronAPI.invoke('engine-get-toc', cleanSourceObj, tocUrl, { book: bookWithKind })

    if (!result.success) {
      throw new Error(result.error)
    }

    chapters.value = result.data || []

    const startIndex = (props.book as any).current_chapter_id
    if (typeof startIndex === 'number' && startIndex >= 0 && startIndex < chapters.value.length) {
      chapterIndex.value = startIndex
    } else {
      const progress = await readingStore.loadProgress(String(props.book.bookUrl))
      if (progress) {
        const idx = chapters.value.findIndex(c => Number(c.id) === Number(progress.chapterId))
        if (idx !== -1) chapterIndex.value = idx
        if (progress.scrollPercent) scrollPercent.value = progress.scrollPercent / 100
      }
    }

    await loadContent()
    preloadNextChapters()

  } catch (err: any) {
    console.error('[Reader] loadChapters 失败:', err)
    message.error('加载目录失败: ' + (err.message || err))
  }
}

async function preloadNextChapters() {
  if (!props.source) return
  const preloadRange = 3
  const start = Math.min(chapterIndex.value + 1, chapters.value.length - 1)
  const end = Math.min(start + preloadRange, chapters.value.length)
  if (start >= end) return

  const urls = []
  for (let i = start; i < end; i++) {
    const ch = chapters.value[i]
    if (ch && ch.url) urls.push(ch.url)
  }
  if (urls.length === 0) return

  const cleanSourceObj = cleanSourceForIPC(props.source)
  const concurrency = 2
  const queue = [...urls]
  const promises: Promise<void>[] = []

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift()
      if (!url) break
      try {
        await window.electronAPI.engineGetContent(cleanSourceObj, url)
      } catch {}
    }
  }

  for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
    promises.push(worker())
  }
  await Promise.allSettled(promises)
}

async function loadContent() {
  if (!currentChapter.value) {
    console.warn('[Reader] loadContent: currentChapter 为空')
    return
  }

  loadingContent.value = true

  try {
    const isLocal = props.book.bookUrl?.startsWith('local://') || props.book.sourceId === 'local'
    if (isLocal) {
      const bookId = props.book.bookUrl.replace('local://', '')
      content.value = await readerApi.getLocalChapterContent(bookId, currentChapter.value.id)
      await nextTick()
      restoreScrollPosition()
      return
    }

    if (!props.source) {
      content.value = '<p style="color:#e74c3c;">书源未找到</p>'
      return
    }

    const cleanSourceObj = cleanSourceForIPC(props.source)
    const bookKind = props.book?.kind || ''
    const result = await window.electronAPI.invoke('engine-get-content', cleanSourceObj, currentChapter.value.url, { bookKind: bookKind })

    if (!result.success) {
      throw new Error(result.error)
    }

    content.value = result.data || '<p>内容为空</p>'
    await nextTick()
    restoreScrollPosition()

    await readingStore.saveProgress(
      String(props.book.bookUrl),
      currentChapter.value.id || 0,
      currentChapter.value.title || '',
      Math.round(scrollPercent.value * 100)
    )

  } catch (err: any) {
    console.error('[Reader] loadContent 失败:', err)
    content.value = '<p style="color:#e74c3c;">加载失败，请重试</p>'
  } finally {
    loadingContent.value = false
  }
}

const debouncedSaveScroll = debounce(saveScrollPosition, 300)

async function restoreScrollPosition() {
  if (!contentRef.value) return
  const key = `reader-scroll-${props.book.bookUrl}-${chapterIndex.value}`
  try {
    const pos = await store.get(key)
    if (pos) {
      const maxScroll = contentRef.value.scrollHeight - contentRef.value.clientHeight
      contentRef.value.scrollTop = Math.min(parseFloat(pos), maxScroll)
      scrollPercent.value = parseFloat(pos) / maxScroll
    }
  } catch {}
}

async function saveScrollPosition() {
  if (!contentRef.value) return
  const maxScroll = contentRef.value.scrollHeight - contentRef.value.clientHeight
  if (maxScroll <= 0) return
  const percent = contentRef.value.scrollTop / maxScroll
  scrollPercent.value = Math.min(1, Math.max(0, percent))

  const key = `reader-scroll-${props.book.bookUrl}-${chapterIndex.value}`
  try {
    await store.set(key, String(contentRef.value.scrollTop))
  } catch {}

  if (props.book.bookUrl && percent > 0.1) {
    await readingStore.saveProgress(
      String(props.book.bookUrl),
      currentChapter.value?.id || 0,
      currentChapter.value?.title || '',
      Math.round(percent * 100)
    )
  }
}

function handleScroll() {
  if (!contentRef.value) return
  const maxScroll = contentRef.value.scrollHeight - contentRef.value.clientHeight
  if (maxScroll <= 0) return
  const percent = contentRef.value.scrollTop / maxScroll
  scrollPercent.value = Math.min(1, Math.max(0, percent))
  debouncedSaveScroll()
}

async function goToChapter(index: number) {
  if (index === chapterIndex.value) { showToc.value = false; return }
  if (index < 0 || index >= chapters.value.length) return
  await saveScrollPosition()
  chapterIndex.value = index
  showToc.value = false
  await loadContent()
  if (props.source) preloadNextChapters()
}

async function prevChapter() {
  if (chapterIndex.value > 0) {
    await saveScrollPosition()
    chapterIndex.value--
    await loadContent()
    if (props.source) preloadNextChapters()
  }
}

async function nextChapter() {
  if (chapterIndex.value < chapters.value.length - 1) {
    await saveScrollPosition()
    chapterIndex.value++
    await loadContent()
    if (props.source) preloadNextChapters()
  }
}

function handleClose() {
  console.log('[Reader] 关闭阅读器，保存进度')
  forceSaveProgress()
  saveScrollPosition()
  emit('close')
}

async function forceSaveProgress() {
  if (!props.book || !currentChapter.value) return
  try {
    await readingStore.saveProgress(
      String(props.book.bookUrl),
      currentChapter.value.id,
      currentChapter.value.title,
      Math.round(scrollPercent.value * 100)
    )
  } catch (err) {
    console.error('[Reader] 强制保存进度失败:', err)
  }
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

  if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); prevChapter() }
  if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); nextChapter() }
  if (e.key === 'Escape') { e.preventDefault(); handleClose() }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); showToc.value = !showToc.value }
}

onMounted(() => {
  readingStore.loadSettings()
  loadChapters()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  forceSaveProgress()
  saveScrollPosition()
  debouncedSaveScroll.cancel?.()
})

watch(chapterIndex, () => { saveScrollPosition() })

defineExpose({
  reload: loadChapters,
  goToChapter,
  prevChapter,
  nextChapter,
})
</script>

<style scoped>
.reader-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #0d0d0d;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: rgba(13, 13, 13, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  min-height: 48px;
  position: relative;
  z-index: 50;
}

.btn-back {
  position: relative;
  z-index: 200;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: color 0.2s;
  padding: 8px 16px;
  min-width: 60px;
  min-height: 36px;
  -webkit-app-region: no-drag;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-back:hover { color: var(--brand); }
.btn-back:active { opacity: 0.6; }

.reader-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  text-align: center;
  padding: 0 16px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions { display: flex; gap: 8px; }
.btn-chapter {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-chapter:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--brand);
}
.btn-chapter:disabled { opacity: 0.3; cursor: not-allowed; }

.toc-slide-enter-active,
.toc-slide-leave-active {
  transition: transform 0.25s ease;
}
.toc-slide-enter-from,
.toc-slide-leave-to {
  transform: translateX(-100%);
}

.reader-toc {
  position: absolute;
  top: 52px;
  left: 0;
  bottom: 52px;
  width: 280px;
  background: rgba(13, 13, 13, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  font-weight: 500;
}
.toc-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
}
.toc-close:hover { color: var(--text-primary); }

.toc-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.toc-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  text-align: left;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.toc-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.toc-item.active {
  color: var(--brand);
  background: var(--bg-active);
}

.btn-toc-toggle {
  position: absolute;
  top: 60px;
  left: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(13, 13, 13, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  cursor: pointer;
  z-index: 5;
  font-size: 16px;
  transition: all 0.2s;
}
.btn-toc-toggle:hover {
  color: var(--text-primary);
  border-color: var(--brand);
}

.reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}
.content-inner {
  max-width: 100%;
  font-family: 'Noto Serif SC', Georgia, serif;
  color: var(--text-primary);
}
.content-inner :deep(p) {
  margin-bottom: 1.2em;
}

.reader-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 24px;
  background: rgba(13, 13, 13, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  min-height: 48px;
}

.progress-text,
.chapter-info {
  font-size: 12px;
  color: var(--text-muted);
}

.footer-center {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-theme {
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-theme.active {
  color: var(--brand);
  background: var(--bg-active);
}
.btn-theme:hover { color: var(--text-secondary); }

.btn-size {
  padding: 2px 8px;
  font-size: 13px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-size:hover { border-color: var(--brand); }

.footer-center span {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 24px;
  text-align: center;
}

.reader-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 13, 0.6);
  backdrop-filter: blur(4px);
  z-index: 20;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.06);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reader-content::-webkit-scrollbar { width: 4px; }
.reader-content::-webkit-scrollbar-track { background: transparent; }
.reader-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
.reader-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.reader-theme-light .reader-fullscreen {
  background: #faf8f2;
}
.reader-theme-light .reader-header,
.reader-theme-light .reader-footer {
  background: rgba(250, 248, 242, 0.92);
  border-color: rgba(0, 0, 0, 0.04);
}
.reader-theme-light .reader-toc {
  background: rgba(250, 248, 242, 0.95);
}
.reader-theme-light .btn-toc-toggle {
  background: rgba(250, 248, 242, 0.85);
}
.reader-theme-light .content-inner { color: #1a1a1a; }
.reader-theme-light .btn-chapter {
  border-color: rgba(0, 0, 0, 0.06);
}
.reader-theme-light .btn-size {
  border-color: rgba(0, 0, 0, 0.06);
}
.reader-theme-light .reader-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
}

.reader-theme-sepia .reader-fullscreen {
  background: #f4ecd8;
}
.reader-theme-sepia .reader-header,
.reader-theme-sepia .reader-footer {
  background: rgba(244, 236, 216, 0.92);
  border-color: rgba(139, 119, 80, 0.12);
}
.reader-theme-sepia .reader-toc {
  background: rgba(244, 236, 216, 0.95);
}
.reader-theme-sepia .btn-toc-toggle {
  background: rgba(244, 236, 216, 0.85);
}
.reader-theme-sepia .content-inner { color: #5b4636; }
.reader-theme-sepia .btn-chapter {
  border-color: rgba(139, 119, 80, 0.12);
}
.reader-theme-sepia .btn-size {
  border-color: rgba(139, 119, 80, 0.12);
}
.reader-theme-sepia .reader-content::-webkit-scrollbar-thumb {
  background: rgba(139, 119, 80, 0.15);
}
</style>
