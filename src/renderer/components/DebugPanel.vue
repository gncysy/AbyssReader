<template>
  <Teleport to="body">
    <div v-if="visible" ref="panelRef" class="debug-panel-floating" :style="panelStyle" @mousedown="startDrag">
      <div class="debug-panel-header">
        <div class="header-left">
          <svg class="header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span class="header-title">书源调试助手</span>
        </div>
        <div class="header-actions">
          <button class="header-btn" @click="minimize = !minimize" aria-label="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="1" y1="6" x2="11" y2="6"/></svg>
          </button>
          <button class="header-btn header-btn-close" @click="closePanel" aria-label="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
          </button>
        </div>
      </div>

      <div v-show="!minimize" class="debug-panel-body">
        <div class="debug-toolbar">
          <select v-model="selectedIndex" class="debug-select" @change="onSourceChange" aria-label="选择书源">
            <option :value="-1">选择书源...</option>
            <option v-for="(source, idx) in sources" :key="idx" :value="idx">{{ source.bookSourceName || source.name }}</option>
          </select>

          <div class="debug-tabs">
            <button v-for="tab in tabs" :key="tab.key" class="debug-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
          </div>
          <button class="debug-clear-btn" @click="clearAll">清空</button>
        </div>

        <div v-if="activeTab === 'search'" class="debug-content">
          <div class="input-row">
            <input v-model="searchKeyword" type="text" placeholder="输入关键词..." class="debug-input" @keyup.enter="runSearch" />
            <button class="debug-run-btn" :disabled="running" @click="runSearch">{{ running ? '执行中...' : '搜索' }}</button>
          </div>
          <div v-if="searchResult.length > 0" class="result-area">
            <div class="result-stats"><span>找到 {{ searchResult.length }} 本书</span></div>
            <div class="book-list">
              <div v-for="(book, idx) in searchResult.slice(0, 20)" :key="idx" class="book-item">
                <span class="item-index">{{ idx + 1 }}</span>
                <span class="item-name">{{ book.name || '未命名' }}</span>
                <span class="item-author">{{ book.author || '佚名' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'toc'" class="debug-content">
          <div class="input-row">
            <input v-model="tocUrl" type="text" placeholder="输入书籍URL..." class="debug-input" @keyup.enter="runToc" />
            <button class="debug-run-btn" :disabled="running" @click="runToc">{{ running ? '执行中...' : '获取目录' }}</button>
          </div>
          <div v-if="tocResult.length > 0" class="result-area">
            <div class="result-stats"><span>共 {{ tocResult.length }} 章</span></div>
          </div>
        </div>

        <div v-if="activeTab === 'content'" class="debug-content">
          <div class="input-row">
            <input v-model="contentUrl" type="text" placeholder="输入章节URL..." class="debug-input" @keyup.enter="runContent" />
            <button class="debug-run-btn" :disabled="running" @click="runContent">{{ running ? '执行中...' : '获取正文' }}</button>
          </div>
        </div>

        <div class="debug-log">
          <div class="log-header"><span>日志</span><button class="log-clear" @click="logs = []">清空</button></div>
          <div class="log-list" ref="logListRef">
            <div v-for="(log, idx) in logs" :key="idx" class="log-entry" :class="'log-' + log.level">
              <span class="log-time">{{ log.time }}</span><span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { BookSource } from '@shared/types'

const props = defineProps<{ visible: boolean; sources: BookSource[]; sourceIndex?: number }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'select-source', v: number): void }>()

const message = useMessage()
const panelRef = ref<HTMLElement | null>(null)
const logListRef = ref<HTMLElement | null>(null)
const minimize = ref(false)
const running = ref(false)

const panelStyle = ref({ position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '780px', height: '600px', zIndex: '9999' })

const dragState = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 }

