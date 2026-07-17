<template>
  <div class="source-manager-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书源管理</h1>
        <p class="page-subtitle">{{ filteredSources.length }} / {{ sources.length }} 个书源</p>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <input v-model="searchText" type="text" placeholder="搜索书源..." class="input-search" />
        </div>
        <button class="btn-sm-secondary" @click="triggerFileInput">上传文件</button>
        <button class="btn-sm-secondary" @click="showUrlModal = true">从 URL</button>
        <button class="btn-sm-primary" @click="showJsonModal = true">粘贴 JSON</button>
        <button class="btn-sm-secondary" :disabled="testingAll" @click="testAll">
          {{ testingAll ? `测试中 ${testProgress}/${sources.length}` : '测试全部' }}
        </button>
        <button class="btn-sm-danger" :disabled="deletingFailed" @click="deleteFailed">
          {{ deletingFailed ? '删除中...' : '删除失效' }}
        </button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <div v-if="importing" class="import-progress">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: importProgress + '%' }"></div></div>
      <span class="progress-text">{{ importProgress }}%</span>
      <span class="progress-label">{{ importLabel }}</span>
    </div>

    <div v-if="filteredSources.length > 0" class="source-list">
      <div class="list-header"><span>名称</span><span>状态</span><span>测试结果</span><span>操作</span></div>
      <div v-for="(item, idx) in filteredSources" :key="item.originalIndex" class="list-row" tabindex="0"
        @click="showSourceDetail(item.originalIndex)" @keydown.enter="showSourceDetail(item.originalIndex)">
        <span class="source-name">{{ getSourceName(item.source) }}</span>
        <span class="status-indicator"><span class="status-dot" :class="item.source.enabled ? 'enabled' : 'disabled'"></span></span>
        <span class="test-result">{{ testResults[item.originalIndex] || '—' }}</span>
        <div class="row-actions" @click.stop>
          <button class="action-btn debug-btn" @click="openDebug(item.originalIndex)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button>
          <button class="action-btn" :disabled="testingIdx === item.originalIndex" @click="testSource(item.originalIndex)">{{ testingIdx === item.originalIndex ? '...' : '测试' }}</button>
          <button class="action-btn" @click="toggleSource(item.originalIndex)">{{ item.source.enabled ? '禁用' : '启用' }}</button>
          <button class="action-btn action-btn-danger" @click="deleteSource(item.originalIndex)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <h3>{{ searchText ? '未找到匹配的书源' : '暂无书源' }}</h3>
      <p>{{ searchText ? '试试其他关键词' : '导入书源开始阅读' }}</p>
    </div>

    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="handleImportJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>
    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="handleImportFromUrl">
      <n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." />
    </n-modal>

    <n-modal v-model:show="showDetailModal" preset="dialog" title="书源详情" :style="{ width: '700px' }" :show-icon="false">
      <div v-if="detailSource" class="source-detail">
        <div class="detail-section">
          <div class="detail-row"><span class="detail-label">名称</span><span class="detail-value">{{ getSourceName(detailSource) }}</span></div>
          <div class="detail-row"><span class="detail-label">分组</span><span class="detail-value">{{ detailSource.group || '未分组' }}</span></div>
          <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value" :class="detailSource.enabled ? 'enabled-text' : 'disabled-text'">{{ detailSource.enabled ? '已启用' : '已禁用' }}</span></div>
          <div class="detail-row"><span class="detail-label">类型</span><span class="detail-value">{{ detailSource._legado ? 'JS 书源' : 'JSON 书源' }}</span></div>
        </div>
        <div v-if="detailSource.comment" class="detail-section"><div class="detail-label">说明</div><div class="detail-comment">{{ detailSource.comment }}</div></div>
        <div class="detail-section">
          <div class="detail-row"><span class="detail-label">书源 URL</span><span class="detail-value url-text">{{ detailSource.bookSourceUrl || '无' }}</span></div>
          <div class="detail-row"><span class="detail-label">搜索 URL</span><span class="detail-value url-text">{{ detailSource.searchUrl || '无' }}</span></div>
        </div>
        <div class="detail-section">
          <div class="detail-label">规则预览</div>
          <div class="rule-preview">
            <div class="rule-item"><span class="rule-key">搜索:</span><span class="rule-value">{{ detailSource.ruleSearch?.bookList || '未配置' }}</span></div>
            <div class="rule-item"><span class="rule-key">目录:</span><span class="rule-value">{{ detailSource.ruleToc?.chapterList || '未配置' }}</span></div>
            <div class="rule-item"><span class="rule-key">正文:</span><span class="rule-value">{{ detailSource.ruleContent?.content || '未配置' }}</span></div>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn-sm-primary" @click="openDebugFromDetail">调试</button>
          <button class="btn-sm-edit" @click="openEditor">编辑书源</button>
          <button class="btn-sm-secondary" @click="showDetailModal = false">关闭</button>
        </div>
      </div>
    </n-modal>

    <n-modal v-model:show="showEditorModal" preset="dialog" title="编辑书源" :style="{ width: '750px', maxWidth: '95vw' }" positive-text="保存" negative-text="取消" @positive-click="saveSourceEdit" @negative-click="showEditorModal = false">
      <div class="editor-container">
        <div class="editor-hint">修改书源规则需要了解 CSS/XPath/JSON 选择器语法。编辑前建议先备份。</div>
        <n-input v-model:value="editJson" type="textarea" :autosize="{ minRows: 20, maxRows: 35 }" class="editor-textarea" />
      </div>
    </n-modal>

    <DebugPanel v-if="showDebugPanel" :visible="showDebugPanel" :sources="sources" :source-index="debugSourceIndex" @update:visible="showDebugPanel = $event" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog, NModal, NInput } from 'naive-ui'
