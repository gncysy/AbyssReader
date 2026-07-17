<template>
  <div v-if="book" class="reader-fullscreen">
    <header class="reader-header">
      <button class="btn-back" @click="handleClose" aria-label="返回书架">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
      <div class="header-actions">
        <button class="btn-chapter" :disabled="chapterIndex <= 0" @click="prevChapter" aria-label="上一章">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="btn-chapter" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter" aria-label="下一章">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </header>

    <Transition name="toc-slide">
      <aside v-if="showToc" class="reader-toc">
        <div class="toc-header"><span>目录</span><button class="toc-close" @click="showToc = false" aria-label="关闭目录">✕</button></div>
        <div class="toc-list" role="listbox">
          <button v-for="(ch, idx) in chapters" :key="idx" class="toc-item" :class="{ active: idx === chapterIndex }" @click="goToChapter(idx)">{{ ch.title || '无标题' }}</button>
        </div>
      </aside>
    </Transition>

    <button class="btn-toc-toggle" @click="showToc = !showToc" :aria-label="showToc ? '关闭目录' : '打开目录'">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>

    <div ref="contentRef" class="reader-content" @scroll="handleScroll">
      <div class="content-inner" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }" v-html="sanitizedContent"></div>
    </div>

    <footer class="reader-footer">
      <span class="progress-text">{{ Math.round(scrollPercent * 100) }}%</span>
      <div class="footer-center">
        <button v-for="theme in themes" :key="theme.value" class="btn-theme" :class="{ active: currentTheme === theme.value }" @click="setTheme(theme.value)">{{ theme.label }}</button>
        <button class="btn-size" @click="decreaseFontSize" aria-label="减小字号">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="size-value">{{ fontSize }}</span>
        <button class="btn-size" @click="increaseFontSize" aria-label="增大字号">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <span class="chapter-info">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
    </footer>

    <div v-if="loadingContent" class="reader-loading"><div class="loading-spinner"></div></div>
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

const props = defineProps<{ book: Book; source?: BookSource | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const message = useMessage()
const readingStore = useReadingStore()

const fontSize = computed({ get: () => readingStore.fontSize, set: (val: number) => readingStore.setFontSize(val) })
const lineHeight = computed({ get: () => readingStore.lineHeight, set: (val: number) => readingStore.setLineHeight(val) })
const currentTheme = computed({ get: () => readingStore.theme, set: (val: string) => readingStore.setTheme(val) })

const chapters = ref<Chapter[]>([])
const chapterIndex = ref(0)
const content = ref('')
const loadingContent = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const showToc = ref(false)
const themes = READER_THEMES
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

const sanitizedContent = computed(() => {
  if (!content.value) return ''
  return DOMPurify.sanitize(content.value, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','img','a','blockquote','pre','code','ul','ol','li','table','thead','tbody','tr','td','th'],
    ALLOWED_ATTR: ['href','target','src','alt','title','class'],
    ALLOWED_URI_REGEXP: /^(https?:\/\/|mailto:)/i,
    FORBID_TAGS: ['style','script','iframe','object','embed','form','input','button','meta','link'],
  })
})

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function setTheme(value: string) { readingStore.setTheme(value) }

function cleanSource(source: any) { if (!source) return null; return JSON.parse(JSON.stringify({ ...source, enabled: true })) }

async function loadChapters() {
  if (!props.book) return
  try {
    if (props.book.bookUrl?.startsWith('local://')) {
      const bookId = props.book.bookUrl.replace('local://', '')
      const data = await readerApi.getLocalBookChapters(bookId)
      if (!data?.length) { loadingContent.value = false; return }
      chapters.value = data.map((item: any, idx: number) => ({ id: Number(item.id)||idx, title: item.title||`第${idx+1}章`, url: `local://${bookId}/${item.id}`, index: idx, content: item.content||'' }))
      const progress = await readingStore.loadProgress(String(props.book.bookUrl), props.book.name||'', props.book.author||'')
      if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id)===Number(progress.chapterId)); if (idx!==-1) chapterIndex.value=idx; if (progress.chapterPos) scrollPercent.value=progress.chapterPos/10000 }
      await loadContent(); return
    }
    const allSources = await store.get('sources') || []
    const source = props.source || allSources.find((s:any) => s.bookSourceName===props.book?.originName)
    if (!source) { message.warning('书源未找到'); return }
    const tocUrl = props.book.tocUrl || props.book.bookUrl
    const result = await window.electronAPI.invoke('engine-get-toc', cleanSource(source), tocUrl, { book: { kind: props.book?.kind||'' } })
    if (!result.success) throw new Error(result.error)
    chapters.value = result.data || []
    const startIndex = (props.book as any).current_chapter_id
    if (typeof startIndex==='number' && startIndex>=0 && startIndex<chapters.value.length) { chapterIndex.value=startIndex }
    else {
      const progress = await readingStore.loadProgress(String(props.book.bookUrl), props.book.name||'', props.book.author||'')
      if (progress) { const idx = chapters.value.findIndex(ch => Number(ch.id)===Number(progress.chapterId)); if (idx!==-1) chapterIndex.value=idx; if (progress.chapterPos) scrollPercent.value=progress.chapterPos/10000 }
    }
    await loadContent(); preloadNextChapters()
  } catch (err: any) { message.error('加载目录失败: '+(err.message||err)) }
}

