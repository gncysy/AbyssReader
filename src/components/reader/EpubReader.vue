<template>
  <Teleport to="body">
    <div
      v-if="book"
      class="epub-reader"
      :data-theme="effectiveTheme"
      @click.self="toggleControls"
    >
      <Transition name="epub-fade">
        <header v-if="showControls" v-no-drag class="reader-header">
          <button class="btn-back" aria-label="返回" @click="handleClose">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <span class="header-progress">{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
          <h2 class="reader-title">{{ currentChapter?.title || '加载中...' }}</h2>
          <button class="btn-toc" aria-label="目录" @click="openToc">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </header>
      </Transition>

      <div class="reader-body" :class="{ 'no-header': !showControls }">
        <div v-if="loading" class="reader-loading"><LoadingSpinner /></div>
        <iframe
          ref="iframeRef"
          class="epub-iframe"
          sandbox="allow-scripts"
          title="EPUB 内容"
        ></iframe>
      </div>

      <Transition name="epub-fade">
        <footer v-if="showControls" class="reader-footer">
          <button class="btn-nav" :disabled="chapterIndex <= 0" @click="prevChapter">上一章</button>
          <span class="nav-info">{{ scrollPercentText }}</span>
          <button class="btn-nav" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter">下一章</button>
        </footer>
      </Transition>

      <Transition name="epub-fade">
        <div v-if="showToc" class="toc-overlay" @click.self="showToc = false">
          <div class="toc-panel">
            <header class="toc-header">
              <h3>目录 · {{ chapters.length }} 章</h3>
              <button class="toc-close" aria-label="关闭" @click="showToc = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </header>
            <div class="toc-list">
              <button
                v-for="(ch, i) in chapters"
                :key="ch.index"
                class="toc-item"
                :class="{ active: i === chapterIndex }"
                @click="selectChapter(i)"
              >{{ ch.title }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import DOMPurify from 'isomorphic-dompurify'
import { invoke } from '@tauri-apps/api/core'
import { epub as epubApi } from '@/services'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useReaderStore } from '@/stores/reader.js'
import type { Book } from '@/types'

const props = defineProps<{ book: Book | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const readerStore = useReaderStore()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const chapters = ref<Array<{ index: number; title: string; href: string; cachedPath: string }>>([])
const chapterIndex = ref(0)
const loading = ref(false)
const showControls = ref(true)
const showToc = ref(false)
const currentScrollPercent = ref(0)

const SAVE_DEBOUNCE_MS = 800
const SCROLL_PERCENT_MULTIPLIER = 10000

// 正文左右留白（px）。视口小于 1000px 时按 8% 收缩。
const CONTENT_PADDING_MAX = 80
const CONTENT_PADDING_MIN = 20

const effectiveTheme = computed(() => readerStore.readerTheme)
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null)

const scrollPercentText = computed(() => {
  const p = Math.round(currentScrollPercent.value * 100)
  return `${p}% · ${chapterIndex.value + 1} / ${chapters.value.length}`
})

const bookId = computed(() => {
  const b = props.book
  if (!b) return ''
  const rec = b as unknown as Record<string, unknown>
  return typeof rec._epubBookId === 'string' ? rec._epubBookId : ''
})

let hideTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingScrollPercent = 0

function resetHideTimer(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { showControls.value = false }, 3000)
}

function toggleControls(): void {
  showControls.value = !showControls.value
  if (showControls.value) resetHideTimer()
}

const FORBID_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'link', 'meta', 'base', 'applet', 'frame',
  'frameset', 'style',
]
const FORBID_ATTR = ['srcdoc', 'sandbox', 'formaction', 'action']

