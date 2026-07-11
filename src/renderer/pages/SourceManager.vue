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

    <div v-if="filteredSources.length > 0" class="source-list">
      <div class="list-header">
        <span>名称</span>
        <span>状态</span>
        <span>测试结果</span>
        <span>操作</span>
      </div>
      <div v-for="source in filteredSources" :key="source.id" class="list-row">
        <span class="source-name">{{ source.name }}</span>
        <span class="status-dot" :class="source.enabled ? 'enabled' : 'disabled'"></span>
        <span>{{ testResults[source.id] || '—' }}</span>
        <div class="row-actions">
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

    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="importJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>

    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="importFromUrl">
      <n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog, NModal, NInput } from 'naive-ui'
import { store, source as sourceApi } from '@/api'
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

let unlistenTest: (() => void) | null = null

// 搜索筛选
const filteredSources = computed(() => {
  if (!searchText.value.trim()) return sources.value
  const keyword = searchText.value.trim().toLowerCase()
  return sources.value.filter(s =>
    s.name?.toLowerCase().includes(keyword) ||
    s.url?.toLowerCase().includes(keyword) ||
    s.id?.toLowerCase().includes(keyword)
  )
})

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
        const list = await store.get('sources') || []
        sources.value = list.filter((s: BookSource) => s.id !== source.id)
        await store.set('sources', sources.value)
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
  try {
    const text = await file.text()
    await sourceApi.add(text)
    await loadSources()
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    input.value = ''
  }
}

async function importJson() {
  if (!jsonInput.value.trim()) {
    message.warning('请粘贴书源 JSON')
    return
  }
  try {
    await sourceApi.add(jsonInput.value)
    jsonInput.value = ''
    showJsonModal.value = false
    await loadSources()
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  }
}

async function importFromUrl() {
  if (!urlInput.value.trim()) {
    message.warning('请输入 URL')
    return
  }
  try {
    await sourceApi.importFromUrl(urlInput.value)
    urlInput.value = ''
    showUrlModal.value = false
    await loadSources()
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
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

.search-wrapper {
  position: relative;
}
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

.row-actions { display: flex; gap: 4px; }
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
</style>