import { store, source as sourceApi } from '@/api'
import DebugPanel from '@/components/DebugPanel.vue'
import type { BookSource } from '@shared/types'

const message = useMessage()
const dialog = useDialog()

function getSourceName(source: BookSource | null | undefined): string {
  if (!source) return '未命名'
  return source.bookSourceName || source.name || '未命名'
}

const sources = ref<BookSource[]>([])
const searchText = ref('')
const testResults = ref<Record<number, string>>({})
const testingIdx = ref(-1)
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
const showJsonModal = ref(false)
const showUrlModal = ref(false)
const jsonInput = ref('')
const urlInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showDetailModal = ref(false)
const detailSource = ref<BookSource | null>(null)
const detailSourceIndex = ref(-1)

const showEditorModal = ref(false)
const editJson = ref('')

const showDebugPanel = ref(false)
const debugSourceIndex = ref(-1)

const importing = ref(false)
const importProgress = ref(0)
const importLabel = ref('准备导入...')

let unlistenTest: (() => void) | null = null

const filteredSources = computed(() => {
  if (!searchText.value.trim()) {
    return sources.value.map((source, i) => ({ source, originalIndex: i }))
  }
  const keyword = searchText.value.trim().toLowerCase()
  const result: { source: BookSource; originalIndex: number }[] = []
  sources.value.forEach((source, i) => {
    if (
      (source.bookSourceName || source.name || '').toLowerCase().includes(keyword) ||
      source.url?.toLowerCase().includes(keyword) ||
      (source.group || '').toLowerCase().includes(keyword) ||
      (source.comment || '').toLowerCase().includes(keyword)
    ) result.push({ source, originalIndex: i })
  })
  return result
})

function setTestResult(idx: number, value: string) { testResults.value = { ...testResults.value, [idx]: value } }
function openDebug(idx: number) { debugSourceIndex.value = idx; showDebugPanel.value = true }
function openDebugFromDetail() {
  if (detailSourceIndex.value >= 0) {
    showDetailModal.value = false
    setTimeout(() => { debugSourceIndex.value = detailSourceIndex.value; showDebugPanel.value = true }, 200)
  }
}

async function loadSources() {
  try { sources.value = await store.get('sources') || [] } catch (err: any) { message.error('加载书源失败: ' + err.message) }
}

function showSourceDetail(idx: number) {
  if (idx >= 0 && idx < sources.value.length) {
    detailSource.value = sources.value[idx]
    detailSourceIndex.value = idx
    showDetailModal.value = true
  }
}

function openEditor() {
  if (!detailSource.value) return
  editJson.value = JSON.stringify(detailSource.value, null, 2)
  showDetailModal.value = false
  showEditorModal.value = true
}

