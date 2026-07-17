<template>
  <div class="market-page">
    <header class="page-header"><h1 class="page-title">书源市场</h1><p class="page-subtitle">导入书源 JSON</p></header>
    <div class="import-toolbar">
      <div class="import-url-wrapper">
        <input v-model="importUrl" type="text" placeholder="输入 JSON 链接..." class="input-url" @keyup.enter="importFromUrl" />
        <button class="btn-mk-primary" :disabled="loading" @click="importFromUrl">{{ loading ? '加载中...' : '导入' }}</button>
      </div>
      <button class="btn-mk-secondary" @click="triggerFileInput">选择文件</button>
      <button class="btn-mk-secondary" @click="showJsonModal = true">粘贴 JSON</button>
    </div>
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <div v-if="loadedSources.length > 0" class="sources-grid">
      <div v-for="(source, idx) in loadedSources" :key="idx" class="source-card">
        <div class="source-card-header"><h4>{{ source.name || source.bookSourceName || '未命名' }}</h4></div>
        <p class="source-desc">{{ source.comment || source.bookSourceComment || '暂无描述' }}</p>
        <button class="btn-install" :disabled="installing" @click="installSource(source)">{{ installing ? '安装中...' : '安装' }}</button>
      </div>
    </div>
    <div v-else class="empty-state"><h3>导入书源开始</h3></div>
    <n-modal v-model:show="showJsonModal" preset="dialog" title="粘贴 JSON" positive-text="导入" @positive-click="importJson">
      <n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { store, source as sourceApi, network as networkApi } from '@/api'

const message = useMessage()
const importUrl = ref(''); const jsonInput = ref(''); const loadedSources = ref<any[]>([])
const loading = ref(false); const showJsonModal = ref(false); const fileInput = ref<HTMLInputElement | null>(null)
const installing = ref(false)

async function importFromUrl() {
  if (!importUrl.value.trim()) { message.warning('请输入 URL'); return }
  loading.value = true
  try { const response = await networkApi.fetch(importUrl.value, { method: 'GET' }); const data = JSON.parse(response.data); loadedSources.value = Array.isArray(data) ? data : [data]; message.success(`解析到 ${loadedSources.value.length} 个书源`) }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { loading.value = false }
}

function triggerFileInput() { fileInput.value?.click() }

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  loading.value = true
  try { const text = await file.text(); const data = JSON.parse(text); loadedSources.value = Array.isArray(data) ? data : [data]; message.success(`解析到 ${loadedSources.value.length} 个书源`) }
  catch (err: any) { message.error('导入失败: ' + err.message) }
  finally { loading.value = false; input.value = '' }
}

async function importJson() {
  if (!jsonInput.value.trim()) { message.warning('请粘贴书源 JSON'); return }
  try { const data = JSON.parse(jsonInput.value); loadedSources.value = Array.isArray(data) ? data : [data]; jsonInput.value = ''; showJsonModal.value = false; message.success(`解析到 ${loadedSources.value.length} 个书源`) }
  catch (err: any) { message.error('解析失败: ' + err.message) }
}

async function installSource(source: any) {
  installing.value = true
  try {
    await sourceApi.add(JSON.stringify(source))
    message.success(`已安装《${source.name || source.bookSourceName || '未命名'}》`)
  } catch (err: any) { message.error('安装失败: ' + err.message) }
  finally { installing.value = false }
}
</script>

<style scoped>
.market-page { position: relative; z-index: 1; }
.import-toolbar { display: flex; gap: 10px; margin-bottom: 28px; flex-wrap: wrap; }
.import-url-wrapper { flex: 1; display: flex; gap: 10px; min-width: 300px; }

.sources-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.source-card {
  padding: 18px; background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); display: flex; flex-direction: column;
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.source-card:hover { border-color: rgba(212, 160, 23, 0.2); box-shadow: var(--shadow-sm); }
.source-card-header { margin-bottom: 6px; }
.source-card-header h4 { font-size: 15px; font-weight: var(--font-medium); color: var(--text-primary); margin: 0; }
.source-desc { font-size: 13px; color: var(--text-muted); flex: 1; margin-bottom: 10px; line-height: 1.5; }

.btn-install {
  padding: 6px 18px; font-size: 13px; color: var(--brand);
  background: var(--bg-active); border: 1px solid var(--brand);
  border-radius: var(--radius-sm); cursor: pointer; align-self: flex-start;
  font-weight: var(--font-medium);
  transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.btn-install:hover:not(:disabled) { background: var(--brand); color: #0f0f0f; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212,160,23,0.25); }
.btn-install:active:not(:disabled) { transform: translateY(0); }
.btn-install:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
</style>