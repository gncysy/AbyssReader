<template>
  <div class="market-page">
    <header class="page-header">
      <h1 class="page-title">书源市场</h1>
      <p class="page-subtitle">导入书源 JSON</p>
    </header>

    <div class="import-toolbar">
      <div class="import-url-wrapper">
        <input
          v-model="importUrl"
          type="text"
          placeholder="输入 JSON 链接..."
          class="input-url"
          @keyup.enter="importFromUrl"
        />
        <button class="btn-primary" :disabled="loading" @click="importFromUrl">
          {{ loading ? '加载中...' : '导入' }}
        </button>
      </div>
      <button class="btn-secondary" @click="triggerFileInput">选择文件</button>
      <button class="btn-secondary" @click="showJsonModal = true">粘贴 JSON</button>
    </div>

    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <div v-if="loading && !loadedSources.length" class="loading-grid">
      <div v-for="i in 6" :key="i" class="source-card-skeleton">
        <div class="skeleton" style="height:48px;width:48px;border-radius:50%;"></div>
        <div class="skeleton" style="height:16px;width:60%;"></div>
        <div class="skeleton" style="height:12px;width:80%;"></div>
        <div class="skeleton" style="height:32px;width:80px;"></div>
      </div>
    </div>

    <div v-else-if="loadedSources.length > 0" class="sources-grid">
      <div
        v-for="source in loadedSources"
        :key="source.id || source.name"
        class="source-card"
      >
        <div class="source-card-header">
          <h4>{{ source.name || source.bookSourceName || '未命名' }}</h4>
          <span v-if="source.fileName?.endsWith('.js')" class="badge-desktop">桌面</span>
        </div>
        <p class="source-desc">{{ source.comment || source.bookSourceComment || '暂无描述' }}</p>
        <div class="source-tags">
          <span v-if="source.version" class="tag">v{{ source.version }}</span>
          <span class="tag">{{ source.fileName?.endsWith('.js') ? 'JS 书源' : 'JSON 书源' }}</span>
        </div>
        <button
          class="btn-install"
          :disabled="installingIds.has(source.uuid || source.name || source.id)"
          @click="installSource(source)"
        >
          {{ installingIds.has(source.uuid || source.name || source.id) ? '安装中...' : '安装' }}
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📦</div>
      <h3>导入书源开始</h3>
      <p>输入 URL、上传文件或粘贴 JSON</p>
    </div>

    <n-modal v-model:show="showJsonModal" preset="dialog" title="粘贴 JSON" positive-text="导入" @positive-click="importJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { store, source as sourceApi, network as networkApi } from '@/api'
import type { BookSource } from '@shared/types'

const message = useMessage()

const importUrl = ref('')
const jsonInput = ref('')
const loadedSources = ref<any[]>([])
const loading = ref(false)
const showJsonModal = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const installingIds = ref<Set<string>>(new Set())

async function importFromUrl() {
  if (!importUrl.value.trim()) {
    message.warning('请输入 URL')
    return
  }
  loading.value = true
  try {
    const response = await networkApi.fetch(importUrl.value, { method: 'GET' })
    const data = JSON.parse(response.data)
    loadedSources.value = Array.isArray(data) ? data : [data]
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loading.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    loadedSources.value = Array.isArray(data) ? data : [data]
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    loading.value = false
    input.value = ''
  }
}

async function importJson() {
  if (!jsonInput.value.trim()) {
    message.warning('请粘贴书源 JSON')
    return
  }
  try {
    const data = JSON.parse(jsonInput.value)
    loadedSources.value = Array.isArray(data) ? data : [data]
    jsonInput.value = ''
    showJsonModal.value = false
    message.success(`解析到 ${loadedSources.value.length} 个书源`)
  } catch (err: any) {
    message.error('解析失败: ' + err.message)
  }
}

async function installSource(source: any) {
  const id = source.uuid || source.name || source.id || 'unknown'
  if (installingIds.value.has(id)) return

  installingIds.value.add(id)
  try {
    const sourceObj: BookSource = {
      id: source.id || source.bookSourceUrl || `source_${Date.now()}`,
      name: source.name || source.bookSourceName || '未命名书源',
      url: source.url || source.bookSourceUrl || '',
      searchUrl: source.searchUrl || '',
      ruleSearch: source.ruleSearch || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleExplore: source.ruleExplore || {},
      exploreUrl: source.exploreUrl || '',
      enabled: true,
      group: source.group || null,
      comment: source.comment || null,
      weight: source.weight || 0,
      header: source.header || null,
      enabledCookieJar: source.enabledCookieJar || false,
      jsLib: source.jsLib || null,
      loginUrl: source.loginUrl || null,
      loginUi: source.loginUi || null,
      respondTime: 0,
      lastUpdateTime: Date.now(),
      bookUrlPattern: source.bookUrlPattern || null,
      code: source.code || null,
      _legado: !!source.code,
      _desktop: true,
    }

    const list = await store.get('sources') || []
    const exists = list.find((s: BookSource) => s.id === sourceObj.id)
    if (exists) {
      message.warning('该书源已存在')
      return
    }
    list.push(sourceObj)
    await store.set('sources', list)
    message.success(`已安装《${sourceObj.name}》`)
  } catch (err: any) {
    message.error('安装失败: ' + err.message)
  } finally {
    installingIds.value.delete(id)
  }
}
</script>

<style scoped>
.market-page { position: relative; z-index: 1; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

.import-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.import-url-wrapper {
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 280px;
}
.input-url {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
}
.input-url:focus { border-color: var(--brand); }
.input-url::placeholder { color: var(--text-muted); }

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.source-card {
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}
.source-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.source-card-header h4 { font-size: 14px; font-weight: 500; color: var(--text-primary); margin: 0; }
.badge-desktop {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(96,165,250,0.15);
  color: #60a5fa;
}
.source-desc { font-size: 12px; color: var(--text-muted); flex: 1; margin-bottom: 8px; }
.source-tags { display: flex; gap: 4px; margin-bottom: 12px; }
.tag {
  font-size: 10px;
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-muted);
}
.btn-install {
  padding: 4px 16px;
  font-size: 13px;
  color: var(--brand);
  background: var(--bg-active);
  border: 1px solid var(--brand);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
}
.btn-install:hover:not(:disabled) { background: var(--brand); color: white; }
.btn-install:disabled { opacity: 0.5; cursor: not-allowed; }

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

.loading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.source-card-skeleton {
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton { background: var(--bg-hover); border-radius: 4px; animation: shimmer 1.5s infinite; }
@keyframes shimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
</style>
