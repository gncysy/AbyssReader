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

      <!-- ===== WebDAV 同步 ===== -->
      <section class="settings-section">
        <h2 class="section-title">WebDAV 同步</h2>
        <p class="section-desc">与开源阅读 (Legado) 无缝衔接，同步书架、书源和阅读进度</p>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">服务器地址</span>
            <span class="label-desc">支持坚果云、Nextcloud 等 WebDAV 服务</span>
          </div>
          <div class="setting-control">
            <input v-model="webdavConfig.server" type="text" class="input-text" placeholder="https://dav.jianguoyun.com/dav/" />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">账号</span>
            <span class="label-desc">WebDAV 用户名（坚果云为邮箱）</span>
          </div>
          <div class="setting-control">
            <input v-model="webdavConfig.username" type="text" class="input-text" placeholder="your@email.com" />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">密码</span>
            <span class="label-desc">应用专用密码（非登录密码），加密存储</span>
          </div>
          <div class="setting-control">
            <input v-model="webdavConfig.password" type="password" class="input-text" placeholder="应用专用密码" />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">子文件夹</span>
            <span class="label-desc">与 Legado 保持一致，默认 legado</span>
          </div>
          <div class="setting-control">
            <input v-model="webdavConfig.folder" type="text" class="input-text" placeholder="legado" />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">设备名称</span>
            <span class="label-desc">用于备份文件命名</span>
          </div>
          <div class="setting-control">
            <input v-model="webdavConfig.deviceName" type="text" class="input-text" placeholder="设备名" />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="label-text">启用同步</span>
            <span class="label-desc">开启后可在书架手动触发同步</span>
          </div>
          <div class="setting-control">
            <label class="toggle-switch">
              <input v-model="webdavConfig.enabled" type="checkbox" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="webdav-actions">
          <button class="btn-primary" :disabled="!webdavConfig.enabled || testing || syncing" @click="testWebDAV">
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn-primary" :disabled="!webdavConfig.enabled || testing || syncing" @click="syncToWebDAV">
            {{ syncing ? '同步中...' : '上传备份' }}
          </button>
          <button class="btn-secondary" :disabled="!webdavConfig.enabled || testing || syncing" @click="restoreLatestBackup">
            恢复最新备份
          </button>
          <button class="btn-secondary" :disabled="!webdavConfig.enabled || testing || syncing" @click="loadBackupList">
            刷新备份列表
          </button>
        </div>

        <div v-if="webdavStatus" class="webdav-status" :class="webdavStatus.type">
          {{ webdavStatus.message }}
        </div>

        <div v-if="backupList.length > 0" class="backup-list">
          <div class="backup-list-header">
            <span>📦 可用备份（共 {{ backupList.length }} 个）</span>
          </div>
          <div
            v-for="backup in backupList"
            :key="backup.filename"
            class="backup-item"
          >
            <span>{{ backup.date }} - {{ backup.deviceName }}</span>
            <span class="backup-status" v-if="backup.isLatest">最新</span>
            <button class="btn-restore" @click="restoreBackupFile(backup.filename)">恢复</button>
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
          <p class="about-version">v{{ appVersion }}</p>
          <p class="about-desc">桌面端小说阅读器 · 兼容开源阅读书源</p>
          <p class="about-license">GPL-3.0</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/api'
import { useReadingStore, useBookshelfStore } from '@/store'
import { THEME_OPTIONS } from '@shared/constants'
import {
  DEFAULT_WEBDAV_CONFIG,
  getDeviceName,
  webdavRequest,
  listBackups,
  getLatestBackup,
  createBackup,
  restoreBackup,
  fullSync,
  encryptConfig,
  decryptConfig,
  syncAllJSON,
  restoreAllJSON,
} from '@/services/webdav'

const message = useMessage()
const dialog = useDialog()
const readingStore = useReadingStore()
const bookshelfStore = useBookshelfStore()

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
const appVersion = '0.1.0'

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

// ===== WebDAV =====
const webdavConfig = ref({ ...DEFAULT_WEBDAV_CONFIG, deviceName: getDeviceName() })
const webdavStatus = ref<{ type: string; message: string } | null>(null)
const backupList = ref<any[]>([])
const testing = ref(false)
const syncing = ref(false)

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

// ===== 数据 =====
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

// ===== WebDAV 方法 =====
async function loadWebDAVConfig() {
  try {
    const saved = await store.get('webdavConfig')
    if (saved) {
      const config = decryptConfig(saved)
      webdavConfig.value = { ...DEFAULT_WEBDAV_CONFIG, ...config }
    }
  } catch (err) {
    console.warn('[Settings] 加载 WebDAV 配置失败:', err)
  }
}

async function saveWebDAVConfig() {
  try {
    const toSave = encryptConfig(webdavConfig.value)
    await store.set('webdavConfig', toSave)
  } catch (err) {
    console.error('[Settings] 保存 WebDAV 配置失败:', err)
  }
}

async function testWebDAV() {
  testing.value = true
  webdavStatus.value = null

  try {
    const config = webdavConfig.value
    const response = await webdavRequest(config, 'PROPFIND', '', null, { 'Depth': '0' })

    if (response.status === 207) {
      webdavStatus.value = { type: 'success', message: '连接成功！WebDAV 服务可用' }
      await loadBackupList()
    } else if (response.status === 401) {
      webdavStatus.value = { type: 'error', message: '认证失败，请检查账号和密码' }
    } else if (response.status === 404) {
      webdavStatus.value = { type: 'warning', message: '文件夹不存在，将自动创建' }
    } else {
      webdavStatus.value = { type: 'error', message: `连接失败: HTTP ${response.status}` }
    }
  } catch (err: any) {
    webdavStatus.value = { type: 'error', message: `连接失败: ${err.message}` }
  } finally {
    testing.value = false
    await saveWebDAVConfig()
  }
}

