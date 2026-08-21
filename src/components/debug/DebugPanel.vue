<template>
  <Teleport to="body"><n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <div v-if="visible" class="debug-fullscreen">
      <div class="debug-header">
        <div class="header-left">
          <svg class="header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span class="header-title">书源调试助手</span>
          <span v-if="selectedIndex >= 0" class="header-source-badge">{{ sourceOptions.find(o => o.value === selectedIndex)?.label || '' }}</span>
        </div>
        <div class="header-actions">
          <button class="header-btn" @click="openEditor" :disabled="selectedIndex < 0" title="编辑书源">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="header-btn header-btn-close" @click="closePanel" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <template v-if="editMode">
        <div class="debug-editor-header">
          <button class="btn-back-inline" @click="editMode = false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            返回
          </button>
          <span class="editor-title">编辑书源规则</span>
          <div class="editor-actions">
            <span v-if="saving" class="saving-text">保存中...</span>
            <button class="btn-primary" :disabled="saving" @click="saveEdit">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
        <div class="debug-editor-body"><textarea ref="editorRef" v-model="editJson" class="debug-editor-textarea" spellcheck="false"></textarea></div>
        <div v-if="editError" class="debug-editor-error">{{ editError }}</div>
      </template>

      <template v-else>
        <div class="debug-body">
          <div class="debug-toolbar">
            <CustomDropdown v-model="selectedIndex" :options="sourceOptions" placeholder="选择书源..." @update:modelValue="(v: string | number) => onSourceChange(Number(v))" style="min-width:180px" />
            <div class="debug-tabs">
              <button v-for="tab in tabs" :key="tab.key" class="debug-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
            </div>
          </div>

          <template v-if="activeTab === 'flow'">
            <div class="flow-input-row">
              <input v-model="flowKeyword" type="text" placeholder="输入关键词..." class="debug-input" @keyup.enter="runFlow" />
              <button class="btn-primary" :disabled="flowRunning" @click="runFlow">{{ flowRunning ? '执行中...' : '搜索' }}</button>
            </div>
            <div class="flow-log-container" ref="flowLogListRef">
              <div v-for="(entry, idx) in flowEntries" :key="idx" class="flow-entry">
                <div v-if="entry.type === 'text'" class="flow-log-text" :class="'log-' + (entry.level || 'info')">
                  <span class="log-time">{{ entry.time }}</span>
                  <span class="log-module">{{ entry.module }}</span>
                  <span class="log-message">{{ entry.message }}</span>
                </div>
                <div v-else-if="entry.type === 'card'" class="flow-card">
                  <div class="flow-card-header">
                    <span class="flow-card-step">{{ entry.step }}</span>
                    <span class="flow-card-title">{{ entry.title }}</span>
                  </div>
                  <div class="flow-card-body" v-html="entry.content"></div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'js'">
            <div class="debug-content">
              <textarea v-model="jsCode" class="debug-textarea" placeholder="输入 JS 代码..." spellcheck="false"></textarea>
              <div class="input-row">
                <button class="btn-primary" :disabled="jsRunning" @click="runJs">{{ jsRunning ? '执行中...' : '执行 JS' }}</button>
                <button class="btn-secondary" @click="resetJsContext">重置上下文</button>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'webview'">
            <div class="debug-content">
              <div class="input-row"><input v-model="webviewUrl" type="text" placeholder="输入 URL..." class="debug-input" /></div>
              <textarea v-model="webviewJs" class="debug-textarea" placeholder="自定义 JS（可选）" spellcheck="false"></textarea>
              <div class="input-row">
                <label class="timeout-label"><span>超时(秒):</span><input v-model.number="webviewTimeout" type="number" min="5" max="120" class="timeout-input" /></label>
                <button class="btn-primary" :disabled="webviewRunning" @click="runWebView">{{ webviewRunning ? '加载中...' : 'WebView 加载' }}</button>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'network'">
            <div class="debug-content">
              <div class="input-row">
                <input v-model="netUrl" type="text" placeholder="输入 URL..." class="debug-input" @keyup.enter="runNet" />
                <button class="btn-primary" :disabled="netRunning" @click="runNet">{{ netRunning ? '请求中...' : '发送请求' }}</button>
              </div>
            </div>
          </template>

          <div v-if="activeTab !== 'flow'" class="debug-log">
            <div class="log-header">
              <span>日志 ({{ filteredLogs.length }})</span>
              <div class="log-controls">
                <select v-model="logFilterModule" class="log-select">
                  <option value="all">全部模块</option>
                  <option value="explore">发现页</option><option value="search">搜索</option><option value="bookshelf">书架</option><option value="reader">阅读器</option><option value="source">书源管理</option><option value="network">网络</option><option value="engine">引擎</option><option value="system">系统</option><option value="ui">UI</option><option value="storage">存储</option><option value="login">登录</option><option value="sync">同步</option><option value="sandbox">沙箱</option>
                </select>
                <select v-model="logFilterSource" class="log-select">
                  <option value="all">全部来源</option><option value="rust">Rust</option><option value="deno">Deno</option><option value="frontend">前端</option>
                </select>
                <button class="btn-secondary" @click="clearLogs">清空</button>
              </div>
            </div>
            <div class="log-list" ref="generalLogListRef">
              <div v-for="(log, idx) in filteredLogs" :key="idx" class="log-entry" :class="'log-' + log.level"><span class="log-time">{{ log.time }}</span><span class="log-module">{{ log.module }}</span><span class="log-source">{{ log.source }}</span><span class="log-message">{{ log.message }}</span></div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </n-config-provider></Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useMessage, NConfigProvider } from 'naive-ui'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import { debug } from '@/services/debug.js'
