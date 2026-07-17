<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>数据</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">本地备份</span>
          <span class="label-desc">导出为 Legado 格式的 JSON 文件</span>
        </div>
        <button class="btn-data-secondary" @click="exportData">导出</button>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">本地恢复</span>
          <span class="label-desc">从 Legado 格式的 JSON 文件恢复</span>
        </div>
        <div class="setting-control">
          <button class="btn-data-secondary" @click="triggerImportInput">选择文件</button>
          <input ref="importInput" type="file" accept=".json" class="hidden" @change="onImportData" />
        </div>
      </div>

      <div class="setting-item danger">
        <div class="setting-label">
          <span class="label-text">清空所有数据</span>
          <span class="label-desc">删除所有书籍、书源和进度，不可恢复</span>
        </div>
        <button class="btn-data-danger" @click="clearAllData">清空</button>
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

function triggerImportInput() {
  importInput.value?.click()
}

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
/* 所有样式已由全局 index.css 提供 */
</style>