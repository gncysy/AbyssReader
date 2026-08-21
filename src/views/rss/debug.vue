<template>
  <div class="rss-debug-page">
    <header class="subpage-header"><BackButton /><h2>订阅源调试</h2><span v-if="source" class="source-name-badge">{{ source.sourceName }}</span><div style="flex:1"></div><button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="showHtmlModal = true">查看 HTML</button><button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="clearLogs">清空日志</button></header>
    <div class="debug-toolbar">
      <div class="toolbar-left">
        <CustomDropdown v-model="selectedSortIndex" :options="sortOptions" placeholder="选择分类..." style="min-width:150px" @update:modelValue="onSortChange" />
        <input v-model="searchInput" type="text" placeholder="输入关键词或 URL..." class="input-search" style="width:280px" @keyup.enter="runDebug" />
        <button class="btn-primary" :disabled="running" @click="runDebug">{{ running ? '执行中...' : '调试' }}</button>
      </div>
    </div>
    <div v-if="status" class="status-bar" :class="status.type">{{ status.message }}</div>
    <div class="log-container">
      <div class="log-header"><span>日志 ({{ filteredLogs.length }})</span><span style="font-size:11px;color:var(--text-muted)">{{ running ? '● 运行中' : '○ 就绪' }}</span></div>
      <div class="log-list" ref="logListRef">
        <div v-for="(log, idx) in filteredLogs" :key="idx" class="log-entry" :class="'log-' + log.level"><span class="log-time">{{ log.time }}</span><span class="log-module">{{ log.module }}</span><span class="log-message">{{ log.message }}</span></div>
        <div v-if="filteredLogs.length === 0" class="log-empty">暂无日志，点击"调试"开始</div>
      </div>
    </div>
    <n-modal v-model:show="showHtmlModal" preset="card" title="HTML 源码" style="max-width:90vw;max-height:85vh" :bordered="false">
      <div class="html-viewer"><div class="html-toolbar"><span style="font-size:12px;color:var(--text-muted)">{{ htmlContent.length }} 字符</span><button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="copyHtml">复制</button></div><textarea v-model="htmlContent" class="html-textarea" readonly spellcheck="false"></textarea></div>
    </n-modal>
    <n-modal v-model:show="showResultModal" preset="card" title="解析结果" style="max-width:80vw;max-height:80vh" :bordered="false">
      <div class="result-viewer"><div class="result-toolbar"><span style="font-size:12px;color:var(--text-muted)">{{ resultItems.length }} 条</span><button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="copyResult">复制</button></div>
        <div class="result-list"><div v-for="(item, idx) in resultItems.slice(0, 100)" :key="idx" class="result-item"><span class="result-index">{{ idx + 1 }}</span><span class="result-title">{{ item.title || '无标题' }}</span><span v-if="item.link" class="result-link">{{ item.link }}</span></div><div v-if="resultItems.length > 100" style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px">仅显示前 100 条，共 {{ resultItems.length }} 条</div></div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage, NModal } from 'naive-ui'
import { store, network } from '@/services'
import { createAnalyzer } from '@engine/parser/index.js'
import { asArray } from '@/services/store.js'
import BackButton from '@/components/common/BackButton.vue'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import { onLog, logHistory, type LogEntry } from '@engine/log/index.js'
import type { RssSource, RssArticle } from '@/types'
import type { EngineBookSource } from '@engine/types.js'

const MAX_LOGS = 500

