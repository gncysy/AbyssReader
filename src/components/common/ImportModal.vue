<template>
  <n-modal v-model:show="visible" preset="card" :title="title || ''" style="max-width:600px" :bordered="false">
    <div class="import-tabs">
      <button class="import-tab" :class="{ active: activeTab === 'json' }" @click="activeTab = 'json'">粘贴 JSON</button>
      <button class="import-tab" :class="{ active: activeTab === 'url' }" @click="activeTab = 'url'">从 URL</button>
      <button class="import-tab" :class="{ active: activeTab === 'file' }" @click="activeTab = 'file'">选择文件</button>
    </div>

    <div v-if="activeTab === 'json'" class="import-panel">
      <textarea v-model="jsonText" class="import-textarea" placeholder="粘贴 JSON..." rows="12"></textarea>
    </div>

    <div v-else-if="activeTab === 'url'" class="import-panel">
      <input v-model="urlText" type="text" class="input-search" placeholder="输入 JSON URL..." style="width:100%" />
    </div>

    <div v-else class="import-panel">
      <input ref="fileInput" type="file" :accept="acceptFileTypes" class="hidden" @change="onFileSelected" />
      <button class="btn-secondary" @click="triggerFileInput">选择文件</button>
      <span v-if="fileName" style="margin-left:12px;font-size:13px;color:var(--text-secondary)">{{ fileName }}</span>
    </div>

    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" @click="handleClose">取消</button>
        <button class="btn-primary" :disabled="!canImport" @click="handleImport">{{ importing ? '导入中...' : '导入' }}</button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NModal } from 'naive-ui'

withDefaults(defineProps<{
  visible: boolean
  title?: string
  acceptFileTypes?: string
}>(), {
  title: '导入',
  acceptFileTypes: '.json',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'import-json': [jsonStr: string]
  'import-url': [url: string]
  'import-file': [file: File]
}>()

const activeTab = ref('json')
const jsonText = ref('')
const urlText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const importing = ref(false)

const canImport = computed(() => {
  if (activeTab.value === 'json') return jsonText.value.trim().length > 0
  if (activeTab.value === 'url') return urlText.value.trim().length > 0
  return fileName.value.length > 0
})

function triggerFileInput(): void { fileInput.value?.click() }
function onFileSelected(event: Event): void { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (file) fileName.value = file.name }

function handleImport(): void {
  importing.value = true
  if (activeTab.value === 'json') { emit('import-json', jsonText.value); jsonText.value = '' }
  else if (activeTab.value === 'url') { emit('import-url', urlText.value); urlText.value = '' }
  else { const input = fileInput.value; const file = input?.files?.[0]; if (file) { emit('import-file', file); fileName.value = ''; if (input) input.value = '' } }
  emit('update:visible', false)
  importing.value = false
}

function handleClose(): void { emit('update:visible', false) }
</script>

<style scoped>
.import-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
.import-tab { padding: 6px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.import-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.import-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.import-panel { padding: 8px 0; }
.import-textarea { width: 100%; padding: 10px 14px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; resize: vertical; font-family: var(--font-mono); line-height: 1.5; box-sizing: border-box; }
.import-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
</style>
