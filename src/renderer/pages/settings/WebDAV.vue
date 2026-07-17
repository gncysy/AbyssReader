<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>WebDAV 同步</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">服务器地址</span><span class="label-desc">支持坚果云、Nextcloud 等 WebDAV 服务</span></div>
        <input v-model="config.server" type="text" class="input-text" placeholder="https://dav.jianguoyun.com/dav/" aria-label="服务器地址" />
      </div>
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">账号</span><span class="label-desc">WebDAV 用户名（坚果云为邮箱）</span></div>
        <input v-model="config.username" type="text" class="input-text" placeholder="your@email.com" aria-label="账号" />
      </div>
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">密码</span><span class="label-desc">应用专用密码（非登录密码），加密存储</span></div>
        <input v-model="config.password" type="password" class="input-text" placeholder="应用专用密码" aria-label="密码" />
      </div>
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">子文件夹</span><span class="label-desc">与 Legado 保持一致，默认 legado</span></div>
        <input v-model="config.folder" type="text" class="input-text" placeholder="legado" aria-label="子文件夹" />
      </div>
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">设备名称</span><span class="label-desc">用于备份文件命名</span></div>
        <input v-model="config.deviceName" type="text" class="input-text" placeholder="设备名" aria-label="设备名称" />
      </div>
      <div class="setting-item">
        <div class="setting-label"><span class="label-text">启用同步</span><span class="label-desc">开启后可在书架手动触发同步</span></div>
        <label class="toggle-switch"><input v-model="config.enabled" type="checkbox" /><span class="toggle-slider"></span></label>
      </div>

      <div class="webdav-actions">
        <button class="btn-wd-primary" :disabled="!config.enabled || testing" @click="testWebDAV">{{ testing ? '测试中...' : '测试连接' }}</button>
        <button class="btn-wd-primary" :disabled="!config.enabled || syncing" @click="syncToWebDAV">{{ syncing ? '同步中...' : '上传备份' }}</button>
        <button class="btn-wd-secondary" :disabled="!config.enabled || syncing" @click="restoreLatestBackup">恢复最新备份</button>
        <button class="btn-wd-secondary" :disabled="!config.enabled || syncing" @click="loadBackupList">刷新备份列表</button>
      </div>

      <div v-if="status" class="status-message" :class="status.type">{{ status.message }}</div>

      <div v-if="backupList.length > 0" class="backup-list">
        <div class="backup-list-header">可用备份（共 {{ backupList.length }} 个）</div>
        <div v-for="backup in backupList" :key="backup.filename" class="backup-item">
          <span>{{ backup.date }} - {{ backup.deviceName }}</span>
          <span v-if="backup.isLatest" class="badge-latest">最新</span>
          <button class="btn-restore" @click="restoreBackupFile(backup.filename)">恢复</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/api'
import { useBookshelfStore } from '@/store'
import {
  DEFAULT_WEBDAV_CONFIG, getDeviceName, webdavRequest, listBackups,
  getLatestBackup, restoreBackup, fullSync, encryptConfig, decryptConfig,
} from '@/services/webdav'

const message = useMessage()
const bookshelfStore = useBookshelfStore()

const config = ref({ ...DEFAULT_WEBDAV_CONFIG, deviceName: getDeviceName() })
const status = ref<{ type: string; message: string } | null>(null)
const backupList = ref<any[]>([])
const testing = ref(false)
const syncing = ref(false)

async function loadConfig() {
  try {
    const saved = await store.get('webdavConfig')
    if (saved) config.value = { ...DEFAULT_WEBDAV_CONFIG, ...decryptConfig(saved) }
  } catch (err: any) { console.warn('[WebDAV] 加载配置失败:', err) }
}

async function saveConfig() { try { await store.set('webdavConfig', encryptConfig(config.value)) } catch (err: any) {} }

async function testWebDAV() {
  testing.value = true; status.value = null
  try {
    const c = config.value
    const response = await webdavRequest(c, 'PROPFIND', '', null, { 'Depth': '0' })
    if (response.status === 207) { status.value = { type: 'success', message: '连接成功' }; await loadBackupList() }
    else if (response.status === 401) status.value = { type: 'error', message: '认证失败，请检查账号和密码' }
    else if (response.status === 404) status.value = { type: 'warning', message: '文件夹不存在，将自动创建' }
    else status.value = { type: 'error', message: `连接失败: HTTP ${response.status}` }
  } catch (err: any) { status.value = { type: 'error', message: `连接失败: ${err.message}` } }
  finally { testing.value = false; await saveConfig() }
}

