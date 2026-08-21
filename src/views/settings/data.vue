<template><n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
  <div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>数据</h2></header>
    <div class="setting-item"><div><span class="label-text">本地备份</span><span class="label-desc">导出数据为 ZIP 文件</span></div><button class="btn-secondary" :disabled="exporting" @click="openExportDialog">{{ exporting ? '导出中...' : '导出' }}</button></div>
    <div class="setting-item"><div><span class="label-text">本地恢复</span><span class="label-desc">从 ZIP 文件恢复数据</span></div><button class="btn-secondary" @click="triggerImportInput">选择文件</button><input ref="importInput" type="file" accept=".zip" class="hidden" @change="onImportData" /></div>
    <div class="cache-section">
      <div class="setting-item"><div><span class="label-text">本地缓存</span><span class="label-desc">书籍封面、目录、正文、漫画图片及 JS 库缓存</span></div><button class="btn-secondary" :disabled="loadingCache" @click="loadCacheInfo">{{ loadingCache ? '加载中...' : '刷新' }}</button></div>
      <div v-if="cacheInfo" class="cache-info">
        <div class="cache-summary">
          <div class="cache-stat"><span class="cache-stat-label">缓存位置</span><span class="cache-stat-value cache-path">{{ cacheInfo.path }}</span></div>
          <div class="cache-stat"><span class="cache-stat-label">总大小</span><span class="cache-stat-value">{{ cacheInfo.totalSizeFormatted }} / {{ cacheInfo.maxTotalFormatted }}</span></div>
          <div class="cache-stat"><span class="cache-stat-label">缓存上限</span><div class="cache-limit-row"><input v-model.number="cacheLimitMB" type="number" min="10" max="10000" step="10" class="cache-limit-input" /><span class="cache-stat-value">MB</span><button class="btn-secondary" style="padding:2px 10px;font-size:11px" :disabled="savingLimit" @click="saveCacheLimit">{{ savingLimit ? '保存中' : '保存' }}</button></div></div>
          <div class="cache-stat"><span class="cache-stat-label">迁移目录</span><button class="btn-secondary" style="padding:4px 12px;font-size:12px" :disabled="migrating" @click="openMigrateDialog">{{ migrating ? '迁移中...' : '选择新目录' }}</button></div>
        </div>
        <div class="cache-categories" v-if="cacheInfo.categories && cacheInfo.categories.length > 0"><div v-for="cat in cacheInfo.categories" :key="cat.key" class="cache-category-row"><div class="cache-cat-info"><span class="cache-cat-name">{{ cat.name }}</span><span class="cache-cat-detail">{{ cat.count }} 个文件 · {{ cat.sizeFormatted }}</span></div><button class="btn-secondary" style="padding:4px 12px;font-size:12px" :disabled="clearingCategory === cat.key" @click="clearCategory(cat.key)">{{ clearingCategory === cat.key ? '清理中...' : '清理' }}</button></div></div>
        <div class="cache-actions"><button class="btn-danger" :disabled="clearingAll" @click="clearAllCache">{{ clearingAll ? '清空中...' : '清空所有缓存' }}</button></div>
      </div>
    </div>
    <div class="setting-item"><div><span class="label-text">清空所有数据</span><span class="label-desc">删除所有书籍、书源和进度，不可恢复</span></div><button class="btn-danger" @click="clearAllData">清空</button></div>

    <n-modal v-model:show="showExportDialog" preset="card" title="选择导出数据" style="max-width:480px" :bordered="false">
      <div class="export-options">
        <label class="export-check-all" @click.stop>
          <input type="checkbox" :checked="exportSelectAll" @change="toggleExportSelectAll" />
          <span>全选</span>
        </label>
        <div class="export-list">
          <label v-for="item in exportItems" :key="item.key" class="export-item" @click.stop>
            <input type="checkbox" v-model="item.checked" />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-secondary" @click="showExportDialog = false">取消</button>
          <button class="btn-primary" :disabled="!hasExportSelected || exporting" @click="doExport">{{ exporting ? '导出中...' : '导出' }}</button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="showImportDialog" preset="card" title="选择导入数据" style="max-width:480px" :bordered="false">
      <div class="export-options">
        <label class="export-check-all" @click.stop>
          <input type="checkbox" :checked="importSelectAll" @change="toggleImportSelectAll" />
          <span>全选</span>
        </label>
        <div class="export-list">
          <label v-for="item in importItems" :key="item.key" class="export-item" @click.stop>
            <input type="checkbox" v-model="item.checked" />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-secondary" @click="showImportDialog = false">取消</button>
          <button class="btn-primary" :disabled="!hasImportSelected || importing" @click="doImport">{{ importing ? '导入中...' : '导入' }}</button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="showMigrateDialog" preset="dialog" title="迁移缓存目录" positive-text="迁移" negative-text="取消" @positive-click="doMigrate">
      <n-input v-model:value="migratePath" placeholder="请输入新的缓存目录路径" />
    </n-modal>
  </div>
