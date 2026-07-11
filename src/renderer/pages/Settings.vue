<template>
  <div class="settings-page">
    <header class="page-header">
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">偏好与配置</p>
    </header>

    <div class="settings-container">
      <!-- ===== 外观 ===== -->
      <section class="settings-section">
        <h2 class="section-title">外观</h2>
        <div class="theme-grid">
          <div
            v-for="theme in themeOptions"
            :key="theme.value"
            class="theme-card"
            :class="{ active: currentTheme === theme.value }"
            @click="setTheme(theme.value)"
          >
            <div class="theme-preview" :class="theme.value"></div>
            <span>{{ theme.label }}</span>
          </div>
        </div>
      </section>

      <!-- ===== 阅读 ===== -->
      <section class="settings-section">
        <h2 class="section-title">阅读</h2>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">字体大小</span>
            <span class="label-desc">{{ fontSize }}px</span>
          </div>
          <div class="setting-control">
            <button class="size-btn" @click="decreaseFontSize">A−</button>
            <span class="size-value">{{ fontSize }}</span>
            <button class="size-btn" @click="increaseFontSize">A+</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">行间距</span>
            <span class="label-desc">{{ lineHeight.toFixed(1) }}</span>
          </div>
          <div class="setting-control">
            <button class="size-btn" @click="decreaseLineHeight">−</button>
            <span class="size-value">{{ lineHeight.toFixed(1) }}</span>
            <button class="size-btn" @click="increaseLineHeight">+</button>
          </div>
        </div>
      </section>

      <!-- ===== 数据 ===== -->
      <section class="settings-section">
        <h2 class="section-title">数据</h2>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">导出数据</span>
            <span class="label-desc">导出所有书籍、书源和阅读进度</span>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="exportData">导出 JSON</button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">导入数据</span>
            <span class="label-desc">从 JSON 文件恢复数据</span>
          </div>
          <div class="setting-control">
            <button class="btn-secondary" @click="triggerImportInput">选择文件</button>
            <input
              ref="importInput"
              type="file"
              accept=".json"
              class="hidden"
              @change="onImportData"
            />
          </div>
        </div>

        <div class="setting-item danger">
          <div class="setting-label">
            <span class="label-text">清空所有数据</span>
            <span class="label-desc">删除所有书籍、书源和进度，不可恢复</span>
          </div>
          <div class="setting-control">
            <button class="btn-danger" @click="clearAllData">清空</button>
          </div>
        </div>
      </section>

      <!-- ===== 关于 ===== -->
      <section class="settings-section about">
        <h2 class="section-title">关于</h2>
        <div class="about-content">
          <div class="about-logo">
            <span class="logo-icon">墨</span>
            <span class="logo-name">墨阅</span>
          </div>
          <p class="about-version">v0.1.0</p>
          <p class="about-desc">桌面端小说阅读器 · 兼容开源阅读书源</p>
          <p class="about-license">AGPL-3.0-or-later</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/api'
import { useReadingStore } from '@/store'
import { THEME_OPTIONS } from '@shared/constants'

const message = useMessage()
const dialog = useDialog()
const readingStore = useReadingStore()

const currentTheme = computed({
  get: () => readingStore.theme,
  set: (val: string) => readingStore.setTheme(val),
})

const fontSize = computed({
  get: () => readingStore.fontSize,
  set: (val: number) => readingStore.setFontSize(val),
})

const lineHeight = computed({
  get: () => readingStore.lineHeight,
  set: (val: number) => readingStore.setLineHeight(val),
})

const themeOptions = THEME_OPTIONS
const importInput = ref<HTMLInputElement | null>(null)
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

function setTheme(value: string) {
  readingStore.setTheme(value)
  applyThemeToDOM(value)
  window.electronAPI?.invoke?.('update-title-bar-overlay', value).catch(() => {})
}

function applyThemeToDOM(value: string) {
  const root = document.documentElement
  if (value === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', value)
  }
}

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function increaseLineHeight() { readingStore.increaseLineHeight() }
function decreaseLineHeight() { readingStore.decreaseLineHeight() }

async function exportData() {
  try {
    const data = await store.getAll()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `墨阅-backup-${new Date().toISOString().slice(0, 10)}.json`
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

function handleSystemThemeChange(e: MediaQueryListEvent) {
  if (readingStore.theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
  }
}

onMounted(() => {
  readingStore.loadSettings()
  applyThemeToDOM(readingStore.theme)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  mediaListener = handleSystemThemeChange
  media.addEventListener('change', mediaListener)
})

onUnmounted(() => {
  if (mediaListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaListener)
    mediaListener = null
  }
})
</script>

<style scoped>
.settings-page { position: relative; z-index: 1; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

.settings-container { max-width: 640px; }
.settings-section { margin-bottom: 32px; }
.section-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 16px;
  letter-spacing: 0.04em;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.theme-card {
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}
.theme-card:hover .theme-preview { transform: translateY(-2px); }
.theme-card.active .theme-preview { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand); }
.theme-card span { font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: block; }
.theme-card.active span { color: var(--brand); }

.theme-preview {
  height: 60px;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}
.theme-preview.dark { background: #1a1a1a; }
.theme-preview.light { background: #f0ede8; }
.theme-preview.sepia { background: #e8dcc8; }
.theme-preview.system { background: linear-gradient(135deg, #1a1a1a 50%, #f0ede8 50%); }

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}
.setting-item:last-child { border-bottom: none; }
.setting-item.danger { border-bottom-color: rgba(231, 76, 60, 0.2); }
.setting-label { display: flex; flex-direction: column; gap: 2px; }
.label-text { font-size: 14px; color: var(--text-primary); }
.label-desc { font-size: 12px; color: var(--text-muted); }

.setting-control { display: flex; align-items: center; gap: 8px; }
.size-btn {
  padding: 2px 10px;
  font-size: 14px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}
.size-btn:hover { border-color: var(--brand); }
.size-value {
  font-size: 14px;
  color: var(--text-secondary);
  min-width: 32px;
  text-align: center;
}

.about-content {
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-align: center;
}
.about-logo { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; }
.logo-icon { font-size: 28px; font-weight: 700; color: var(--brand); }
.logo-name { font-size: 20px; font-weight: 600; color: var(--text-primary); }
.about-version { font-size: 14px; color: var(--text-secondary); }
.about-desc { font-size: 14px; color: var(--text-muted); }
.about-license { font-size: 12px; color: var(--text-muted); opacity: 0.5; margin-top: 4px; }

.hidden { display: none; }

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