function toEngineBookSource(source: RssSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

const route = useRoute()
const msg = useMessage()
const source = ref<RssSource | null>(null)
const searchInput = ref('')
const selectedSortIndex = ref(-1)
const running = ref(false)
const status = ref<{ type: string; message: string } | null>(null)
const showHtmlModal = ref(false)
const htmlContent = ref('')
const showResultModal = ref(false)
const resultItems = ref<RssArticle[]>([])
const logListRef = ref<HTMLElement | null>(null)
const logs = ref<LogEntry[]>([])
let unsubscribe: (() => void) | null = null

const filteredLogs = computed(() => {
  return logs.value.filter((l) => l.level !== 'debug')
})

const sortOptions = computed(() => {
  if (!source.value?.sortUrl) return [{ label: '无分类', value: -1 }]
  const lines = source.value.sortUrl.split('\n').filter((l) => l.includes('::'))
  const opts: { label: string; value: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const idx = line.indexOf('::')
    opts.push({ label: line.substring(0, idx), value: i })
  }
  if (opts.length === 0) opts.push({ label: '无分类', value: -1 })
  return opts
})

function pushLog(entry: LogEntry): void {
  logs.value = [...logs.value, entry]
  if (logs.value.length > MAX_LOGS) {
    logs.value.splice(0, logs.value.length - MAX_LOGS)
  }
  nextTick(() => { if (logListRef.value) logListRef.value.scrollTop = logListRef.value.scrollHeight })
}

function clearLogs(): void { logs.value = [] }

function addLog(level: string, message: string): void {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  pushLog({ time, level: level as LogEntry['level'], module: 'engine', message, source: 'frontend' })
}

const logHandler = (entry: LogEntry) => { pushLog(entry) }

async function loadSource(): Promise<void> {
  const sourceUrl = route.query.sourceUrl as string
  if (!sourceUrl) { msg.warning('未指定订阅源'); return }
  try {
    const data = await store.get('rssSources')
    const sources = asArray<RssSource>(data)
    source.value = sources.find((s) => s.sourceUrl === sourceUrl) || null
    if (!source.value) {
      msg.error('未找到订阅源')
    } else {
      addLog('info', `加载订阅源: ${source.value.sourceName}`)
      const validSorts = sortOptions.value.filter((o) => o.value !== -1)
      const firstSort = validSorts[0]
      if (firstSort !== undefined) selectedSortIndex.value = firstSort.value
    }
  } catch (err: unknown) {
    const e = err as Error
    msg.error('加载失败: ' + e.message)
  }
}

function onSortChange(): void { status.value = null; resultItems.value = [] }

async function runDebug(): Promise<void> {
  if (!source.value) { msg.warning('请先加载订阅源'); return }
  const keyword = searchInput.value.trim()
  if (!keyword) { msg.warning('请输入关键词或 URL'); return }

  running.value = true
  status.value = { type: 'info', message: '正在获取页面...' }
  addLog('info', `开始调试: ${keyword}`)

  try {
    let targetUrl = keyword
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (selectedSortIndex.value >= 0 && source.value.sortUrl) {
        const lines = source.value.sortUrl.split('\n').filter((l) => l.includes('::'))
        const line = lines[selectedSortIndex.value]
        if (line) {
          const idx = line.indexOf('::')
          targetUrl = line.substring(idx + 2).replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
        }
      }
    }

    addLog('debug', `请求 URL: ${targetUrl}`)
    const html = await network.fetch(targetUrl, { method: 'GET' })
    const htmlStr = typeof html === 'string' ? html : JSON.stringify(html)
    htmlContent.value = htmlStr
    addLog('debug', `获取到 ${htmlStr.length} 字符`)

    const analyzer = createAnalyzer(toEngineBookSource(source.value))
    analyzer.setContent(htmlStr, targetUrl)

    let listRule = source.value.ruleArticles || ''
    if (listRule.startsWith('-')) listRule = listRule.substring(1)
    if (listRule.startsWith('+')) listRule = listRule.substring(1)

    if (!listRule) {
      status.value = { type: 'warning', message: '未配置列表规则' }
      running.value = false
      return
    }

    const elements = await analyzer.getElements(listRule)
    if (!Array.isArray(elements) || elements.length === 0) {
      status.value = { type: 'warning', message: '未找到匹配元素，请检查规则' }
      running.value = false
      return
    }

    const titleRule = source.value.ruleTitle || ''
    const linkRule = source.value.ruleLink || ''

    const results: RssArticle[] = []
    for (const item of elements) {
      if (item === null || item === undefined) continue
      const itemAnalyzer = createAnalyzer(toEngineBookSource(source.value))
      itemAnalyzer.setContent(item, targetUrl)
      const title = (await itemAnalyzer.getString(titleRule)) || ''
      if (!title) continue
      const link = (await itemAnalyzer.getString(linkRule, { isUrl: true } as Record<string, unknown>)) || ''
      results.push({ title: String(title), link, sort: '', origin: source.value!.sourceUrl })
    }

    resultItems.value = results
    addLog('info', `解析完成，共 ${results.length} 条`)
    if (results.length > 0) {
      status.value = { type: 'success', message: `解析成功，共 ${results.length} 条` }
      showResultModal.value = true
    } else {
      status.value = { type: 'warning', message: '解析结果为空，请检查规则' }
    }
  } catch (err: unknown) {
    const e = err as Error
    status.value = { type: 'error', message: '执行失败: ' + e.message }
  } finally {
    running.value = false
  }
}

