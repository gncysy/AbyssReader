<template>
  <div v-if="book" class="reader-overlay" @click.self="handleClose">
    <div class="reader-container" :class="themeClass">
      <!-- 顶部栏 -->
      <header class="reader-header">
        <button class="btn-back" @click="handleClose">← 返回</button>
        <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
        <div class="header-actions">
          <button class="btn-chapter" :disabled="chapterIndex <= 0" @click="prevChapter">上一章</button>
          <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter">下一章</button>
        </div>
      </header>

      <!-- 目录侧栏 -->
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

      <!-- 目录切换按钮 -->
      <button class="btn-toc-toggle" @click="showToc = !showToc">☰</button>

      <!-- 正文 -->
      <div ref="contentRef" class="reader-content" @scroll="handleScroll">
        <div
          class="content-inner"
          :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }"
          v-html="sanitizedContent"
        ></div>
      </div>

      <!-- 底部控制栏 -->
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

      <!-- 加载状态 -->
      <div v-if="loadingContent" class="reader-loading">
        <div class="loading-spinner"></div>
      </div>
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

// ===== 使用 Pinia 状态 =====
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

// ===== 本地状态 =====
const chapters = ref<Chapter[]>([])
const chapterIndex = ref(0)
const content = ref('')
const loadingContent = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const showToc = ref(false)

const themes = READER_THEMES

// ===== 计算属性 =====
const themeClass = computed(() => `reader-theme-${currentTheme.value}`)
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