async function loadBackupList() {
  try {
    const list = await listBackups(config.value)
    backupList.value = list.map((item, i) => ({ ...item, isLatest: i === 0 }))
    if (!list.length) message.info('没有找到备份文件')
    else message.success(`找到 ${list.length} 个备份`)
  } catch (err: any) { message.error('加载备份列表失败: ' + err.message) }
}

async function syncToWebDAV() {
  syncing.value = true; status.value = null
  try {
    const allKeys = await store.getAll()
    const bookProgress: Record<string, any> = {}
    if (allKeys) {
      for (const key of Object.keys(allKeys)) {
        if (key.startsWith('bookProgress_')) {
          bookProgress[key] = allKeys[key]
        }
      }
    }
    const localData = {
      bookshelf: await store.get('books'),
      bookSource: await store.get('sources'),
      readRecord: await store.get('readRecords'),
      bookProgress,
      searchHistory: await store.get('searchHistory'),
      readConfig: await store.get('readConfig'),
      txtTocRule: await store.get('txtTocRule'),
      dictRule: await store.get('dictRule'),
      themeConfig: await store.get('themeConfig'),
    }
    const result = await fullSync(config.value, localData)
    if (result.success) { status.value = { type: 'success', message: result.message }; await loadBackupList() }
    else status.value = { type: 'error', message: result.message }
  } catch (err: any) { status.value = { type: 'error', message: `同步失败: ${err.message}` } }
  finally { syncing.value = false }
}

async function restoreLatestBackup() {
  const latest = await getLatestBackup(config.value)
  if (!latest) { status.value = { type: 'warning', message: '没有找到可恢复的备份' }; return }
  await restoreBackupFile(latest.filename)
}

async function restoreBackupFile(filename: string) {
  syncing.value = true; status.value = null
  try {
    const result = await restoreBackup(config.value, filename)
    if (result.success && result.details) {
      const data = result.details

      if (data.bookSource) {
        const rawSources = Array.isArray(data.bookSource) ? data.bookSource : [data.bookSource]
        await store.set('sources', rawSources)
      }

      if (data.bookshelf) {
        const currentSources: any[] = await store.get('sources') || []
        const sourceMap: Record<string, any> = {}
        currentSources.forEach(source => {
          if (source.bookSourceName) sourceMap[source.bookSourceName] = source
        })

        const fixedBooks = data.bookshelf.map((book: any) => {
          if (book.originName && sourceMap[book.originName]) {
            const src = sourceMap[book.originName]
            book.sourceName = src.bookSourceName || src.name || ''
            return book
          }
          return book
        })

        await store.set('books', fixedBooks)
      }

      if (data.readRecord) {
        const existing = await store.get('readRecords') || []
        const merged = (await import('@shared/read-record')).mergeReadRecords(existing, data.readRecord)
        await store.set('readRecords', merged)
      }
      if (data.bookProgress) {
        for (const [key, value] of Object.entries(data.bookProgress)) {
          await store.set(key, value)
        }
      }
      if (data.searchHistory) await store.set('searchHistory', data.searchHistory)
      if (data.readConfig) await store.set('readConfig', data.readConfig)
      if (data.txtTocRule) await store.set('txtTocRule', data.txtTocRule)
      if (data.dictRule) await store.set('dictRule', data.dictRule)
      if (data.themeConfig) await store.set('themeConfig', data.themeConfig)

      await bookshelfStore.loadBooks()
      message.success(`恢复成功: ${filename}`)
      status.value = { type: 'success', message: `恢复成功: ${filename}` }
    } else {
      status.value = { type: 'error', message: result.message }
    }
  } catch (err: any) { status.value = { type: 'error', message: `恢复失败: ${err.message}` } }
  finally { syncing.value = false }
}

watch(config, () => saveConfig(), { deep: true })
onMounted(() => { loadConfig() })
</script>

<style scoped>
.input-text { width: 260px; }
.webdav-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }

.status-message { margin-top: 14px; padding: 12px 16px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
.status-message.success { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.2); color: #4caf50; }
.status-message.error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }
.status-message.warning { background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.2); color: #f39c12; }

.backup-list { margin-top: 18px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.backup-list-header { padding: 10px 14px; background: var(--bg-hover); font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: var(--font-medium); }
.backup-item { display: flex; align-items: center; gap: 12px; padding: 8px 14px; font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); transition: background 0.15s var(--ease-out); }
.backup-item:last-child { border-bottom: none; }
.backup-item:hover { background: var(--bg-hover); }

.btn-restore {
  padding: 4px 14px; font-size: 12px; color: var(--brand);
  background: transparent; border: 1px solid var(--brand);
  border-radius: var(--radius-sm); cursor: pointer; margin-left: auto;
  transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
  font-weight: var(--font-medium);
}
.btn-restore:hover { background: var(--brand); color: #0f0f0f; transform: translateY(-1px); }
.btn-restore:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
</style>