async function saveSourceEdit() {
  try {
    const parsed = JSON.parse(editJson.value)
    sources.value[detailSourceIndex.value] = parsed
    await store.set('sources', sources.value)
    showEditorModal.value = false
    detailSource.value = parsed
    showDetailModal.value = true
    message.success('已保存')
  } catch (err: any) { message.error('JSON 格式错误: ' + err.message) }
}

async function testSource(idx: number) {
  if (idx < 0 || idx >= sources.value.length) return
  testingIdx.value = idx
  try {
    const result = await sourceApi.test(idx)
    setTestResult(idx, result)
  } catch (err: any) { setTestResult(idx, '失败: ' + err.message) }
  finally { testingIdx.value = -1 }
}

async function testAll() {
  if (!sources.value.length) { message.warning('没有书源可测试'); return }
  if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null }
  testingAll.value = true; testProgress.value = 0; testResults.value = {}
  unlistenTest = window.electronAPI.on('source-test-result', (result: any) => {
    if (result.status === 'ok') setTestResult(result.index, `连接成功 / ${result.time_ms}ms / ${result.size_kb}KB`)
    else setTestResult(result.index, `失败: ${result.error || '未知错误'}`)
    testProgress.value++
  })
  try { await sourceApi.testAll(); await new Promise(r => setTimeout(r, 2000)); message.success('测试完成') }
  catch (err: any) { message.error('测试失败: ' + err.message) }
  finally { testingAll.value = false; if (unlistenTest) { try { unlistenTest() } catch {}; unlistenTest = null } }
}

async function toggleSource(idx: number) {
  try {
    const result = await sourceApi.toggleSource(idx)
    if (result.success) { sources.value[idx].enabled = result.enabled; sources.value = [...sources.value] }
  } catch (err: any) { message.error('操作失败: ' + err.message) }
}

