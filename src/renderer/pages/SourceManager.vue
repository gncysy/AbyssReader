<template>
  <div class="source-manager-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书源管理</h1>
        <p class="page-subtitle">{{ filteredSources.length }} 个书源</p>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索书源..."
            class="input-search"
          />
        </div>
        <button class="btn-secondary" @click="triggerFileInput">上传文件</button>
        <button class="btn-secondary" @click="showUrlModal = true">从 URL</button>
        <button class="btn-primary" @click="showJsonModal = true">粘贴 JSON</button>
        <button class="btn-secondary" :disabled="testingAll" @click="testAll">
          {{ testingAll ? `测试中 ${testProgress}/${sources.length}` : '测试全部' }}
        </button>
        <button class="btn-danger" :disabled="deletingFailed" @click="deleteFailed">
          {{ deletingFailed ? '删除中...' : '删除失效' }}
        </button>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <!-- 导入进度条 -->
    <div v-if="importing" class="import-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: importProgress + '%' }"></div>
      </div>
      <span class="progress-text">{{ importProgress }}%</span>
      <span class="progress-label">{{ importLabel }}</span>
    </div>

    <!-- 书源列表 -->
    <div v-if="filteredSources.length > 0" class="source-list">
      <div class="list-header">
        <span>名称</span>
        <span>状态</span>
        <span>测试结果</span>
        <span>操作</span>
      </div>
      <div
        v-for="source in filteredSources"
        :key="source.id"
        class="list-row"
        @click="showSourceDetail(source)"
      >
        <span class="source-name">{{ source?.name || "未命名书源" }}</span>
        <span class="status-dot" :class="source.enabled ? 'enabled' : 'disabled'"></span>
        <span>{{ testResults[source.id] || '—' }}</span>
        <div class="row-actions" @click.stop>
          <button class="action-btn debug-btn" @click="openDebug(source)" title="调试此书源">🔧</button>
          <button class="action-btn" :disabled="testingId === source.id" @click="testSource(source)">
            {{ testingId === source.id ? '...' : '测试' }}
          </button>
          <button class="action-btn" @click="toggleSource(source)">
            {{ source.enabled ? '禁用' : '启用' }}
          </button>
          <button class="action-btn danger" @click="deleteSource(source)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📦</div>
      <h3>{{ searchText ? '未找到匹配的书源' : '暂无书源' }}</h3>
      <p>{{ searchText ? '试试其他关键词' : '导入书源开始阅读' }}</p>
    </div>

    <!-- 弹窗 -->
    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="importJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>

    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="importFromUrl">
      <n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." />
    </n-modal>

    <!-- ===== 书源详情对话框 ===== -->
    <n-modal
      v-model:show="showDetailModal"
      preset="dialog"
      :title="`📖 书源详情`"
      :style="{ width: '700px' }"
      :show-icon="false"
    >
      <div v-if="selectedSource" class="source-detail">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">名称</span>
            <span class="detail-value">{{ selectedSource.name }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">分组</span>
            <span class="detail-value">{{ selectedSource.group || '未分组' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value" :class="selectedSource.enabled ? 'enabled-text' : 'disabled-text'">
              {{ selectedSource.enabled ? '✅ 已启用' : '❌ 已禁用' }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ selectedSource._legado ? 'JS 书源' : 'JSON 书源' }}</span>
          </div>
        </div>

        <!-- 书源说明 -->
        <div v-if="selectedSource.comment" class="detail-section">
          <div class="detail-label">📝 说明</div>
          <div class="detail-comment">{{ selectedSource.comment }}</div>
        </div>

        <!-- URL 信息 -->
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">书源 URL</span>
            <span class="detail-value url-text">{{ selectedSource.url || '无' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">搜索 URL</span>
            <span class="detail-value url-text">{{ selectedSource.searchUrl || '无' }}</span>
          </div>
          <div v-if="selectedSource.exploreUrl" class="detail-row">
            <span class="detail-label">发现 URL</span>
            <span class="detail-value url-text">{{ selectedSource.exploreUrl }}</span>
          </div>
        </div>

        <!-- 规则预览 -->
        <div class="detail-section">
          <div class="detail-label">📋 规则预览</div>
          <div class="rule-preview">
            <div class="rule-item">
              <span class="rule-key">搜索:</span>
              <span class="rule-value">{{ selectedSource.ruleSearch?.bookList || '未配置' }}</span>
            </div>
            <div class="rule-item">
              <span class="rule-key">目录:</span>
              <span class="rule-value">{{ selectedSource.ruleToc?.chapterList || '未配置' }}</span>
            </div>
            <div class="rule-item">
              <span class="rule-key">正文:</span>
              <span class="rule-value">{{ selectedSource.ruleContent?.content || '未配置' }}</span>
            </div>
            <div class="rule-item">
              <span class="rule-key">详情:</span>
              <span class="rule-value">{{ selectedSource.ruleBookInfo?.name || '未配置' }}</span>
            </div>
          </div>
        </div>

        <!-- 元数据 -->
        <div class="detail-section meta">
          <div class="detail-row">
            <span class="detail-label">响应时间</span>
            <span class="detail-value">{{ selectedSource.respondTime || 0 }}ms</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">更新时间</span>
            <span class="detail-value">{{ formatTime(selectedSource.lastUpdateTime) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">权重</span>
            <span class="detail-value">{{ selectedSource.weight || 0 }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Cookie</span>
            <span class="detail-value">{{ selectedSource.enabledCookieJar ? '✅ 启用' : '❌ 禁用' }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="detail-actions">
          <button class="btn-primary" @click="openDebugFromDetail">🔧 调试</button>
          <button class="btn-edit" @click="openEditor">✏️ 编辑书源</button>
          <button class="btn-secondary" @click="copySourceId">📋 复制 ID</button>
          <button class="btn-secondary" @click="showDetailModal = false">关闭</button>
        </div>
      </div>
    </n-modal>

    <!-- ===== 编辑书源对话框 ===== -->
    <n-modal
      v-model:show="showEditorModal"
      preset="dialog"
      title="✏️ 编辑书源"
      :style="{ width: '750px', maxWidth: '95vw' }"
      positive-text="保存"
      negative-text="取消"
      @positive-click="saveSourceEdit"
      @negative-click="showEditorModal = false"
    >
      <div class="editor-container">
        <div class="editor-hint">
          ⚠️ 修改书源规则需要了解 CSS/XPath/JSON 选择器语法。编辑前建议先备份。
        </div>
        <n-input
          v-model:value="editJson"
          type="textarea"
          :autosize="{ minRows: 20, maxRows: 35 }"
          class="editor-textarea"
        />
      </div>
    </n-modal>

    <!-- ===== 书源调试助手 - 悬浮窗 ===== -->
    <DebugPanel
      v-if="showDebugPanel"
      :visible="showDebugPanel"
      :sources="sources"
      :source-id="debugSourceId"
      :book-url="debugBookUrl"
      @update:visible="showDebugPanel = $event"
      @select-source="debugSourceId = $event"
    />
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

const sources = ref<BookSource[]>([])
const searchText = ref('')
const testResults = ref<Record<string, string>>({})
const testingId = ref('')
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
const showJsonModal = ref(false)
const showUrlModal = ref(false)
const jsonInput = ref('')
const urlInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// 详情弹窗
const showDetailModal = ref(false)
const selectedSource = ref<BookSource | null>(null)

// 编辑弹窗
const showEditorModal = ref(false)
const editJson = ref('')
const editingSourceId = ref('')

// 调试面板状态
const showDebugPanel = ref(false)
const debugSourceId = ref('')
const debugBookUrl = ref('')

// 导入进度状态
const importing = ref(false)
const importProgress = ref(0)
const importLabel = ref('准备导入...')

let unlistenTest: (() => void) | null = null

const filteredSources = computed(() => {
  if (!searchText.value.trim()) return sources.value
  const keyword = searchText.value.trim().toLowerCase()
  return sources.value.filter(s =>
    s.name?.toLowerCase().includes(keyword) ||
    s.url?.toLowerCase().includes(keyword) ||
    s.id?.toLowerCase().includes(keyword) ||
    s.group?.toLowerCase().includes(keyword) ||
    s.comment?.toLowerCase().includes(keyword)
  )
})

// ===== 格式化时间 =====
function formatTime(timestamp: number | string): string {
  if (!timestamp) return '未知'
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp
  if (isNaN(ts) || ts === 0) return '未知'
  const date = new Date(ts)
  return date.toLocaleString('zh-CN')
}

// ===== 显示书源详情 =====
function showSourceDetail(source: BookSource) {
  selectedSource.value = source
  showDetailModal.value = true
}

// ===== 从详情打开调试 =====
function openDebugFromDetail() {
  if (!selectedSource.value) return
  showDetailModal.value = false
  setTimeout(() => {
    openDebug(selectedSource.value!)
  }, 200)
}

// ===== 复制书源 ID =====
async function copySourceId() {
  if (!selectedSource.value) return
  try {
    await navigator.clipboard.writeText(selectedSource.value.id)
    message.success('已复制书源 ID')
  } catch {
    message.warning('复制失败，请手动复制')
  }
}

// ===== 打开编辑器 =====
function openEditor() {
  if (!selectedSource.value) return
  editingSourceId.value = selectedSource.value.id
  // 格式化 JSON 显示
  editJson.value = JSON.stringify(selectedSource.value, null, 2)
  showDetailModal.value = false
  showEditorModal.value = true
}

// ===== 保存编辑 =====
async function saveSourceEdit() {
  try {
    const parsed = JSON.parse(editJson.value)
    if (!parsed.id) {
      message.error('书源缺少 id 字段')
      return
    }
    
    // 更新书源
    const allSources = await store.get('sources') || []
    const index = allSources.findIndex((s: any) => s.id === parsed.id)
    if (index === -1) {
      message.error('书源不存在')
      return
    }
    
    allSources[index] = parsed
    await store.set('sources', allSources)
    sources.value = allSources
    
    showEditorModal.value = false
    message.success(`✅ 已更新书源: ${parsed.name}`)
    
    // 重新显示详情
    selectedSource.value = parsed
    showDetailModal.value = true
  } catch (err: any) {
    message.error('JSON 格式错误: ' + err.message)
  }
}

// ===== 打开调试面板 =====
function openDebug(source: BookSource) {
  debugSourceId.value = source.id
  debugBookUrl.value = ''
  showDebugPanel.value = true
  console.log('[SourceManager] 打开调试面板:', source.name)
}

// ===== 原有功能 =====
async function loadSources() {
  try {
    const raw = await store.get('sources')
    sources.value = raw || []
    const sourceIds = new Set(sources.value.map(s => s.id))
    for (const id of Object.keys(testResults.value)) {
      if (!sourceIds.has(id)) {
        delete testResults.value[id]
      }
    }
  } catch (err: any) {
    message.error('加载书源失败: ' + err.message)
  }
}

async function testSource(source: BookSource) {
  testingId.value = source.id
  try {
    const result = await sourceApi.test(source.id)
    testResults.value[source.id] = result
    message.success(`${source.name}: ${result}`)
  } catch (err: any) {
    testResults.value[source.id] = '失败: ' + err.message
    message.error(`${source.name}: ${err.message}`)
  } finally {
    testingId.value = ''
  }
}

async function testAll() {
  if (sources.value.length === 0) {
    message.warning('没有书源可测试')
    return
  }

  testingAll.value = true
  testProgress.value = 0
  testResults.value = {}

  if (unlistenTest) {
    try { unlistenTest() } catch {}
    unlistenTest = null
  }

  try {
    unlistenTest = window.electronAPI.on('source-test-result', (r: any) => {
      if (r.status === 'ok') {
        testResults.value[r.id] = `连接成功 · ${r.time_ms}ms · ${r.size_kb}KB`
      } else {
        testResults.value[r.id] = `失败: ${r.error || '未知错误'}`
      }
      testProgress.value++
    })

    await sourceApi.testAll()
    await new Promise((resolve) => setTimeout(resolve, 2000))
    message.success('测试完成')

  } catch (err: any) {
    message.error('测试失败: ' + err.message)
  } finally {
    testingAll.value = false
    if (unlistenTest) {
      try { unlistenTest() } catch {}
      unlistenTest = null
    }
  }
}

async function toggleSource(source: BookSource) {
  try {
    const list = await store.get('sources') || []
    const idx = list.findIndex((s: BookSource) => s.id === source.id)
    if (idx !== -1) {
      list[idx].enabled = !list[idx].enabled
      await store.set('sources', list)
      sources.value = list
      message.success(`${source.name} ${source.enabled ? '已禁用' : '已启用'}`)
    }
  } catch (err: any) {
    message.error('操作失败: ' + err.message)
  }
}

async function deleteSource(source: BookSource) {
  dialog.warning({
    title: '确认删除',
    content: `删除「${source.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 直接操作 store，避免 IPC 克隆问题
        const list = await store.get('sources') || []
        const filtered = list.filter((s: BookSource) => s.id !== source.id)
        await store.set('sources', filtered)
        sources.value = filtered
        delete testResults.value[source.id]
        message.success('已删除')
      } catch (err: any) {
        message.error('删除失败: ' + err.message)
      }
    },
  })
}

async function deleteFailed() {
  if (sources.value.length === 0) {
    message.warning('没有书源可操作')
    return
  }

  dialog.warning({
    title: '删除失效书源',
    content: `将测试所有 ${sources.value.length} 个书源，并删除连接失败的。`,
    positiveText: '开始检测',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingFailed.value = true
      try {
        const result = await sourceApi.deleteFailed()
        await loadSources()
        message.success(`已删除 ${result} 个失效书源`)
      } catch (err: any) {
        message.error('操作失败: ' + err.message)
      } finally {
        deletingFailed.value = false
      }
    },
  })
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  importProgress.value = 10
  importLabel.value = '读取文件...'

  try {
    const text = await file.text()
    importProgress.value = 30
    importLabel.value = '解析书源...'

    await sourceApi.add(text)
    importProgress.value = 70
    importLabel.value = '保存书源...'

    await loadSources()
    importProgress.value = 100
    importLabel.value = '导入完成！'
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
    importLabel.value = '导入失败'
  } finally {
    input.value = ''
    setTimeout(() => {
      importing.value = false
      importProgress.value = 0
      importLabel.value = '准备导入...'
    }, 800)
  }
}

async function importJson() {
  if (!jsonInput.value.trim()) {
    message.warning('请粘贴书源 JSON')
    return
  }

  importing.value = true
  importProgress.value = 10
  importLabel.value = '解析书源...'

  try {
    await sourceApi.add(jsonInput.value)
    importProgress.value = 70
    importLabel.value = '保存书源...'

    jsonInput.value = ''
    showJsonModal.value = false
    await loadSources()
    importProgress.value = 100
    importLabel.value = '导入完成！'
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
    importLabel.value = '导入失败'
  } finally {
    setTimeout(() => {
      importing.value = false
      importProgress.value = 0
      importLabel.value = '准备导入...'
    }, 800)
  }
}

async function importFromUrl() {
  if (!urlInput.value.trim()) {
    message.warning('请输入 URL')
    return
  }

  importing.value = true
  importProgress.value = 10
  importLabel.value = '下载书源...'

  try {
    importProgress.value = 30
    await sourceApi.importFromUrl(urlInput.value)
    importProgress.value = 70
    importLabel.value = '保存书源...'

    urlInput.value = ''
    showUrlModal.value = false
    await loadSources()
    importProgress.value = 100
    importLabel.value = '导入完成！'
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
    importLabel.value = '导入失败'
  } finally {
    setTimeout(() => {
      importing.value = false
      importProgress.value = 0
      importLabel.value = '准备导入...'
    }, 800)
  }
}

onMounted(() => {
  loadSources()
})

onUnmounted(() => {
  if (unlistenTest) {
    try { unlistenTest() } catch {}
  }
})
</script>

<style scoped>
.source-manager-page { position: relative; z-index: 1; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.search-wrapper { position: relative; }
.input-search {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  width: 180px;
  transition: border-color 0.2s;
}
.input-search:focus { border-color: var(--brand); }
.input-search::placeholder { color: var(--text-muted); }

.import-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
}
.progress-bar { flex: 1; height: 6px; background: var(--bg-hover); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--brand); border-radius: 4px; transition: width 0.3s ease; }
.progress-text { font-size: 13px; color: var(--text-secondary); min-width: 40px; text-align: right; }
.progress-label { font-size: 13px; color: var(--text-muted); min-width: 80px; }

.source-list {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.list-header {
  display: grid;
  grid-template-columns: 1fr 60px 1fr 200px;
  padding: 10px 16px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.list-row {
  display: grid;
  grid-template-columns: 1fr 60px 1fr 200px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.list-row:hover {
  background: var(--bg-hover);
}
.list-row:last-child { border-bottom: none; }

.source-name { color: var(--text-primary); }
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.enabled { background: #4caf50; }
.status-dot.disabled { background: #666; }

.row-actions { display: flex; gap: 4px; align-items: center; }
.action-btn {
  padding: 2px 10px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover { border-color: var(--brand); color: var(--text-primary); }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.action-btn.danger:hover { border-color: #e74c3c; color: #e74c3c; }
.action-btn.debug-btn {
  border-color: var(--brand);
  color: var(--brand);
  font-size: 14px;
  padding: 2px 6px;
}
.action-btn.debug-btn:hover {
  background: var(--brand);
  color: #0d0d0d;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  text-align: center;
}
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
.empty-state h3 { font-size: 20px; color: var(--text-secondary); }
.empty-state p { font-size: 14px; color: var(--text-muted); }

.hidden { display: none; }

/* ===== 书源详情弹窗 ===== */
.source-detail {
  padding: 4px 0;
  max-height: 500px;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.detail-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}
.detail-section.meta {
  opacity: 0.7;
  font-size: 13px;
}

.detail-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
  display: block;
}

.detail-row {
  display: flex;
  padding: 2px 0;
  font-size: 13px;
}
.detail-row .detail-label {
  min-width: 70px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 0;
  flex-shrink: 0;
}
.detail-value {
  color: var(--text-primary);
  word-break: break-all;
}
.detail-value.enabled-text { color: #4caf50; }
.detail-value.disabled-text { color: #e74c3c; }
.detail-value.url-text {
  font-size: 12px;
  color: var(--brand);
  word-break: break-all;
}

.detail-comment {
  padding: 8px 12px;
  background: var(--bg-hover);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.rule-preview {
  background: var(--bg);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-family: monospace;
}
.rule-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid var(--border-color);
}
.rule-item:last-child { border-bottom: none; }
.rule-key {
  color: var(--text-muted);
  min-width: 44px;
  flex-shrink: 0;
}
.rule-value {
  color: var(--text-secondary);
  word-break: break-all;
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

/* ===== 编辑器 ===== */
.editor-container {
  padding: 4px 0;
}
.editor-hint {
  padding: 8px 12px;
  background: rgba(212, 160, 23, 0.10);
  border: 1px solid rgba(212, 160, 23, 0.20);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}
.editor-textarea {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
}

/* ===== 按钮 ===== */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #0d0d0d;
  background: var(--brand);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: var(--brand-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(212, 160, 23, 0.25);
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--brand);
}
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #c0392b;
  background: rgba(192, 57, 43, 0.10);
  border: 1px solid rgba(192, 57, 43, 0.20);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover { background: #c0392b; color: white; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #0d0d0d;
  background: #4caf50;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-edit:hover {
  background: #43a047;
  transform: translateY(-1px);
}
</style>