</n-config-provider></template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage, useDialog, NModal, NInput, NConfigProvider } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import { useReadingStore, useBookshelfStore } from '@/stores'
import { getDeviceName } from '@/services/webdav.js'
import BackButton from '@/components/common/BackButton.vue'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import { useCacheManager } from '@/composables/useCacheManager.js'

const msg = useMessage()
const dialog = useDialog()
const { naiveTheme, themeOverrides } = useNaiveTheme()
const readingStore = useReadingStore()
const bookshelfStore = useBookshelfStore()
const importInput = ref<HTMLInputElement | null>(null)
const exporting = ref(false)
const importing = ref(false)
const showExportDialog = ref(false)
const showImportDialog = ref(false)

const {
  cacheInfo,
  loadingCache,
  clearingCategory,
  clearingAll,
  cacheLimitMB,
  savingLimit,
  migrating,
  showMigrateDialog,
  migratePath,
  loadCacheInfo,
  saveCacheLimit,
  openMigrateDialog,
  doMigrate,
  clearCategory,
  clearAllCache,
} = useCacheManager()

const SYNC_KEYS = ['bookshelf', 'bookSource', 'readingProgress', 'replaceRule', 'bookGroup', 'txtTocRule', 'dictRule', 'keyboardAssists', 'rssSources']

// 修复：为每个 key 定义正确的空值类型
const EMPTY_VALUES: Record<string, unknown> = {
  bookshelf: [],
  bookSource: [],
  readingProgress: {},
  replaceRule: [],
  bookGroup: [],
  txtTocRule: [],
  dictRule: [],
  keyboardAssists: {},
  rssSources: [],
}

const EXPORT_LABELS: Record<string, string> = {
  bookshelf: '书架数据', bookSource: '书源', readingProgress: '阅读进度', replaceRule: '替换规则',
  bookGroup: '分组', txtTocRule: 'TXT 目录规则', dictRule: '字典规则', keyboardAssists: '快捷输入助手', rssSources: '订阅源',
}

const exportItems = ref(SYNC_KEYS.map(k => ({ key: k, label: EXPORT_LABELS[k] || k, checked: true })))
const importItems = ref<{ key: string; label: string; checked: boolean }[]>([])
let importZipData: unknown = null

const exportSelectAll = computed(() => exportItems.value.every(i => i.checked))
const hasExportSelected = computed(() => exportItems.value.some(i => i.checked))
const importSelectAll = computed(() => importItems.value.every(i => i.checked))
const hasImportSelected = computed(() => importItems.value.some(i => i.checked))

function toggleExportSelectAll(): void {
  const all = exportSelectAll.value
  exportItems.value.forEach(i => i.checked = !all)
}

function toggleImportSelectAll(): void {
  const all = importSelectAll.value
  importItems.value.forEach(i => i.checked = !all)
}

function openExportDialog(): void {
  exportItems.value = SYNC_KEYS.map(k => ({ key: k, label: EXPORT_LABELS[k] || k, checked: true }))
  showExportDialog.value = true
}

async function doExport(): Promise<void> {
  exporting.value = true
  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const allData = await store.getAll()
    let count = 0
    const selected = exportItems.value.filter(i => i.checked)
    for (const item of selected) {
      const value = allData[item.key]
      if (value !== undefined && value !== null) {
        zip.file(item.key + '.json', JSON.stringify(value, null, 2))
        count++
      }
    }
    if (count === 0) { msg.warning('没有数据可导出'); return }
    const device = await getDeviceName()
    const filename = `backup${new Date().toISOString().slice(0, 10)}-${device}.zip`
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showExportDialog.value = false
    msg.success(`已导出: ${filename} (${count} 个文件)`)
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导出失败: ' + e.message)
  } finally {
    exporting.value = false
  }
}

function triggerImportInput(): void { importInput.value?.click() }