import { onLog, logHistory, type LogEntry } from '@engine/log/index.js'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import type { BookSource } from '@/types'

const props = defineProps<{ visible: boolean; sources: BookSource[]; sourceIndex?: number }>()
const emit = defineEmits<{ 'update:visible': [v: boolean]; 'select-source': [v: number]; 'sources-updated': [] }>()

const msg = useMessage()
const { naiveTheme, themeOverrides } = useNaiveTheme()
const flowLogListRef = ref<HTMLElement | null>(null)
const generalLogListRef = ref<HTMLElement | null>(null)
const editMode = ref(false)
const saving = ref(false)

const MAX_LOGS = 1000
const MAX_FLOW_ENTRIES = 200

const activeTab = ref('flow')
const selectedIndex = ref(-1)
const tabs = [
  { key: 'flow', label: '流程' },
  { key: 'js', label: 'JS' },
  { key: 'webview', label: 'WebView' },
  { key: 'network', label: '网络' },
]

interface FlowEntry {
  type: 'text' | 'card'
  level?: string
  time?: string
  module?: string
  message?: string
  step?: string
  title?: string
  content?: string
}

const flowKeyword = ref('')
const flowRunning = ref(false)
const flowEntries = ref<FlowEntry[]>([])

function addFlowText(level: string, message: string): void {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  flowEntries.value.push({ type: 'text', level, time, module: 'flow', message })
  if (flowEntries.value.length > MAX_FLOW_ENTRIES) {
    flowEntries.value.splice(0, flowEntries.value.length - MAX_FLOW_ENTRIES)
  }
  nextTick(() => { if (flowLogListRef.value) flowLogListRef.value.scrollTop = flowLogListRef.value.scrollHeight })
}

function addFlowCard(step: string, title: string, htmlContent: string): void {
  flowEntries.value.push({ type: 'card', step, title, content: htmlContent })
  if (flowEntries.value.length > MAX_FLOW_ENTRIES) {
    flowEntries.value.splice(0, flowEntries.value.length - MAX_FLOW_ENTRIES)
  }
  nextTick(() => { if (flowLogListRef.value) flowLogListRef.value.scrollTop = flowLogListRef.value.scrollHeight })
}

function escapeHtml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const jsCode = ref('')
const jsRunning = ref(false)
const jsContextResult = ref('')