// bridge 脚本 —— 内联注入 iframe。
// 用 \x3C 转义所有小于号，避免 Vue SFC 编译器误判（编译器不区分字符串/注释里的标签）。
// 运行时展开后是标准的 script 标签字符串。
// hash 由 getBridgeHash() 运行时计算（剥离标签，只算内容），不硬编码。
//
// 本版本：
//   - iframe 内部自定义滚动条（替代原生滚动条），照搬 ScrollThumb.vue 的样式与行为
//   - 移除"鼠标移到上部自动弹菜单"：不再发 epub-mousemove，父文档也不监听
const BRIDGE_SCRIPT =
  '\x3Cscript>\n' +
  '(function(){\n' +
  '  try {\n' +
  '    var scrollScheduled = false;\n' +
  '    function reportScroll() {\n' +
  '      if (scrollScheduled) return;\n' +
  '      scrollScheduled = true;\n' +
  '      requestAnimationFrame(function(){\n' +
  '        scrollScheduled = false;\n' +
  '        var total = document.documentElement.scrollHeight - document.documentElement.clientHeight;\n' +
  '        var percent = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;\n' +
  '        window.parent.postMessage({ type: \'epub-scroll\', percent: percent }, \'*\');\n' +
  '      });\n' +
  '    }\n' +
  '    document.addEventListener(\'scroll\', reportScroll, { passive: true });\n' +
  '    window.addEventListener(\'load\', reportScroll);\n' +
  '\n' +
  '    document.addEventListener(\'click\', function(e){\n' +
  '      var target = e.target;\n' +
  '      while (target && target !== document.body) {\n' +
  '        if (target.tagName === \'A\') {\n' +
  '          var href = target.getAttribute(\'data-epub-href\');\n' +
  '          e.preventDefault();\n' +
  '          e.stopPropagation();\n' +
  '          if (!href) {\n' +
  '            window.parent.postMessage({ type: \'epub-click\' }, \'*\');\n' +
  '            return;\n' +
  '          }\n' +
  '          if (href.charAt(0) === \'#\') {\n' +
  '            var id = href.substring(1);\n' +
  '            var el = document.getElementById(id) || document.getElementsByName(id)[0];\n' +
  '            if (el) el.scrollIntoView({ behavior: \'smooth\', block: \'start\' });\n' +
  '            return;\n' +
  '          }\n' +
  '          window.parent.postMessage({ type: \'epub-link\', href: href }, \'*\');\n' +
  '          return;\n' +
  '        }\n' +
  '        target = target.parentElement;\n' +
  '      }\n' +
  '      window.parent.postMessage({ type: \'epub-click\' }, \'*\');\n' +
  '    });\n' +
  '\n' +
  '    window.addEventListener(\'message\', function(e){\n' +
  '      var data = e.data;\n' +
  '      if (!data || typeof data.type !== \'string\') return;\n' +
  '      if (data.type === \'epub-scroll-to\') {\n' +
  '        var total = document.documentElement.scrollHeight - document.documentElement.clientHeight;\n' +
  '        if (total > 0) {\n' +
  '          window.scrollTo(0, total * (typeof data.percent === \'number\' ? data.percent : 0));\n' +
  '        }\n' +
  '      } else if (data.type === \'epub-anchor\') {\n' +
  '        var el2 = document.getElementById(data.id) || document.getElementsByName(data.id)[0];\n' +
  '        if (el2) el2.scrollIntoView({ behavior: \'smooth\', block: \'start\' });\n' +
  '      }\n' +
  '    });\n' +
  '\n' +
  '    // ─── 自定义滚动条（照搬 ScrollThumb.vue 的样式与行为） ───\n' +
  '    var hideScrollbarStyle = document.createElement(\'style\');\n' +
  '    hideScrollbarStyle.textContent = \'html{scrollbar-width:none;-ms-overflow-style:none;}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}\';\n' +
  '    document.head.appendChild(hideScrollbarStyle);\n' +
  '\n' +
  '    var thumb = document.createElement(\'div\');\n' +
  '    thumb.id = \'__epub_scroll_thumb\';\n' +
  '    thumb.style.cssText = \'position:fixed;right:2px;width:4px;border-radius:2px;background:rgba(128,128,128,0.35);z-index:2147483647;cursor:pointer;user-select:none;-webkit-user-select:none;display:none;transition:width 0.15s,right 0.15s,background 0.15s;\';\n' +
  '    document.body.appendChild(thumb);\n' +
  '\n' +
  '    var dragging = false;\n' +
  '    var hovering = false;\n' +
  '    var hideTimer = null;\n' +
  '\n' +
  '    function getScrollTop() {\n' +
  '      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;\n' +
  '    }\n' +
  '\n' +
  '    function updateThumb() {\n' +
  '      var viewH = document.documentElement.clientHeight;\n' +
  '      var totalH = document.documentElement.scrollHeight;\n' +
  '      if (totalH <= viewH) { thumb.style.display = \'none\'; return; }\n' +
  '      thumb.style.display = \'block\';\n' +
  '      var thumbH = Math.max(24, (viewH / totalH) * viewH);\n' +
  '      var maxTop = viewH - thumbH;\n' +
  '      var percent = getScrollTop() / (totalH - viewH);\n' +
  '      thumb.style.top = (percent * maxTop) + \'px\';\n' +
  '      thumb.style.height = thumbH + \'px\';\n' +
  '    }\n' +
  '\n' +
  '    function cancelHide() {\n' +
  '      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }\n' +
  '    }\n' +
  '\n' +
  '    function scheduleHide() {\n' +
  '      cancelHide();\n' +
  '      if (!dragging && !hovering) {\n' +
  '        hideTimer = setTimeout(function() { thumb.style.display = \'none\'; hideTimer = null; }, 1500);\n' +
  '      }\n' +
  '    }\n' +
  '\n' +
  '    function showThumb() {\n' +
  '      thumb.style.display = \'block\';\n' +
  '      scheduleHide();\n' +
  '    }\n' +
  '\n' +
  '    thumb.addEventListener(\'mouseenter\', function() {\n' +
  '      hovering = true;\n' +
  '      cancelHide();\n' +
  '      thumb.style.width = \'8px\';\n' +
  '      thumb.style.right = \'0\';\n' +
  '      thumb.style.background = \'rgba(128,128,128,0.55)\';\n' +
  '    });\n' +
  '\n' +
  '    thumb.addEventListener(\'mouseleave\', function() {\n' +
  '      hovering = false;\n' +
  '      if (!dragging) {\n' +
  '        thumb.style.width = \'4px\';\n' +
  '        thumb.style.right = \'2px\';\n' +
  '        thumb.style.background = \'rgba(128,128,128,0.35)\';\n' +
  '      }\n' +
  '      scheduleHide();\n' +
  '    });\n' +
  '\n' +
  '    function onDragMove(e) {\n' +
  '      if (!dragging) return;\n' +
  '      var viewH = document.documentElement.clientHeight;\n' +
  '      var totalH = document.documentElement.scrollHeight;\n' +
  '      var thumbH = thumb.offsetHeight;\n' +
  '      var maxTop = viewH - thumbH;\n' +
  '      var newTop = Math.max(0, Math.min(maxTop, e.clientY - thumbH / 2));\n' +
  '      window.scrollTo(0, (newTop / maxTop) * (totalH - viewH));\n' +
  '    }\n' +
  '\n' +
  '    function onDragUp() {\n' +
  '      dragging = false;\n' +
  '      document.removeEventListener(\'mousemove\', onDragMove);\n' +
  '      document.removeEventListener(\'mouseup\', onDragUp);\n' +
  '      if (!hovering) {\n' +
  '        thumb.style.width = \'4px\';\n' +
  '        thumb.style.right = \'2px\';\n' +
  '        thumb.style.background = \'rgba(128,128,128,0.35)\';\n' +
  '      }\n' +
  '      scheduleHide();\n' +
  '    }\n' +
  '\n' +
  '    thumb.addEventListener(\'mousedown\', function(e) {\n' +
  '      e.preventDefault();\n' +
  '      e.stopPropagation();\n' +
  '      dragging = true;\n' +
  '      cancelHide();\n' +
  '      thumb.style.width = \'8px\';\n' +
  '      thumb.style.right = \'0\';\n' +
  '      thumb.style.background = \'rgba(128,128,128,0.7)\';\n' +
  '      document.addEventListener(\'mousemove\', onDragMove);\n' +
  '      document.addEventListener(\'mouseup\', onDragUp);\n' +
  '    });\n' +
  '\n' +
  '    document.addEventListener(\'scroll\', function() {\n' +
  '      updateThumb();\n' +
  '      showThumb();\n' +
  '    }, { passive: true });\n' +
  '    window.addEventListener(\'resize\', updateThumb);\n' +
  '    window.addEventListener(\'load\', updateThumb);\n' +
  '    updateThumb();\n' +
  '\n' +
  '    window.parent.postMessage({ type: \'epub-ready\' }, \'*\');\n' +
  '  } catch(e) {}\n' +
  '})();\n' +
  '\x3C/script>'