async function onImportData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const JSZip = (await import('jszip')).default
    importZipData = await JSZip.loadAsync(file)
    const items: { key: string; label: string; checked: boolean }[] = []
    const zipObj = importZipData as { file: (name: string | RegExp) => unknown | null }
    for (const key of SYNC_KEYS) {
      const jsonFile = zipObj.file(key + '.json')
      if (jsonFile) {
        items.push({ key, label: EXPORT_LABELS[key] || key, checked: true })
      }
    }
    if (items.length === 0) { msg.warning('ZIP 中未找到可导入的数据'); input.value = ''; return }
    importItems.value = items
    showImportDialog.value = true
  } catch (err: unknown) {
    const e = err as Error
    msg.error('读取 ZIP 失败: ' + e.message)
    input.value = ''
  }
}

async function doImport(): Promise<void> {
  importing.value = true
  try {
    let count = 0
    const selected = importItems.value.filter(i => i.checked)
    const zipObj = importZipData as { file: (name: string) => { async: (type: string) => Promise<string> } | null }
    for (const item of selected) {
      const jsonFile = zipObj.file(item.key + '.json')
      if (!jsonFile) continue
      try {
        const content = await jsonFile.async('string')
        const parsed = JSON.parse(content) as unknown
        if (item.key === 'replaceRule') {
          const rawExisting = await store.get('replaceRule')
          const existing = asArray<Record<string, unknown>>(rawExisting)
          const incoming = Array.isArray(parsed) ? parsed : []
          const merged = [...existing]
          for (const rule of incoming) {
            const r = rule as Record<string, unknown>
            if (!merged.find((er) => er.name === r.name && er.pattern === r.pattern)) {
              merged.push(r)
            }
          }
          await store.set(item.key, merged)
        } else {
          await store.set(item.key, parsed)
        }
        count++
      } catch {
        continue
      }
    }
    if (count === 0) { msg.warning('未导入任何数据'); return }
    await readingStore.loadSettings()
    await bookshelfStore.loadBooks()
    showImportDialog.value = false
    if (importInput.value) importInput.value.value = ''
    importZipData = null
    msg.success(`已导入 ${count} 项数据`)
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导入失败: ' + e.message)
  } finally {
    importing.value = false
  }
}

async function clearAllData(): Promise<void> {
  dialog.warning({
    title: '危险操作',
    content: '确定清空所有数据？不可恢复！',
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 修复：使用每个 key 对应的正确空值类型
        for (const key of SYNC_KEYS) {
          const emptyValue = EMPTY_VALUES[key]
          await store.set(key, emptyValue !== undefined ? emptyValue : [])
        }
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.startsWith('infoMap_') || key === 'todayReadDate' || key === 'todayReadCount')) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k))
        await readingStore.loadSettings()
        await bookshelfStore.loadBooks()
        msg.success('已清空')
      } catch (err: unknown) {
        const e = err as Error
        msg.error('清空失败: ' + e.message)
      }
    },
  })
}
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px; }
.hidden { display: none; }
.cache-section { margin-top: 8px; }
.cache-section > .setting-item { border-bottom: none; padding-bottom: 12px; }
.cache-info { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 16px; }
.cache-summary { display: flex; flex-direction: column; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
.cache-stat { display: flex; justify-content: space-between; align-items: center; }
.cache-stat-label { font-size: 13px; color: var(--text-muted); flex-shrink: 0; margin-right: 12px; }
.cache-stat-value { font-size: 13px; color: var(--text-primary); font-weight: 500; text-align: right; word-break: break-all; }
.cache-path { font-size: 11px; font-family: var(--font-mono); opacity: 0.7; }
.cache-limit-row { display: flex; align-items: center; gap: 8px; }
.cache-limit-input { width: 70px; padding: 3px 8px; font-size: 13px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; text-align: right; }
.cache-limit-input:focus { border-color: var(--brand); }
.cache-categories { display: flex; flex-direction: column; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
.cache-category-row { display: flex; align-items: center; justify-content: space-between; }
.cache-cat-info { display: flex; flex-direction: column; }
.cache-cat-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.cache-cat-detail { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cache-actions { display: flex; justify-content: flex-end; }
.export-options { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.export-check-all { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-primary); padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.export-check-all input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
.export-list { display: flex; flex-direction: column; gap: 4px; }
.export-item { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); padding: 6px 4px; border-radius: var(--radius-sm); transition: background 0.15s; }
.export-item:hover { background: var(--bg-hover); }
.export-item input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
</style>