async function preloadNextChapters() {
  const allSources = await store.get('sources') || []
  const source = props.source || allSources.find((s:any) => s.bookSourceName===props.book?.originName)
  if (!source) return
  const range=3; const start=Math.min(chapterIndex.value+1, chapters.value.length-1); const end=Math.min(start+range, chapters.value.length)
  if (start>=end) return
  const urls = chapters.value.slice(start,end).map(ch=>ch.url).filter(Boolean)
  const worker = async () => { while(urls.length){ const url=urls.shift(); if(!url)break; try{await window.electronAPI.engineGetContent(cleanSource(source),url)}catch{} } }
  await Promise.allSettled([worker(),worker()])
}

async function loadContent() {
  if (!currentChapter.value) return
  loadingContent.value = true
  try {
    if (props.book.bookUrl?.startsWith('local://')) {
      const bookId = props.book.bookUrl.replace('local://', '')
      content.value = await readerApi.getLocalChapterContent(bookId, currentChapter.value.id)
      await nextTick(); restoreScrollPosition(); return
    }
    const allSources = await store.get('sources') || []
    const source = props.source || allSources.find((s:any) => s.bookSourceName===props.book?.originName)
    if (!source) { content.value='<p style="color:#e74c3c;">书源未找到</p>'; return }
    const result = await window.electronAPI.invoke('engine-get-content', cleanSource(source), currentChapter.value.url, { bookKind: props.book?.kind||'' })
    if (!result.success) throw new Error(result.error)
    content.value = result.data || '<p>内容为空</p>'
    await nextTick(); restoreScrollPosition()
    await readingStore.saveProgress(String(props.book.bookUrl), props.book.name||'', props.book.author||'', currentChapter.value.id||0, Math.round(scrollPercent.value*10000), currentChapter.value.title||'')
  } catch (err: any) { content.value='<p style="color:#e74c3c;">加载失败，请重试</p>' }
  finally { loadingContent.value = false }
}

const debouncedSaveScroll = debounce(saveScrollPosition, 300)

async function restoreScrollPosition() {
  if (!contentRef.value) return
  const key = `reader-scroll-${props.book.bookUrl}-${chapterIndex.value}`
  try { const pos=await store.get(key); if(pos){ const maxScroll=contentRef.value.scrollHeight-contentRef.value.clientHeight; contentRef.value.scrollTop=Math.min(parseFloat(pos),maxScroll); scrollPercent.value=parseFloat(pos)/maxScroll } } catch {}
}

async function saveScrollPosition() {
  if (!contentRef.value) return
  const maxScroll = contentRef.value.scrollHeight - contentRef.value.clientHeight
  if (maxScroll <= 0) return
  scrollPercent.value = Math.min(1, Math.max(0, contentRef.value.scrollTop / maxScroll))
  try { await store.set(`reader-scroll-${props.book.bookUrl}-${chapterIndex.value}`, String(contentRef.value.scrollTop)) } catch {}
  if (props.book.bookUrl && scrollPercent.value > 0.1) {
    await readingStore.saveProgress(String(props.book.bookUrl), props.book.name||'', props.book.author||'', currentChapter.value?.id||0, Math.round(scrollPercent.value*10000), currentChapter.value?.title||'')
  }
}

function handleScroll() {
  if (!contentRef.value) return
  const maxScroll = contentRef.value.scrollHeight - contentRef.value.clientHeight
  if (maxScroll <= 0) return
  scrollPercent.value = Math.min(1, Math.max(0, contentRef.value.scrollTop / maxScroll))
  debouncedSaveScroll()
}

async function goToChapter(index: number) { if (index===chapterIndex.value) { showToc.value=false; return }; await saveScrollPosition(); chapterIndex.value=index; showToc.value=false; await loadContent(); preloadNextChapters() }
async function prevChapter() { if (chapterIndex.value>0) { await saveScrollPosition(); chapterIndex.value--; await loadContent(); preloadNextChapters() } }
async function nextChapter() { if (chapterIndex.value<chapters.value.length-1) { await saveScrollPosition(); chapterIndex.value++; await loadContent(); preloadNextChapters() } }

function handleClose() { forceSaveProgress(); saveScrollPosition(); emit('close') }

async function forceSaveProgress() {
  if (!props.book || !currentChapter.value) return
  try { await readingStore.saveProgress(String(props.book.bookUrl), props.book.name||'', props.book.author||'', currentChapter.value.id, Math.round(scrollPercent.value*10000), currentChapter.value.title) } catch {}
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable) return
  if (event.key==='ArrowLeft') { event.preventDefault(); prevChapter() }
  if (event.key==='ArrowRight') { event.preventDefault(); nextChapter() }
  if (event.key==='Escape') { event.preventDefault(); handleClose() }
  if (event.key==='t'||event.key==='T') { event.preventDefault(); showToc.value=!showToc.value }
}

