<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>数据</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">本地备份</span>
          <span class="label-desc">导出为 Legado 格式的 JSON 文件</span>
        </div>
        <button class="btn-secondary" @click="exportData">导出</button>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">本地恢复</span>
          <span class="label-desc">从 Legado 格式的 JSON 文件恢复</span>
        </div>
        <div class="setting-control">
          <button class="btn-secondary" @click="triggerImportInput">选择文件</button>
          <input ref="importInput" type="file" accept=".json" class="hidden" @change="onImportData" />
        </div>
      </div>

      <div class="setting-item danger">
        <div class="setting-label">
          <span class="label-text">清空所有数据</span>
          <span class="label-desc">删除所有书籍、书源和进度，不可恢复</span>
        </div>
        <button class="btn-danger" @click="clearAllData">清空</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/api'
import { useReadingStore, useBookshelfStore } from '@/store'

const message = useMessage()
const dialog = useDialog()
const readingStore = useReadingStore()
const bookshelfStore = useBookshelfStore()
const importInput = ref<HTMLInputElement | null>(null)

async function exportData() {
  try {
    const data = await store.getAll()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `legado-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err: any) {
    message.error('导出失败: ' + err.message)
  }
}

function triggerImportInput() { importInput.value?.click() }

async function onImportData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    for (const [key, value] of Object.entries(data)) {
      await store.set(key, value)
    }
    await readingStore.loadSettings()
    await bookshelfStore.loadBooks()
    message.success('导入成功')
  } catch (err: any) {
    message.error('导入失败: ' + err.message)
  } finally {
    input.value = ''
  }
}

async function clearAllData() {
  dialog.warning({
    title: '危险操作',
    content: '确定清空所有数据？不可恢复！',
    positiveText: '确认清空',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' },
    onPositiveClick: async () => {
      try {
        await store.set('books', [])
        await store.set('sources', [])
        await store.set('readingProgress', {})
        localStorage.removeItem('app-settings')
        localStorage.removeItem('reader-settings')
        await readingStore.loadSettings()
        message.success('已清空')
      } catch (err: any) {
        message.error('清空失败: ' + err.message)
      }
    },
  })
}
</script>

<style scoped>
.settings-subpage { padding: 24px 32px; max-width: 640px; }
.subpage-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}
.subpage-header h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.btn-back {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}
.btn-back:hover { color: var(--text-primary); }

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}
.setting-item:last-child { border-bottom: none; }
.setting-item.danger { border-bottom-color: rgba(231, 76, 60, 0.2); }
.setting-label { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.label-text { font-size: 15px; color: var(--text-primary); }
.label-desc { font-size: 13px; color: var(--text-muted); }
.setting-control { display: flex; align-items: center; gap: 8px; }

.hidden { display: none; }

.btn-secondary {
  padding: 6px 16px;
  font-size: 14px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-secondary:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--brand);
}

.btn-danger {
  padding: 6px 16px;
  font-size: 14px;
  color: #c0392b;
  background: rgba(192, 57, 43, 0.10);
  border: 1px solid rgba(192, 57, 43, 0.20);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover { background: #c0392b; color: white; }
</style>