async function deleteSource(idx: number) {
  if (idx < 0 || idx >= sources.value.length) return
  dialog.warning({
    title: '确认删除', content: `删除「${getSourceName(sources.value[idx])}」？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { const r = await sourceApi.deleteSource(idx); if (r?.success) { await loadSources(); message.success('已删除') } else message.error('删除失败') }
      catch (err: any) { message.error('删除失败: ' + err.message) }
    },
  })
}

async function deleteFailed() {
  if (!sources.value.length) { message.warning('没有书源可操作'); return }
  dialog.warning({
    title: '删除失效书源', content: `将测试所有 ${sources.value.length} 个书源，并删除连接失败的。`, positiveText: '开始检测', negativeText: '取消',
    onPositiveClick: async () => {
      deletingFailed.value = true
      try { const r = await sourceApi.deleteFailed(); await loadSources(); message.success(`已删除 ${r} 个失效书源`) }
      catch (err: any) { message.error('操作失败: ' + err.message) }
      finally { deletingFailed.value = false }
    },
  })
}

function triggerFileInput() { fileInput.value?.click() }

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  importing.value = true; importProgress.value = 10; importLabel.value = '读取文件...'
  try { const t = await file.text(); importProgress.value = 30; await sourceApi.add(t); await loadSources(); importProgress.value = 100; message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { input.value = ''; setTimeout(() => { importing.value = false; importProgress.value = 0 }, 800) }
}

async function handleImportJson() {
  if (!jsonInput.value.trim()) { message.warning('请粘贴书源 JSON'); return }
  importing.value = true
  try { await sourceApi.add(jsonInput.value); jsonInput.value = ''; showJsonModal.value = false; await loadSources(); message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { setTimeout(() => { importing.value = false }, 800) }
}

async function handleImportFromUrl() {
  if (!urlInput.value.trim()) { message.warning('请输入 URL'); return }
  importing.value = true
  try { await sourceApi.importFromUrl(urlInput.value); urlInput.value = ''; showUrlModal.value = false; await loadSources(); message.success('导入成功') }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { setTimeout(() => { importing.value = false }, 800) }
}

onMounted(() => { loadSources() })
onUnmounted(() => { if (unlistenTest) { try { unlistenTest() } catch {} } })
</script>

<style scoped>
.source-manager-page { position: relative; z-index: 1; }

.input-search {
  width: 180px;
}

.import-progress {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--bg-card); border-radius: var(--radius-md); margin-bottom: 16px;
  border: 1px solid var(--border-color);
}
.progress-text { font-size: 13px; color: var(--text-secondary); font-weight: var(--font-medium); }
.progress-label { font-size: 12px; color: var(--text-muted); }

.source-list { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.list-header {
  display: grid; grid-template-columns: 1fr 60px 1fr 180px; padding: 10px 18px;
  background: var(--bg-hover); border-bottom: 1px solid var(--border-color);
  font-size: 12px; color: var(--text-muted); font-weight: var(--font-medium);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.list-row {
  display: grid; grid-template-columns: 1fr 60px 1fr 180px; padding: 12px 18px;
  border-bottom: 1px solid var(--border-color); align-items: center;
  font-size: 14px; cursor: pointer;
  transition: background 0.18s var(--ease-out);
}
.list-row:hover { background: var(--bg-hover); }
.list-row:last-child { border-bottom: none; }
.list-row:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.source-name { color: var(--text-primary); font-weight: var(--font-medium); }

.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.enabled { background: #4caf50; box-shadow: 0 0 6px rgba(76, 175, 80, 0.4); }
.status-dot.disabled { background: rgba(128, 128, 128, 0.4); }

.test-result { color: var(--text-secondary); font-size: 13px; }

.row-actions { display: flex; gap: 4px; align-items: center; }
.action-btn {
  padding: 4px 14px; font-size: 12px; background: transparent;
  border: 1px solid var(--border-color); border-radius: var(--radius-sm);
  color: var(--text-secondary); cursor: pointer;
  transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.action-btn:hover { border-color: var(--brand); color: var(--text-primary); background: var(--bg-hover); }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.action-btn-danger:hover { border-color: #e74c3c; color: #e74c3c; background: rgba(231, 76, 60, 0.06); }

.debug-btn {
  border-color: var(--brand); color: var(--brand); padding: 4px 8px;
  display: inline-flex; align-items: center; justify-content: center;
}
.debug-btn:hover { background: var(--brand); color: #0f0f0f; }

.source-detail { padding: 4px 0; max-height: 500px; overflow-y: auto; }
.detail-section { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color); }
.detail-section:last-child { border-bottom: none; margin-bottom: 0; }
.detail-label { font-size: 13px; font-weight: var(--font-semibold); color: var(--text-secondary); margin-bottom: 6px; display: block; }
.detail-row { display: flex; padding: 3px 0; font-size: 13px; }
.detail-row .detail-label { min-width: 70px; font-weight: var(--font-medium); color: var(--text-muted); margin-bottom: 0; flex-shrink: 0; }
.detail-value { color: var(--text-primary); word-break: break-all; line-height: 1.5; }
.detail-value.enabled-text { color: #4caf50; font-weight: var(--font-medium); }
.detail-value.disabled-text { color: #e74c3c; font-weight: var(--font-medium); }
.detail-value.url-text { font-size: 12px; color: var(--brand); word-break: break-all; }
.detail-comment {
  padding: 10px 14px; background: var(--bg-hover); border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-secondary); white-space: pre-wrap;
  max-height: 120px; overflow-y: auto; line-height: 1.6;
}
.rule-preview {
  background: var(--bg); border-radius: var(--radius-sm); padding: 10px 14px;
  font-size: 12px; font-family: var(--font-mono); line-height: 1.6;
}
.rule-item { display: flex; gap: 8px; padding: 2px 0; border-bottom: 1px solid var(--border-color); }
.rule-item:last-child { border-bottom: none; }
.rule-key { color: var(--text-muted); min-width: 44px; flex-shrink: 0; }
.rule-value { color: var(--text-secondary); word-break: break-all; }
.detail-actions { display: flex; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color); flex-wrap: wrap; }

.editor-container { padding: 4px 0; }
.editor-hint {
  padding: 10px 14px; background: rgba(212,160,23,0.08); border: 1px solid rgba(212,160,23,0.15);
  border-radius: var(--radius-sm); font-size: 12px; color: var(--text-secondary);
  margin-bottom: 14px; line-height: 1.5;
}
.editor-textarea { font-family: var(--font-mono); font-size: 13px; line-height: 1.7; }
</style>