const webviewUrl = ref('')
const webviewJs = ref('')
const webviewTimeout = ref(30)
const webviewRunning = ref(false)

const netUrl = ref('')
const netRunning = ref(false)

const editJson = ref('')
const editError = ref('')

const allLogs = ref<LogEntry[]>([])
const logFilterModule = ref<string>('all')
const logFilterSource = ref<string>('all')

const filteredLogs = computed(() => {
  let result = allLogs.value
  if (logFilterModule.value !== 'all') result = result.filter((log) => log.module === logFilterModule.value)
  if (logFilterSource.value !== 'all') result = result.filter((log) => log.source === logFilterSource.value)
  return result
})

const sourceOptions = computed(() => {
  const opts: { label: string; value: number }[] = [{ label: '选择书源...', value: -1 }]
  const arr = Array.isArray(props.sources) ? props.sources : []
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i]
    if (s) {
      opts.push({ label: s.bookSourceName || '未命名', value: i })
    }
  }
  return opts
})

function clearLogs(): void { allLogs.value = []; logHistory.length = 0; flowEntries.value = [] }
function onSourceChange(val: number): void { selectedIndex.value = val; emit('select-source', val) }
function closePanel(): void { emit('update:visible', false) }

function openEditor(): void {
  if (selectedIndex.value < 0) { msg.warning('请先选择书源'); return }
  const arr = Array.isArray(props.sources) ? props.sources : []
  const source = arr[selectedIndex.value]
  if (source) {
    editJson.value = JSON.stringify(source, null, 2)
    editError.value = ''
    editMode.value = true
  }
}

async function saveEdit(): Promise<void> {
  try { JSON.parse(editJson.value); editError.value = '' } catch (err: unknown) { const e = err as Error; editError.value = 'JSON 格式错误: ' + e.message; return }
  saving.value = true
  try {
    const sources = await debug.getBookSource()
    if (selectedIndex.value >= 0 && selectedIndex.value < sources.length) {
      sources[selectedIndex.value] = JSON.parse(editJson.value) as BookSource
      await debug.saveBookSource(sources)
    }
    editMode.value = false
    emit('sources-updated')
    msg.success('已保存')
  } catch (err: unknown) {
    const e = err as Error
    editError.value = '保存失败: ' + e.message
  } finally {
    saving.value = false
  }
}