onMounted(() => { readingStore.loadSettings(); loadChapters(); window.addEventListener('keydown', handleKeydown) })
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); forceSaveProgress(); saveScrollPosition(); if (typeof debouncedSaveScroll.cancel==='function') debouncedSaveScroll.cancel() })
watch(chapterIndex, () => { saveScrollPosition() })
</script>

<style scoped>
.reader-fullscreen {
  position: fixed; inset: 0; z-index: 1000;
  background: var(--bg); display: flex; flex-direction: column;
  height: 100vh; width: 100vw; overflow: hidden;
  transition: background 0.3s var(--ease-out);
}

.reader-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0; min-height: 48px; z-index: 50;
  -webkit-app-region: drag;
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
}

.btn-back {
  color: var(--text-muted); background: transparent; border: 1px solid transparent;
  cursor: pointer; padding: 8px 12px; min-width: 40px; min-height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
  -webkit-app-region: no-drag;
}
.btn-back:hover { color: var(--brand); background: var(--bg-hover); border-color: var(--border-color); }
.btn-back:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }

.reader-title {
  font-size: 14px; font-weight: var(--font-medium); color: var(--text-secondary);
  text-align: center; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 8px;
}

.header-actions {
  display: flex; gap: 8px; flex-shrink: 0;
  -webkit-app-region: no-drag; padding-right: 80px;
}

.btn-chapter {
  padding: 6px 14px; font-size: 13px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; min-width: 38px; min-height: 34px;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
  -webkit-app-region: no-drag;
}
.btn-chapter:hover:not(:disabled) { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); }
.btn-chapter:active:not(:disabled) { background: var(--bg-active); }
.btn-chapter:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.btn-chapter:disabled { opacity: 0.3; cursor: not-allowed; }

.toc-slide-enter-active, .toc-slide-leave-active { transition: transform 0.28s var(--ease-out); }
.toc-slide-enter-from, .toc-slide-leave-to { transform: translateX(-100%); }

.reader-toc {
  position: absolute; top: 48px; left: 0; bottom: 48px; width: 280px;
  background: var(--bg-card); border-right: 1px solid var(--border-color);
  z-index: 10; display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
}
.toc-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; border-bottom: 1px solid var(--border-color);
  color: var(--text-primary); font-weight: var(--font-semibold); font-size: 14px;
}
.toc-close {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  font-size: 18px; padding: 4px 8px; border-radius: var(--radius-sm);
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.toc-close:hover { color: var(--text-primary); background: var(--bg-hover); }
.toc-list { flex: 1; overflow-y: auto; padding: 6px 0; }
.toc-item {
  display: block; width: 100%; padding: 10px 18px; text-align: left;
  font-size: 13px; color: var(--text-secondary); background: transparent;
  border: none; cursor: pointer;
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
  line-height: 1.4;
}
.toc-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.toc-item.active { color: var(--brand); background: var(--bg-active); font-weight: var(--font-medium); }
.toc-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }

.btn-toc-toggle {
  position: absolute; top: 58px; left: 14px; z-index: 5;
  width: 38px; height: 38px; border-radius: var(--radius-md);
  background: var(--bg-card); border: 1px solid var(--border-color);
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}
.btn-toc-toggle:hover { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); transform: scale(1.05); }
.btn-toc-toggle:active { transform: scale(0.97); }
.btn-toc-toggle:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.reader-content { flex: 1; overflow-y: auto; padding: 28px 36px; }
.content-inner { max-width: 720px; margin: 0 auto; font-family: 'Noto Serif SC', Georgia, serif; color: var(--text-primary); }
.content-inner :deep(p) { margin-bottom: 1.2em; line-height: inherit; }

.reader-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 24px; background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0; min-height: 48px;
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
}
.progress-text, .chapter-info { font-size: 12px; color: var(--text-muted); min-width: 64px; }
.chapter-info { text-align: right; }
.footer-center { display: flex; align-items: center; gap: 8px; }

.btn-theme {
  padding: 5px 12px; font-size: 12px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; min-height: 30px;
  font-weight: var(--font-medium);
  transition: color 0.18s var(--ease-out), border-color 0.18s var(--ease-out), background 0.18s var(--ease-out);
}
.btn-theme.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.btn-theme:hover { color: var(--text-primary); border-color: var(--brand); }
.btn-theme:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }

.btn-size {
  padding: 5px 10px; font-size: 13px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; min-width: 34px; min-height: 30px;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.18s var(--ease-out), color 0.18s var(--ease-out);
}
.btn-size:hover { border-color: var(--brand); color: var(--text-primary); }
.btn-size:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.size-value { font-size: 13px; color: var(--text-secondary); min-width: 24px; text-align: center; font-weight: var(--font-medium); }

.reader-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); z-index: 20;
}
</style>