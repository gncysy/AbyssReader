<template>
  <div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>诊断日志</h2></header>
    <div class="diag-toolbar"><span class="diag-count">{{ diagnostics.length }} 条诊断记录</span><div style="display:flex;gap:8px"><button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="copyAll">复制全部</button><button class="btn-secondary" style="padding:4px 12px;font-size:12px" @click="clearAll">清空</button></div></div>
    <EmptyState v-if="diagnostics.length === 0" title="暂无诊断记录" description="打开漫画章节或执行书源 JS 规则后自动收集" />
    <div v-else class="diag-list">
      <div v-for="diag in pagedDiagnostics" :key="diag.id" class="diag-card" :class="{ 'diag-error': diag.type === 'error' }">
        <div class="diag-header"><span class="diag-tag">{{ diag.tag || '未知' }}</span><span class="diag-time">{{ diag.timestamp }}</span><span v-if="diag.type === 'error'" class="diag-badge diag-badge-error">错误</span><span v-else class="diag-badge diag-badge-ok">正常</span></div>
        <div class="diag-url" :title="diag.sourceUrl">{{ diag.sourceUrl || '-' }}</div>
        <div class="diag-fields">
          <div class="diag-field"><span class="diag-field-label">CryptoJS</span><code class="diag-field-value">{{ diag.hasCrypto ? '已加载' : '未加载' }}</code></div>
          <div class="diag-field"><span class="diag-field-label">HTML长度</span><code class="diag-field-value">{{ diag.resultLen ?? '-' }}</code></div>
          <div class="diag-field"><span class="diag-field-label">输出长度</span><code class="diag-field-value">{{ diag.outputLen ?? '-' }}</code></div>
          <div class="diag-field"><span class="diag-field-label">解密缓存</span><code class="diag-field-value">{{ diag.cachedLen !== undefined ? (diag.cachedLen === -1 ? '无' : diag.cachedLen + ' 字节') : '-' }}</code></div>
          <div class="diag-field"><span class="diag-field-label">结果预览</span><code class="diag-field-value diag-preview">{{ diag.preview || '(空)' }}</code></div>
          <div v-if="diag.d0" class="diag-field"><span class="diag-field-label">解密前300</span><code class="diag-field-value diag-preview">{{ diag.d0 }}</code></div>
          <div v-if="diag.d1" class="diag-field"><span class="diag-field-label">解密前1000</span><code class="diag-field-value diag-preview">{{ diag.d1 }}</code></div>
          <div v-if="diag.errorInfo" class="diag-field"><span class="diag-field-label">错误</span><code class="diag-field-value" style="color:#e74c3c">{{ diag.errorInfo }}</code></div>
        </div>
      </div>
    </div>
    <Pagination v-if="totalPages > 1" :current-page="currentPage" :total-pages="totalPages" @go-page="currentPage = $event" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import BackButton from '@/components/common/BackButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Pagination from '@/components/common/Pagination.vue'
import { onLog, logHistory, type LogEntry } from '@engine/log/index.js'
import type { DiagEntry } from '@/types/diagnostic.js'

const PAGE_SIZE = 20
const MAX_DIAGS = 50

const msg = useMessage()
const diagnostics = ref<DiagEntry[]>([])
const currentPage = ref(0)
let unsubscribe: (() => void) | null = null

const totalPages = computed(() => Math.ceil(Math.max(1, diagnostics.value.length) / PAGE_SIZE))
const pagedDiagnostics = computed(() => {
  const start = currentPage.value * PAGE_SIZE
  return diagnostics.value.slice(start, start + PAGE_SIZE)
})

function parseDIAG(entry: LogEntry): DiagEntry | null {
  const msg = entry.message || ''
  const prefix = 'DIAG|'
  if (!msg.startsWith(prefix)) return null
  const rest = msg.substring(prefix.length)
  const pipe2 = rest.indexOf('|')
  if (pipe2 === -1) return null
  const type = rest.substring(0, pipe2)
  const jsonStr = rest.substring(pipe2 + 1)
  try {
    const d = JSON.parse(jsonStr)
    return {
      id: entry.time + '_' + Math.random().toString(36).slice(2, 8),
      type,
      timestamp: entry.time,
      tag: d.t || '未知',
      sourceUrl: d.u || '',
      hasCrypto: !!d.c,
      resultLen: d.r ?? -1,
      outputLen: d.o ?? -1,
      cachedLen: d.a ?? -1,
      preview: d.p || '',
      d0: d.d0 || undefined,
      d1: d.d1 || undefined,
      errorInfo: d.e || d.m || undefined,
    }
  } catch {
    return null
  }
}

onMounted(() => {
  for (const entry of logHistory) {
    const diag = parseDIAG(entry)
    if (diag) diagnostics.value.unshift(diag)
  }
  unsubscribe = onLog((entry: LogEntry) => {
    const diag = parseDIAG(entry)
    if (diag) {
      diagnostics.value.unshift(diag)
      if (diagnostics.value.length > MAX_DIAGS) diagnostics.value.pop()
    }
  })
})

onUnmounted(() => { if (unsubscribe) unsubscribe() })

function clearAll(): void { diagnostics.value = [] }
function copyAll(): void {
  navigator.clipboard.writeText(JSON.stringify(diagnostics.value, null, 2))
  msg.success('已复制')
}
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 800px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.diag-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.diag-count { font-size: 13px; color: var(--text-muted); }
.diag-list { display: flex; flex-direction: column; gap: 12px; }
.diag-card { padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.diag-card.diag-error { border-color: rgba(231,76,60,0.3); background: rgba(231,76,60,0.04); }
.diag-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.diag-tag { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.diag-time { font-size: 11px; color: var(--text-muted); }
.diag-badge { font-size: 10px; padding: 2px 8px; border-radius: 9999px; font-weight: 500; }
.diag-badge-error { background: rgba(231,76,60,0.12); color: #e74c3c; }
.diag-badge-ok { background: rgba(76,175,80,0.12); color: #4caf50; }
.diag-url { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.diag-fields { display: flex; flex-direction: column; gap: 4px; }
.diag-field { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; }
.diag-field-label { color: var(--brand); min-width: 80px; flex-shrink: 0; font-weight: 500; }
.diag-field-value { color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); font-size: 11px; padding: 2px 6px; background: var(--bg); border-radius: 3px; flex: 1; max-height: 48px; overflow-y: auto; }
.diag-preview { max-height: 200px; }
</style>