async function runFlow(): Promise<void> {
  if (selectedIndex.value < 0) { msg.warning('请先选择书源'); return }
  if (!flowKeyword.value.trim()) { msg.warning('请输入关键词'); return }

  flowRunning.value = true
  flowEntries.value = []
  const source = props.sources[selectedIndex.value]
  if (!source) { flowRunning.value = false; return }
  const keyword = flowKeyword.value.trim()

  addFlowText('info', `开始搜索 keyword=${keyword}`)
  try {
    const books = await debug.search(source, keyword)
    if (!Array.isArray(books) || books.length === 0) {
      addFlowText('warn', '未找到相关书籍')
      flowRunning.value = false
      return
    }

    let resultHtml = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">共 ${books.length} 本书</div>`
    resultHtml += '<div style="display:flex;flex-direction:column;gap:2px;max-height:200px;overflow-y:auto">'
    books.forEach((book, idx) => {
      const b = book as Record<string, unknown>
      resultHtml += `<div style="display:flex;gap:8px;padding:6px 10px;border-radius:var(--radius-sm)">
        <span style="color:var(--text-muted);min-width:30px;font-size:11px;flex-shrink:0">${idx + 1}</span>
        <span style="flex:1;color:var(--text-primary);font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(b.name || '未命名'))}</span>
        <span style="color:var(--text-muted);font-size:12px;flex-shrink:0">${escapeHtml(String(b.author || ''))}</span>
      </div>`
    })
    resultHtml += '</div>'
    addFlowCard('①', `搜索结果 (${books.length})`, resultHtml)

    const firstBook = books[0] as Record<string, unknown>
    addFlowText('info', `自动选择第一本书: ${String(firstBook.name || '')}`)

    const bookUrl = typeof firstBook.bookUrl === 'string' ? firstBook.bookUrl : ''
    addFlowText('info', `获取书籍详情: ${bookUrl}`)
    const info = await debug.getBookInfo(source, bookUrl)
    if (info && typeof info === 'object') {
      const infoObj = info as Record<string, unknown>
      let infoHtml = ''
      if (typeof infoObj.coverUrl === 'string' && infoObj.coverUrl) {
        infoHtml += `<div style="margin-bottom:8px"><img src="${escapeHtml(infoObj.coverUrl)}" style="max-width:80px;max-height:100px;border-radius:var(--radius-sm);object-fit:cover" /></div>`
      }
      infoHtml += `<div style="font-size:14px;font-weight:600;color:var(--text-primary)">${escapeHtml(String(infoObj.name || '未命名'))}</div>`
      infoHtml += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">作者: ${escapeHtml(String(infoObj.author || '未知'))}</div>`
      if (infoObj.kind) infoHtml += `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">分类: ${escapeHtml(String(infoObj.kind))}</div>`
      if (infoObj.wordCount) infoHtml += `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">字数: ${escapeHtml(String(infoObj.wordCount))}</div>`
      if (infoObj.lastChapter) infoHtml += `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">最新章节: ${escapeHtml(String(infoObj.lastChapter))}</div>`
      if (typeof infoObj.intro === 'string' && infoObj.intro) infoHtml += `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.6">${escapeHtml(infoObj.intro.substring(0, 300))}</div>`
      addFlowCard('②', '书籍详情', infoHtml)
    }

    const tocUrl = typeof (info as Record<string, unknown>)?.tocUrl === 'string'
      ? (info as Record<string, unknown>).tocUrl as string
      : bookUrl
    addFlowText('info', `获取目录: ${tocUrl}`)
    const chapters = await debug.getToc(source, tocUrl)
    if (Array.isArray(chapters) && chapters.length > 0) {
      let tocHtml = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">共 ${chapters.length} 章</div>`
      tocHtml += '<div style="display:flex;flex-direction:column;gap:2px;max-height:250px;overflow-y:auto">'
      for (let i = 0; i < Math.min(chapters.length, 30); i++) {
        const ch = chapters[i] as Record<string, unknown>
        tocHtml += `<div style="display:flex;gap:8px;padding:4px 10px;font-size:12px;color:var(--text-secondary)">
          <span style="color:var(--text-muted);min-width:30px;font-size:11px;flex-shrink:0">${i + 1}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(ch.title || '无标题'))}</span>
        </div>`
      }
      if (chapters.length > 30) tocHtml += `<div style="text-align:center;padding:6px;font-size:11px;color:var(--text-muted)">... 仅显示前 30 章，共 ${chapters.length} 章</div>`
      tocHtml += '</div>'
      addFlowCard('③', `目录 (${chapters.length}章)`, tocHtml)
    }

    if (Array.isArray(chapters) && chapters.length > 0) {
      const firstChapter = chapters[0] as Record<string, unknown>
      const chapterUrl = typeof firstChapter.url === 'string' ? firstChapter.url : ''
      if (chapterUrl) {
        addFlowText('info', `获取第一章: ${String(firstChapter.title || '')}`)
        const content = await debug.getContent(source, chapterUrl)
        if (content) {
          addFlowCard('④', `正文 — ${String(firstChapter.title || '')}`, `<div style="font-size:13px;line-height:1.8;color:var(--text-primary);white-space:pre-wrap;max-height:400px;overflow-y:auto">${escapeHtml(content.substring(0, 2000))}</div>`)
        }
      }
    }

    addFlowText('success', '流程执行完成')
  } catch (err: unknown) {
    const e = err as Error
    addFlowText('error', '流程执行失败: ' + (e?.message || String(err)))
  } finally {
    flowRunning.value = false
  }
}

// 修复：使用 push + 手动截断，避免每次展开数组
function pushLog(entry: LogEntry): void {
  allLogs.value.push(entry)
  if (allLogs.value.length > MAX_LOGS) {
    allLogs.value.splice(0, allLogs.value.length - MAX_LOGS)
  }
}