async function loadBackupList() {
  try {
    const list = await listBackups(webdavConfig.value)
    backupList.value = list.map((b, i) => ({ ...b, isLatest: i === 0 }))
    if (list.length === 0) {
      message.info('没有找到备份文件')
    } else {
      message.success(`找到 ${list.length} 个备份，最新: ${list[0].date}`)
    }
  } catch (err) {
    console.warn('[Settings] 加载备份列表失败:', err)
    message.error('加载备份列表失败: ' + err.message)
  }
}

async function syncToWebDAV() {
  syncing.value = true
  webdavStatus.value = null

  try {
    const localData = {
      bookshelf: await store.get('books'),
      bookSource: await store.get('sources'),
      searchHistory: await store.get('searchHistory'),
      readConfig: await store.get('readConfig'),
      txtTocRule: await store.get('txtTocRule'),
      dictRule: await store.get('dictRule'),
      themeConfig: await store.get('themeConfig'),
    }

    const result = await fullSync(webdavConfig.value, localData)

    if (result.success) {
      webdavStatus.value = { type: 'success', message: result.message }
      await loadBackupList()
    } else {
      webdavStatus.value = { type: 'error', message: result.message }
    }
  } catch (err: any) {
    webdavStatus.value = { type: 'error', message: `同步失败: ${err.message}` }
  } finally {
    syncing.value = false
  }
}

async function restoreLatestBackup() {
  const latest = await getLatestBackup(webdavConfig.value)
  if (!latest) {
    webdavStatus.value = { type: 'warning', message: '没有找到可恢复的备份' }
    return
  }
  await restoreBackupFile(latest.filename)
}

async function restoreBackupFile(filename: string) {
  syncing.value = true
  webdavStatus.value = null

  try {
    const result = await restoreBackup(webdavConfig.value, filename)

    if (result.success && result.details) {
      const data = result.details

      // 直接覆盖，不是合并
      if (data.bookshelf) {
        await store.set('books', data.bookshelf)
        console.log('[Settings] 已覆盖书架:', data.bookshelf.length, '本书')
      }
      if (data.bookSource) {
        await store.set('sources', data.bookSource)
        console.log('[Settings] 已覆盖书源:', data.bookSource.length, '个书源')
      }
      if (data.searchHistory) {
        await store.set('searchHistory', data.searchHistory)
      }
      if (data.readConfig) {
        await store.set('readConfig', data.readConfig)
      }
      if (data.txtTocRule) {
        await store.set('txtTocRule', data.txtTocRule)
      }
      if (data.dictRule) {
        await store.set('dictRule', data.dictRule)
      }
      if (data.themeConfig) {
        await store.set('themeConfig', data.themeConfig)
      }

      // 强制刷新书架
      await bookshelfStore.loadBooks()
      const sources = await store.get('sources')
      console.log('[Settings] 书源已刷新:', sources?.length || 0, '个')

      webdavStatus.value = {
        type: 'success',
        message: `恢复成功！书架 ${data.bookshelf?.length || 0} 本书，书源 ${data.bookSource?.length || 0} 个`
      }
      message.success(`恢复成功: ${filename}`)
    } else {
      webdavStatus.value = { type: 'error', message: result.message }
    }
  } catch (err: any) {
    webdavStatus.value = { type: 'error', message: `恢复失败: ${err.message}` }
  } finally {
    syncing.value = false
  }
}

watch(webdavConfig, () => {
  saveWebDAVConfig()
}, { deep: true })

// ===== 生命周期 =====
onMounted(() => {
  readingStore.loadSettings()
  applyThemeToDOM(readingStore.theme)
  loadWebDAVConfig()

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
.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
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
.theme-preview.system {
  background: linear-gradient(135deg, #1a1a1a 50%, #f0ede8 50%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
}

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

.input-text {
  padding: 6px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  width: 280px;
}
.input-text:focus { border-color: var(--brand); }
.input-text::placeholder { color: var(--text-muted); }

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--bg-hover);
  border-radius: 24px;
  transition: 0.3s;
}
.toggle-slider::before {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle-switch input:checked + .toggle-slider { background: var(--brand); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }

.webdav-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.webdav-status {
  margin-top: 12px;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 13px;
}
.webdav-status.success {
  background: rgba(76, 175, 80, 0.10);
  border: 1px solid rgba(76, 175, 80, 0.20);
  color: #4caf50;
}
.webdav-status.error {
  background: rgba(231, 76, 60, 0.10);
  border: 1px solid rgba(231, 76, 60, 0.20);
  color: #e74c3c;
}
.webdav-status.warning {
  background: rgba(243, 156, 18, 0.10);
  border: 1px solid rgba(243, 156, 18, 0.20);
  color: #f39c12;
}

.backup-list {
  margin-top: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.backup-list-header {
  padding: 8px 12px;
  background: var(--bg-hover);
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}
.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}
.backup-item:last-child { border-bottom: none; }
.backup-item:hover { background: var(--bg-hover); }
.backup-status {
  font-size: 10px;
  color: #4caf50;
  background: rgba(76, 175, 80, 0.10);
  padding: 1px 8px;
  border-radius: 4px;
}

.btn-restore {
  padding: 2px 12px;
  font-size: 12px;
  color: var(--brand);
  background: transparent;
  border: 1px solid var(--brand);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-restore:hover {
  background: var(--brand);
  color: #0d0d0d;
}

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