// ===== XSS 防护 - 严格 DOMPurify 配置 =====
const sanitizedContent = computed(() => {
  if (!content.value) return ''

  return DOMPurify.sanitize(content.value, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'a', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'src', 'alt', 'title', 'class'
    ],
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

// ===== 防抖保存滚动位置 =====
const debouncedSaveScroll = debounce(saveScrollPosition, 300)

// ===== 字体控制（委托给 Pinia） =====
function increaseFontSize() {
  readingStore.increaseFontSize()
}

function decreaseFontSize() {
  readingStore.decreaseFontSize()
}

function setTheme(value: string) {
  readingStore.setTheme(value)
}

// ===== 加载章节 =====
async function loadChapters() {
  console.log('[Reader] ===== loadChapters 被调用 =====');
  console.log('[Reader] props.book:', props.book);
  console.log('[Reader] props.source:', props.source);
  if (!props.book) return

  try {
    // 本地书籍
    if (props.book.sourceId === 'local') {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data = await readerApi.getLocalBookChapters(bookId)
      chapters.value = data.map((c: any, idx: number) => ({
        id: c.id,
        title: c.title,
        url: `local://${bookId}/${c.id}`,
        index: idx,
        content: c.content,
      }))

      const progress = await readingStore.loadProgress(String(props.book.id))
      if (progress) {
        const idx = chapters.value.findIndex(c => c.id === progress.chapterId)
        if (idx !== -1) chapterIndex.value = idx
        if (progress.scrollPercent) scrollPercent.value = progress.scrollPercent / 100
      }
      await loadContent()
      return
    }

    // 网络书籍
    if (!props.source) {
      message.warning('书源未找到，请检查书源是否已导入')
      return
    }

    const result = await window.electronAPI.engineGetToc(JSON.parse(JSON.stringify(props.source)),
      props.book.tocUrl || props.book.bookUrl
    )

    if (!result.success) {
      throw new Error(result.error)
    }

    chapters.value = result.data || []

    const progress = await readingStore.loadProgress(String(props.book.id))
    if (progress) {
      const idx = chapters.value.findIndex(c => c.id === progress.chapterId)
      if (idx !== -1) chapterIndex.value = idx
      if (progress.scrollPercent) scrollPercent.value = progress.scrollPercent / 100
    }

    await loadContent()
    preloadNextChapters()

  } catch (err: any) {
    message.error('加载目录失败: ' + (err.message || err))
  }
}

// ===== 预加载后续章节 =====
async function preloadNextChapters() {
  const preloadRange = 3
  const start = Math.min(chapterIndex.value + 1, chapters.value.length - 1)
  const end = Math.min(start + preloadRange, chapters.value.length)

  if (start >= end || !props.source) return

  const urls = []
  for (let i = start; i < end; i++) {
    const ch = chapters.value[i]
    if (ch && ch.url) {
      urls.push(ch.url)
    }
  }

  if (urls.length === 0) return

  const concurrency = 2
  const promises: Promise<void>[] = []
  const queue = [...urls]

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift()
      if (!url) break
      try {
        await window.electronAPI.engineGetContent(JSON.parse(JSON.stringify(props.source)), url)
      } catch {
        // 忽略
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
    promises.push(worker())
  }

  await Promise.allSettled(promises)
}

// ===== 加载正文 =====
async function loadContent() {
  if (!currentChapter.value) return

  loadingContent.value = true

  try {
    // 本地书籍
    if (props.book.sourceId === 'local') {
      const bookId = props.book.bookUrl.replace('local://', '')
      content.value = await readerApi.getLocalChapterContent(bookId, currentChapter.value.id)
      await nextTick()
      restoreScrollPosition()
      return
    }

    // 网络书籍
    if (!props.source) {
      content.value = '<p style="color:#e74c3c;">书源未找到</p>'
      return
    }

    const result = await window.electronAPI.engineGetContent(JSON.parse(JSON.stringify(props.source)),
      currentChapter.value.url
    )

    if (!result.success) {
      throw new Error(result.error)
    }

    content.value = result.data || '<p>内容为空</p>'
    await nextTick()
    restoreScrollPosition()

    // 保存进度
    await readingStore.saveProgress(
      String(props.book.id),
      currentChapter.value.id || 0,
      currentChapter.value.title || '',
      Math.round(scrollPercent.value * 100)
    )

  } catch (err: any) {
    content.value = '<p style="color:#e74c3c;">加载失败，请重试</p>'
    console.error('[Reader] 加载正文失败:', err)
  } finally {
    loadingContent.value = false
  }
}

// ===== 滚动位置管理 =====
async function restoreScrollPosition() {
  if (!contentRef.value) return
  const key = `reader-scroll-${props.book.id}-${chapterIndex.value}`
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

  const key = `reader-scroll-${props.book.id}-${chapterIndex.value}`
  try {
    await store.set(key, String(contentRef.value.scrollTop))
  } catch {}

  if (props.book.id && percent > 0.1) {
    await readingStore.saveProgress(
      String(props.book.id),
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

// ===== 章节导航 =====
async function goToChapter(index: number) {
  if (index === chapterIndex.value) {
    showToc.value = false
    return
  }
  if (index < 0 || index >= chapters.value.length) return

  await saveScrollPosition()
  chapterIndex.value = index
  showToc.value = false
  await loadContent()
  if (props.source) {
    preloadNextChapters()
  }
}

async function prevChapter() {
  if (chapterIndex.value > 0) {
    await saveScrollPosition()
    chapterIndex.value--
    await loadContent()
    if (props.source) {
      preloadNextChapters()
    }
  }
}

async function nextChapter() {
  if (chapterIndex.value < chapters.value.length - 1) {
    await saveScrollPosition()
    chapterIndex.value++
    await loadContent()
    if (props.source) {
      preloadNextChapters()
    }
  }
}

// ===== 关闭 =====
function handleClose() {
  saveScrollPosition()
  emit('close')
}

// ===== 键盘快捷键 =====
function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'h') {
    e.preventDefault()
    prevChapter()
  }
  if (e.key === 'ArrowRight' || e.key === 'l') {
    e.preventDefault()
    nextChapter()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    handleClose()
  }
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault()
    showToc.value = !showToc.value
  }
}

// ===== 生命周期 =====
onMounted(() => {
  readingStore.loadSettings()
  loadChapters()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  saveScrollPosition()
  debouncedSaveScroll.cancel?.()
})

watch(chapterIndex, () => {
  saveScrollPosition()
})

defineExpose({
  reload: loadChapters,
  goToChapter,
  prevChapter,
  nextChapter,
})
</script>

<style scoped>
/* 样式保持不变 */
.reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.reader-container {
  position: relative;
  width: 100%;
  max-width: 820px;
  height: 100%;
  max-height: 92vh;
  background: #0d0d0d;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(13, 13, 13, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  min-height: 52px;
}

.btn-back {
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.2s;
}
.btn-back:hover {
  color: var(--brand);
}

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

.header-actions {
  display: flex;
  gap: 8px;
}

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
.btn-chapter:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

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
  background: rgba(13, 13, 13, 0.88);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
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
.toc-close:hover {
  color: var(--text-primary);
}

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
  background: rgba(13, 13, 13, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
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
.btn-theme:hover {
  color: var(--text-secondary);
}

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
.btn-size:hover {
  border-color: var(--brand);
}

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
  to {
    transform: rotate(360deg);
  }
}

.reader-content::-webkit-scrollbar {
  width: 4px;
}
.reader-content::-webkit-scrollbar-track {
  background: transparent;
}
.reader-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
.reader-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.reader-theme-light .reader-container {
  background: #faf8f2;
}
.reader-theme-light .reader-header,
.reader-theme-light .reader-footer {
  background: rgba(250, 248, 242, 0.85);
  border-color: rgba(0, 0, 0, 0.04);
}
.reader-theme-light .reader-toc {
  background: rgba(250, 248, 242, 0.92);
}
.reader-theme-light .btn-toc-toggle {
  background: rgba(250, 248, 242, 0.85);
}
.reader-theme-light .content-inner {
  color: #1a1a1a;
}
.reader-theme-light .btn-chapter {
  border-color: rgba(0, 0, 0, 0.06);
}
.reader-theme-light .btn-size {
  border-color: rgba(0, 0, 0, 0.06);
}
.reader-theme-light .reader-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
}

.reader-theme-sepia .reader-container {
  background: #f4ecd8;
}
.reader-theme-sepia .reader-header,
.reader-theme-sepia .reader-footer {
  background: rgba(244, 236, 216, 0.85);
  border-color: rgba(139, 119, 80, 0.12);
}
.reader-theme-sepia .reader-toc {
  background: rgba(244, 236, 216, 0.92);
}
.reader-theme-sepia .btn-toc-toggle {
  background: rgba(244, 236, 216, 0.85);
}
.reader-theme-sepia .content-inner {
  color: #5b4636;
}
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