async function runJs(): Promise<void> {
  if (!jsCode.value.trim()) { msg.warning('请输入代码'); return }
  jsRunning.value = true
  try {
    const code = jsCode.value.trim()
    const prevResult = jsContextResult.value || ''
    const source = selectedIndex.value >= 0 ? props.sources[selectedIndex.value] : undefined
    const result = await debug.executeJs(code, {
      result: prevResult,
      src: prevResult,
      source: source || {},
      baseUrl: source?.bookSourceUrl || '',
      book: { kind: '123' },
      key: '',
      page: 1,
    })
    const output = result && result.length > 0 ? result : '返回空/undefined'
    jsContextResult.value = result || ''
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'info', module: 'js', source: 'frontend', message: output })
  } catch (err: unknown) {
    const e = err as Error
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'error', module: 'js', source: 'frontend', message: '错误: ' + (e?.message || String(err)) })
  } finally {
    jsRunning.value = false
  }
}

function resetJsContext(): void {
  jsContextResult.value = ''
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  pushLog({ time, level: 'info', module: 'js', source: 'frontend', message: '上下文已重置' })
}

async function runWebView(): Promise<void> {
  if (!webviewUrl.value.trim()) { msg.warning('请输入URL'); return }
  webviewRunning.value = true
  const startTime = Date.now()
  try {
    const html = await debug.fetchWebView(webviewUrl.value.trim(), {
      webJs: webviewJs.value.trim() || undefined,
      timeout: (webviewTimeout.value || 30) * 1000,
    })
    const duration = Date.now() - startTime
    const output = typeof html === 'string' ? html : JSON.stringify(html)
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'info', module: 'webview', source: 'frontend', message: `${duration}ms · ${output.length} 字符` })
  } catch (err: unknown) {
    const e = err as Error
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'error', module: 'webview', source: 'frontend', message: '错误: ' + (e?.message || String(err)) })
  } finally {
    webviewRunning.value = false
  }
}

async function runNet(): Promise<void> {
  if (!netUrl.value.trim()) { msg.warning('请输入URL'); return }
  netRunning.value = true
  const startTime = Date.now()
  try {
    const source = selectedIndex.value >= 0 ? props.sources[selectedIndex.value] : undefined
    const response = await debug.httpRequest(netUrl.value, source)
    const duration = Date.now() - startTime
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'info', module: 'network', source: 'frontend', message: `状态: ${response.status} · ${duration}ms` })
    pushLog({ time, level: 'info', module: 'network', source: 'frontend', message: response.data })
  } catch (err: unknown) {
    const e = err as Error
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    pushLog({ time, level: 'error', module: 'network', source: 'frontend', message: '错误: ' + (e?.message || String(err)) })
  } finally {
    netRunning.value = false
  }
}

const logHandler = (entry: LogEntry) => {
  pushLog(entry)
  if (activeTab.value === 'flow') {
    flowEntries.value.push({ type: 'text', level: entry.level, time: entry.time, module: entry.module, message: entry.message })
    if (flowEntries.value.length > MAX_FLOW_ENTRIES) {
      flowEntries.value.splice(0, flowEntries.value.length - MAX_FLOW_ENTRIES)
    }
  }
}
let unsubscribe: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  unsubscribe = onLog(logHandler)
  const history = logHistory.slice(-MAX_LOGS)
  allLogs.value = [...history]
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
})
watch(() => props.sourceIndex, (val) => { if (val !== undefined && val >= 0) selectedIndex.value = val }, { immediate: true })

function handleKeydown(e: KeyboardEvent): void {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
  if (e.key === 'Escape' && props.visible) closePanel()
}
</script>