function startDrag(event: MouseEvent) {
  if (!(event.target as HTMLElement).closest('.debug-panel-header')) return
  const panel = panelRef.value; if (!panel) return
  const rect = panel.getBoundingClientRect()
  dragState.isDragging = true; dragState.startX = event.clientX; dragState.startY = event.clientY
  dragState.startLeft = rect.left; dragState.startTop = rect.top
  document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', endDrag)
}
function onDrag(event: MouseEvent) {
  if (!dragState.isDragging) return
  panelStyle.value = { ...panelStyle.value, top: (dragState.startTop + event.clientY - dragState.startY) + 'px', left: (dragState.startLeft + event.clientX - dragState.startX) + 'px', transform: 'none' }
}
function endDrag() { dragState.isDragging = false; document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', endDrag) }

const activeTab = ref('search')
const selectedIndex = ref(-1)
const tabs = [{ key: 'search', label: '搜索' }, { key: 'toc', label: '目录' }, { key: 'content', label: '正文' }]

const searchKeyword = ref(''); const tocUrl = ref(''); const contentUrl = ref('')
const searchResult = ref<any[]>([]); const tocResult = ref<any[]>([]); const contentResult = ref('')
const logs = ref<{ time: string; level: string; message: string }[]>([])

function addLog(message: string, level = 'info') {
  logs.value.unshift({ time: new Date().toLocaleTimeString(), level, message })
  if (logs.value.length > 200) logs.value = logs.value.slice(0, 200)
  nextTick(() => { if (logListRef.value) logListRef.value.scrollTop = 0 })
}
function clearAll() { searchResult.value = []; tocResult.value = []; contentResult.value = ''; logs.value = [] }
function onSourceChange() { emit('select-source', selectedIndex.value); searchResult.value = []; tocResult.value = []; contentResult.value = '' }
function closePanel() { emit('update:visible', false) }

async function runSearch() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!searchKeyword.value.trim()) { message.warning('请输入关键词'); return }
  running.value = true; searchResult.value = []
  try {
    const source = props.sources[selectedIndex.value]
    const clean = JSON.parse(JSON.stringify(source))
    const result = await window.electronAPI.engineSearch(clean, searchKeyword.value, 1)
    if (result.success) { searchResult.value = result.data || []; addLog(`搜索成功，找到 ${searchResult.value.length} 本书`, 'success') }
    else addLog(`搜索失败: ${result.error}`, 'error')
  } catch (err: any) { addLog(`搜索异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

async function runToc() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!tocUrl.value.trim()) { message.warning('请输入书籍URL'); return }
  running.value = true; tocResult.value = []
  try {
    const source = props.sources[selectedIndex.value]
    const clean = JSON.parse(JSON.stringify(source))
    const result = await window.electronAPI.engineGetToc(clean, tocUrl.value)
    if (result.success) { tocResult.value = result.data || []; addLog(`获取目录成功，${tocResult.value.length} 章`, 'success') }
    else addLog(`获取目录失败: ${result.error}`, 'error')
  } catch (err: any) { addLog(`获取目录异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

async function runContent() {
  if (selectedIndex.value < 0) { message.warning('请先选择书源'); return }
  if (!contentUrl.value.trim()) { message.warning('请输入章节URL'); return }
  running.value = true
  try {
    const source = props.sources[selectedIndex.value]
    const clean = JSON.parse(JSON.stringify(source))
    const result = await window.electronAPI.engineGetContent(clean, contentUrl.value)
    if (result.success) { contentResult.value = result.data || ''; addLog(`获取正文成功，${contentResult.value.length} 字符`, 'success') }
    else addLog(`获取正文失败: ${result.error}`, 'error')
  } catch (err: any) { addLog(`获取正文异常: ${err.message}`, 'error') }
  finally { running.value = false }
}

watch(() => props.sourceIndex, (val) => { if (val !== undefined && val >= 0) selectedIndex.value = val }, { immediate: true })

onMounted(() => document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && props.visible) closePanel() }))
onUnmounted(() => { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', endDrag) })
</script>

<style scoped>
.debug-panel-floating {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(20px);
  min-width: 420px;
  min-height: 320px;
  resize: both;
}

.debug-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
}
.debug-panel-header:active { cursor: grabbing; }

.header-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); }
.header-icon { color: var(--brand); flex-shrink: 0; }
.header-title { font-weight: var(--font-semibold); }
.header-actions { display: flex; gap: 6px; }

.header-btn {
  width: 30px; height: 30px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.18s var(--ease-out), color 0.18s var(--ease-out);
}
.header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.header-btn-close:hover { background: #e74c3c; color: #ffffff; }

.debug-panel-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 14px; gap: 10px; }
.debug-toolbar { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }

.debug-select {
  padding: 6px 12px; font-size: 12px; color: var(--text-primary);
  background: var(--bg); border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); outline: none; min-width: 150px;
  cursor: pointer; transition: border-color 0.2s var(--ease-out);
}
.debug-select:focus { border-color: var(--brand); }

.debug-tabs { display: flex; gap: 2px; background: var(--bg); border-radius: var(--radius-sm); padding: 2px; }
.debug-tab {
  padding: 5px 14px; font-size: 11px; color: var(--text-muted);
  background: transparent; border: none; border-radius: var(--radius-sm);
  cursor: pointer; font-weight: var(--font-medium);
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.debug-tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.debug-tab.active { color: var(--brand); background: var(--bg-active); }

.debug-clear-btn {
  padding: 5px 14px; font-size: 11px; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer; margin-left: auto;
  font-weight: var(--font-medium);
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.debug-clear-btn:hover { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); }

.debug-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.input-row { display: flex; gap: 8px; }

.debug-run-btn {
  padding: 7px 22px; font-size: 13px; font-weight: var(--font-medium);
  color: #0f0f0f; background: var(--brand); border: none;
  border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap;
  transition: background 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.debug-run-btn:hover:not(:disabled) { background: var(--brand-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212, 160, 23, 0.3); }
.debug-run-btn:active:not(:disabled) { transform: translateY(0); }
.debug-run-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.result-area {
  flex: 1; overflow-y: auto; background: var(--bg);
  border-radius: var(--radius-sm); border: 1px solid var(--border-color);
  padding: 12px 14px;
}
.result-stats { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-weight: var(--font-medium); }
.book-list { display: flex; flex-direction: column; gap: 2px; }
.book-item {
  display: flex; gap: 8px; padding: 5px 8px; font-size: 12px;
  color: var(--text-secondary); border-radius: var(--radius-sm);
  transition: background 0.15s var(--ease-out);
}
.book-item:hover { background: var(--bg-hover); }
.item-index { color: var(--text-muted); min-width: 28px; font-size: 11px; }
.item-name { flex: 1; color: var(--text-primary); font-weight: var(--font-medium); }
.item-author { color: var(--text-muted); }

.debug-log { flex-shrink: 0; max-height: 130px; border-top: 1px solid var(--border-color); padding-top: 8px; }
.log-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.log-clear {
  font-size: 10px; color: var(--text-muted); background: transparent;
  border: none; cursor: pointer; padding: 2px 8px; border-radius: var(--radius-sm);
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.log-clear:hover { color: var(--text-primary); background: var(--bg-hover); }
.log-list { overflow-y: auto; font-size: 11px; display: flex; flex-direction: column-reverse; max-height: 96px; }
.log-entry { display: flex; gap: 8px; padding: 2px 6px; border-radius: 2px; }
.log-time { color: var(--text-muted); min-width: 64px; font-size: 10px; font-family: var(--font-mono); }
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-info .log-message { color: var(--text-secondary); }
</style>