// 缓存 bridge 的 sha256 base64 —— 首次计算，后续 O(1)。
// 注意：CSP 的 script hash 只算脚本标签之间的内容，不含标签本身。
let cachedBridgeHash: string | null = null

async function getBridgeHash(): Promise<string> {
  if (cachedBridgeHash !== null) return cachedBridgeHash

  const openTag = '\x3Cscript>'
  const closeTag = '\x3C/script>'
  let content = BRIDGE_SCRIPT
  if (content.startsWith(openTag)) content = content.slice(openTag.length)
  if (content.endsWith(closeTag)) content = content.slice(0, content.length - closeTag.length)

  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  let binary = ''
  for (let i = 0; i < hashArray.length; i++) {
    binary += String.fromCharCode(hashArray[i]!)
  }
  cachedBridgeHash = btoa(binary)
  return cachedBridgeHash
}

function getThemeColors(): { bg: string; text: string } {
  switch (effectiveTheme.value) {
    case 'light': return { bg: '#f5f5f5', text: '#1a1a1a' }
    case 'sepia': return { bg: '#f4ecd8', text: '#3d2b1f' }
    default: return { bg: '#0f0f0f', text: '#f0f0f0' }
  }
}

async function buildSrcdoc(rawXhtml: string, rawCss: string): Promise<string> {
  const sanitized = DOMPurify.sanitize(rawXhtml, {
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_ATTR: ['data-epub-href'],
  })

  const colors = getThemeColors()

  // 左右留白：视口宽 < 1000px 时用 8%，否则固定 80px（含 padding）。
  // 用 vw 单位让 iframe 内部自适应用户窗口大小。
  const baseStyle = `
    html, body { margin: 0; padding: 0; }
    body {
      padding: 32px ${CONTENT_PADDING_MAX}px;
      font-size: ${readerStore.fontSize}px;
      line-height: ${readerStore.lineHeight};
      font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      word-break: break-word;
      color: ${colors.text};
      background: ${colors.bg};
    }
    @media (max-width: 1000px) {
      body { padding-left: 8vw; padding-right: 8vw; }
    }
    @media (max-width: 500px) {
      body { padding-left: ${CONTENT_PADDING_MIN}px; padding-right: ${CONTENT_PADDING_MIN}px; }
    }
    img { max-width: 100%; height: auto; }
    a { color: #d4a017; cursor: pointer; }
  `

  const epubStyle = rawCss

  const bridgeHash = await getBridgeHash()
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src epub: data: http://epub.localhost https://epub.localhost; style-src 'unsafe-inline'; font-src epub: data: http://epub.localhost https://epub.localhost; script-src 'sha256-${bridgeHash}'; connect-src 'none';">`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${csp}<style>${baseStyle}</style><style>${epubStyle}</style></head>
<body>${sanitized}${BRIDGE_SCRIPT}</body></html>`
}

function scheduleSaveProgress(percent: number): void {
  pendingScrollPercent = percent
  currentScrollPercent.value = percent
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    flushSaveProgress()
  }, SAVE_DEBOUNCE_MS)
}

function flushSaveProgress(): void {
  if (!props.book) return
  const ch = currentChapter.value
  if (!ch) return
  const chapterPos = Math.round(pendingScrollPercent * SCROLL_PERCENT_MULTIPLIER)
  readerStore.saveProgress(
    props.book.bookUrl,
    props.book.name,
    props.book.author,
    ch.index,
    chapterPos,
    ch.title,
  ).catch(() => {})
}

async function loadChapter(): Promise<void> {
  if (!bookId.value) return
  const ch = currentChapter.value
  if (!ch) return

  loading.value = true
  try {
    const [rawXhtml, rawCss] = await Promise.all([
      epubApi.getChapter(bookId.value, ch.index),
      epubApi.getChapterCss(bookId.value, ch.index),
    ])
    const srcdoc = await buildSrcdoc(rawXhtml, rawCss)
    await nextTick()

    const iframe = iframeRef.value
    if (!iframe) return

    const restorePercent = pendingScrollPercent
    const onLoad = (): void => {
      iframe.removeEventListener('load', onLoad)
      if (restorePercent > 0 && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'epub-scroll-to', percent: restorePercent },
          '*',
        )
      }
    }
    iframe.addEventListener('load', onLoad)
    iframe.srcdoc = srcdoc
  } catch (err) {
    console.error('[EPUB] 加载章节失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadChapters(): Promise<void> {
  if (!bookId.value || !props.book) return
  try {
    const list = await epubApi.getChapters(bookId.value)
    chapters.value = list

    const progress = await readerStore.loadProgress(
      props.book.bookUrl,
      props.book.name,
      props.book.author,
    )
    if (progress && typeof progress.chapterId === 'number') {
      const idx = list.findIndex((c) => c.index === progress.chapterId)
      if (idx !== -1) {
        chapterIndex.value = idx
        const pos = typeof progress.chapterPos === 'number' ? progress.chapterPos : 0
        pendingScrollPercent = pos / SCROLL_PERCENT_MULTIPLIER
        currentScrollPercent.value = pendingScrollPercent
      }
    }
  } catch (err) {
    console.error('[EPUB] 加载章节列表失败:', err)
  }
}

function selectChapter(i: number): void {
  if (i < 0 || i >= chapters.value.length) return
  if (i === chapterIndex.value) {
    showToc.value = false
    return
  }
  flushSaveProgress()
  pendingScrollPercent = 0
  currentScrollPercent.value = 0
  chapterIndex.value = i
  showToc.value = false
}

function prevChapter(): void { selectChapter(chapterIndex.value - 1) }
function nextChapter(): void { selectChapter(chapterIndex.value + 1) }
function openToc(): void { showToc.value = true }

async function handleClose(): Promise<void> {
  flushSaveProgress()
  emit('close')
}

function handleKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName?.toLowerCase() || ''
  if (tag === 'input' || tag === 'textarea') return

  if (e.key === 'ArrowLeft') { e.preventDefault(); prevChapter() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextChapter() }
  else if (e.key === 'Escape') { e.preventDefault(); handleClose() }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleControls()
  }
}

const pendingAnchor = ref('')

function handleEpubLink(href: string): void {
  if (!href) return

  if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
    const url = href.startsWith('//') ? 'https:' + href : href
    invoke('open_url', { url }).catch((err: unknown) => {
      console.warn('[EPUB] open_url 失败，回退 window.open:', err)
      window.open(url, '_blank')
    })
    return
  }

  const hashIdx = href.indexOf('#')
  const chapterHref = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const anchor = hashIdx === -1 ? '' : href.slice(hashIdx + 1)

  const cleanedChapterHref = chapterHref.split('?')[0]?.replace(/^\.\//, '') || ''

  if (!cleanedChapterHref) {
    if (anchor) {
      const iframe = iframeRef.value
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'epub-anchor', id: anchor }, '*')
      }
    }
    return
  }

  const target = chapters.value.find((c) => {
    const cHref = c.href.replace(/^\.\//, '')
    const cHrefLower = cHref.toLowerCase()
    const targetLower = cleanedChapterHref.toLowerCase()
    if (cHrefLower === targetLower) return true
    const cParts = cHrefLower.split('/')
    const tParts = targetLower.split('/')
    const shortLen = Math.min(cParts.length, tParts.length)
    for (let i = 0; i < shortLen; i++) {
      if (cParts[cParts.length - 1 - i] !== tParts[tParts.length - 1 - i]) return false
    }
    return true
  })

  if (target) {
    if (target.index === chapterIndex.value) {
      if (anchor) {
        const iframe = iframeRef.value
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'epub-anchor', id: anchor }, '*')
        }
      }
      return
    }
    pendingAnchor.value = anchor
    selectChapter(target.index)
  } else {
    console.warn('[EPUB] 未找到目标章节:', href)
  }
}

function handleMessage(e: MessageEvent): void {
  const data = e.data as { type?: string; percent?: number; href?: string } | null
  if (!data || typeof data.type !== 'string') return
  if (data.type === 'epub-scroll') {
    const p = typeof data.percent === 'number' ? data.percent : 0
    scheduleSaveProgress(p)
  } else if (data.type === 'epub-click') {
    toggleControls()
  } else if (data.type === 'epub-link') {
    const href = typeof data.href === 'string' ? data.href : ''
    handleEpubLink(href)
  }
}

watch(chapterIndex, () => { loadChapter() })
watch(effectiveTheme, () => { loadChapter() })
watch(() => readerStore.fontSize, () => { loadChapter() })
watch(() => readerStore.lineHeight, () => { loadChapter() })
watch(() => props.book, (val) => {
  if (val) {
    chapterIndex.value = 0
    chapters.value = []
    pendingScrollPercent = 0
    currentScrollPercent.value = 0
    pendingAnchor.value = ''
    loadChapters().then(() => loadChapter())
  }
})

onMounted(async () => {
  await loadChapters()
  await loadChapter()
  resetHideTimer()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('message', handleMessage)
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  flushSaveProgress()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('message', handleMessage)
})
</script>

<style scoped>
.epub-reader {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column;
  background: var(--bg);
  color: var(--text-primary);
  transition: background 0.3s ease;
}
.epub-reader[data-theme="dark"] {
  --bg: #0f0f0f; --bg-card: #1a1a1a; --bg-hover: #2a2a2a;
  --text-primary: #f0f0f0; --text-secondary: #b0b0b0; --text-muted: #999999;
  --border-color: rgba(255,255,255,0.08);
}
.epub-reader[data-theme="light"] {
  --bg: #f5f5f5; --bg-card: #ffffff; --bg-hover: #f0f0f0;
  --text-primary: #1a1a1a; --text-secondary: #555555; --text-muted: #777777;
  --border-color: rgba(0,0,0,0.08);
}
.epub-reader[data-theme="sepia"] {
  --bg: #f4ecd8; --bg-card: #faf5e8; --bg-hover: rgba(139,119,80,0.1);
  --text-primary: #3d2b1f; --text-secondary: #6b5540; --text-muted: #8a7560;
  --border-color: rgba(139,119,80,0.15);
}

.reader-header {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; align-items: center; gap: 12px;
  padding: 6px 16px; height: 48px;
  background: var(--bg-card); border-bottom: 1px solid var(--border-color);
}
.btn-back, .btn-toc {
  background: transparent; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 0; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  min-width: 38px; min-height: 38px;
  -webkit-app-region: no-drag;
}
.btn-back:hover, .btn-toc:hover {
  background: var(--bg-hover); color: var(--text-primary);
}
.header-progress {
  font-size: 13px; color: var(--text-muted); font-weight: 500;
  min-width: 60px; text-align: center; flex-shrink: 0;
}
.reader-title {
  flex: 1; text-align: center; font-size: 14px; font-weight: 500;
  color: var(--text-secondary); margin: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.reader-body {
  flex: 1; overflow: hidden; position: relative;
  padding-top: 48px;
  transition: padding-top 0.3s ease;
}
.reader-body.no-header { padding-top: 0; }
.epub-iframe {
  width: 100%; height: 100%; border: none; background: transparent;
  display: block;
}
.reader-loading {
  position: absolute; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.3);
}

.reader-footer {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center; gap: 24px;
  padding: 8px 16px; min-height: 56px;
  background: var(--bg-card); border-top: 1px solid var(--border-color);
}
.btn-nav {
  padding: 8px 20px; font-size: 14px;
  color: var(--text-secondary); background: transparent;
  border: 1px solid var(--border-color); border-radius: var(--radius-md);
  cursor: pointer; transition: color 0.18s, border-color 0.18s, background 0.18s;
}
.btn-nav:hover:not(:disabled) {
  color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover);
}
.btn-nav:disabled { opacity: 0.3; cursor: not-allowed; }
.nav-info { font-size: 12px; color: var(--text-muted); min-width: 140px; text-align: center; }

.toc-overlay {
  position: absolute; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.toc-panel {
  width: 480px; max-width: 90vw; max-height: 70vh;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-xl);
  display: flex; flex-direction: column; overflow: hidden;
}
.toc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border-color);
}
.toc-header h3 { font-size: 15px; font-weight: 600; margin: 0; color: var(--text-primary); }
.toc-close {
  width: 32px; height: 32px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
}
.toc-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.toc-list {
  flex: 1; overflow-y: auto; padding: 8px 0;
}
.toc-item {
  display: block; width: 100%; text-align: left;
  padding: 10px 20px; font-size: 13px;
  color: var(--text-secondary); background: transparent;
  border: none; cursor: pointer; transition: background 0.15s, color 0.15s;
  font-family: inherit;
}
.toc-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.toc-item.active { color: var(--brand); background: var(--bg-active); }

.epub-fade-enter-active, .epub-fade-leave-active { transition: opacity 0.25s ease; }
.epub-fade-enter-from, .epub-fade-leave-to { opacity: 0; }
</style>