<style scoped>
.debug-fullscreen { position: fixed; inset: 0; z-index: 9999; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.debug-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.header-left { display: flex; align-items: center; gap: 10px; }
.header-icon { color: var(--brand); flex-shrink: 0; }
.header-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.header-source-badge { font-size: 11px; padding: 2px 10px; border-radius: 9999px; background: var(--bg-active); color: var(--brand); font-weight: 500; }
.header-actions { display: flex; gap: 6px; }
.header-btn { width: 34px; height: 34px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: background 0.18s, color 0.18s; }
.header-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.header-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.header-btn-close:hover { background: #e74c3c; color: #fff; }
.debug-editor-header { display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: var(--bg-card); }
.btn-back-inline { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-sm); }
.btn-back-inline:hover { color: var(--text-primary); background: var(--bg-hover); }
.editor-title { font-size: 13px; color: var(--text-secondary); font-weight: 500; flex: 1; }
.editor-actions { display: flex; gap: 8px; align-items: center; }
.saving-text { font-size: 12px; color: var(--brand); }
.debug-editor-body { flex: 1; overflow: hidden; }
.debug-editor-textarea { width: 100%; height: 100%; background: var(--bg); color: var(--text-primary); border: none; outline: none; resize: none; padding: 16px 20px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; box-sizing: border-box; }
.debug-editor-error { padding: 8px 20px; font-size: 12px; color: #e74c3c; background: rgba(231,76,60,0.08); border-top: 1px solid rgba(231,76,60,0.2); flex-shrink: 0; }
.debug-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px 20px; gap: 12px; }
.debug-toolbar { display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
.debug-tabs { display: flex; gap: 2px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 3px; }
.debug-tab { padding: 6px 18px; font-size: 12px; color: var(--text-muted); background: transparent; border: none; border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, background 0.2s; }
.debug-tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.debug-tab.active { color: var(--brand); background: var(--bg-active); }
.debug-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.input-row { display: flex; gap: 10px; align-items: center; }
.debug-input { flex: 1; padding: 9px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.debug-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.debug-textarea { flex: 1; min-height: 180px; padding: 10px 14px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; font-family: var(--font-mono); line-height: 1.5; resize: vertical; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.debug-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.timeout-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.timeout-input { width: 56px; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-primary); font-size: 12px; outline: none; }
.timeout-input:focus { border-color: var(--brand); }
.flow-input-row { display: flex; gap: 10px; flex-shrink: 0; }
.flow-log-container { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
.flow-entry { flex-shrink: 0; }
.flow-log-text { display: flex; gap: 8px; padding: 4px 8px; font-size: 12px; border-radius: var(--radius-sm); transition: background 0.15s; }
.flow-log-text:hover { background: var(--bg-hover); }
.flow-card { background: var(--bg-card); border: 1px solid var(--border-color); border-left: 3px solid var(--brand); border-radius: var(--radius-md); padding: 14px 16px; margin: 6px 0; }
.flow-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.flow-card-step { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 10px; border-radius: var(--radius-sm); background: var(--bg-active); color: var(--brand); font-size: 12px; font-weight: 600; flex-shrink: 0; }
.flow-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.flow-card-body { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.debug-log { flex-shrink: 0; height: 280px; border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; flex-direction: column; }
.log-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; flex-shrink: 0; }
.log-controls { display: flex; gap: 6px; align-items: center; }
.log-select { font-size: 11px; padding: 3px 8px; background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; cursor: pointer; }
.log-select:focus { border-color: var(--brand); }
.log-list { flex: 1; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; }
.log-entry { display: flex; gap: 6px; padding: 3px 6px; flex-shrink: 0; border-radius: var(--radius-sm); transition: background 0.12s; }
.log-entry:hover { background: var(--bg-hover); }
.log-time { color: var(--text-muted); min-width: 70px; font-size: 10px; flex-shrink: 0; font-family: var(--font-mono); }
.log-module { color: var(--brand); min-width: 50px; font-size: 9px; flex-shrink: 0; text-align: center; font-weight: 600; }
.log-source { color: var(--text-muted); min-width: 32px; font-size: 9px; flex-shrink: 0; text-align: center; }
.log-message { word-break: break-all; }
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-warn .log-message { color: #d4a017; }
.log-info .log-message { color: var(--text-secondary); }
</style>