function copyHtml(): void { navigator.clipboard.writeText(htmlContent.value); msg.success('已复制') }
function copyResult(): void { navigator.clipboard.writeText(JSON.stringify(resultItems.value, null, 2)); msg.success('已复制') }

onMounted(() => {
  loadSource()
  unsubscribe = onLog(logHandler)
  for (const entry of logHistory.slice(-MAX_LOGS)) pushLog(entry)
})
onUnmounted(() => { if (unsubscribe) { unsubscribe(); unsubscribe = null } })
</script>

<style scoped>
.rss-debug-page { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }
.subpage-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-shrink: 0; }
.subpage-header h2 { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; }
.source-name-badge { font-size: 12px; padding: 3px 12px; border-radius: 9999px; background: var(--bg-active); color: var(--brand); font-weight: 500; }
.debug-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; flex-shrink: 0; }
.toolbar-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.status-bar { padding: 8px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 12px; flex-shrink: 0; }
.status-bar.info { background: rgba(52,152,219,0.08); border: 1px solid rgba(52,152,219,0.2); color: #3498db; }
.status-bar.success { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.2); color: #4caf50; }
.status-bar.warning { background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.2); color: #f39c12; }
.status-bar.error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }
.log-container { flex: 1; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; min-height: 0; }
.log-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }
.log-list { flex: 1; overflow-y: auto; padding: 4px 0; font-size: 12px; font-family: var(--font-mono); background: var(--bg); }
.log-entry { display: flex; gap: 8px; padding: 2px 14px; border-bottom: 1px solid rgba(128,128,128,0.04); }
.log-entry:hover { background: var(--bg-hover); }
.log-time { color: var(--text-muted); min-width: 70px; flex-shrink: 0; font-size: 11px; }
.log-module { color: var(--brand); min-width: 70px; flex-shrink: 0; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.log-message { word-break: break-all; }
.log-info .log-message { color: var(--text-secondary); }
.log-debug .log-message { color: var(--text-muted); font-size: 11px; }
.log-warn .log-message { color: #f39c12; }
.log-error .log-message { color: #e74c3c; }
.log-success .log-message { color: #4caf50; }
.log-empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }
.html-viewer { display: flex; flex-direction: column; height: 70vh; }
.html-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.html-textarea { flex: 1; width: 100%; padding: 12px; font-size: 12px; font-family: var(--font-mono); color: var(--text-primary); background: var(--bg); border: none; outline: none; resize: none; line-height: 1.6; }
.result-viewer { display: flex; flex-direction: column; height: 70vh; }
.result-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.result-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.result-item { display: flex; gap: 10px; padding: 6px 12px; border-bottom: 1px solid rgba(128,128,128,0.06); font-size: 13px; align-items: center; }
.result-item:hover { background: var(--bg-hover); }
.result-index { color: var(--text-muted); min-width: 30px; font-size: 11px; flex-shrink: 0; }
.result-title { flex: 1; color: var(--text-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-link { color: var(--text-muted); font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
</style>
