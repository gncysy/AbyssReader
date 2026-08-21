<template><div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>WebDAV 同步</h2></header>
    <div class="setting-item"><div class="setting-label"><span class="label-text">服务器地址</span><span class="label-desc">支持坚果云、Nextcloud 等</span></div><input v-model="config.server" type="text" class="input-search" style="width:260px" placeholder="https://dav.jianguoyun.com/dav/" /></div>
    <div class="setting-item"><div class="setting-label"><span class="label-text">账号</span></div><input v-model="config.username" type="text" class="input-search" style="width:260px" /></div>
    <div class="setting-item"><div class="setting-label"><span class="label-text">密码</span><span class="label-desc">加密存储</span></div><input v-model="config.password" type="password" class="input-search" style="width:260px" /></div>
    <div class="setting-item"><div class="setting-label"><span class="label-text">子文件夹</span><span class="label-desc">默认 legado</span></div><input v-model="config.folder" type="text" class="input-search" style="width:260px" placeholder="legado" /></div>
    <div class="setting-item"><div class="setting-label"><span class="label-text">设备名称</span></div><input v-model="config.deviceName" type="text" class="input-search" style="width:260px" placeholder="desktop" /></div>
    <div class="webdav-actions">
      <button class="btn-primary" :disabled="testing" @click="testConnection">{{ testing ? '测试中...' : '测试连接' }}</button>
      <button class="btn-primary" :disabled="syncing" @click="uploadBackup">{{ syncing ? '上传中...' : '上传备份' }}</button>
      <button class="btn-secondary" :disabled="syncing" @click="loadBackupList">刷新备份列表</button>
      <button class="btn-secondary" :disabled="syncing || backupList.length === 0" @click="confirmRestoreLatest">恢复最新备份</button>
    </div>
    <div v-if="status" class="status-message" :class="status.type">{{ status.message }}</div>
    <div v-if="backupList.length > 0" class="backup-list"><div class="backup-header">可用备份（共 {{ backupList.length }} 个）</div>
      <div v-for="backup in backupList" :key="backup.filename" class="backup-item"><span class="backup-name">{{ backup.filename }}</span><span class="backup-date">{{ backup.date }}</span><button class="btn-secondary" style="padding:4px 14px;font-size:12px" @click="confirmRestoreFile(backup.filename)">恢复</button></div>
    </div>
  </div></template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/services'
import { isRecord } from '@/services/store.js'
import { useBookshelfStore } from '@/stores'
import { DEFAULT_WEBDAV_CONFIG, webdavRequest, listBackups, getLatestBackup, restoreBackup, fullSync, encryptConfig, decryptConfig, getDeviceName } from '@/services/webdav.js'
import BackButton from '@/components/common/BackButton.vue'

const SAVE_DEBOUNCE_MS = 800

const msg = useMessage()
const dialog = useDialog()
const bookshelfStore = useBookshelfStore()
const config = ref<Record<string, unknown>>({ ...DEFAULT_WEBDAV_CONFIG })
const status = ref<{ type: string; message: string } | null>(null)
const backupList = ref<{ filename: string; date: string; deviceName: string }[]>([])
const testing = ref(false)
const syncing = ref(false)

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function loadConfig(): Promise<void> {
  try {
    const saved = await store.get('webdavConfig')
    if (isRecord(saved)) {
      const decrypted = await decryptConfig(saved)
      config.value = { ...DEFAULT_WEBDAV_CONFIG, ...decrypted }
    }
    if (!config.value.deviceName) config.value.deviceName = await getDeviceName()
  } catch {
    config.value.deviceName = await getDeviceName()
  }
}

async function saveConfig(): Promise<void> {
  try {
    await store.set('webdavConfig', await encryptConfig(config.value))
  } catch {
    // ignore
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await saveConfig()
    saveTimer = null
  }, SAVE_DEBOUNCE_MS)
}

async function testConnection(): Promise<void> {
  testing.value = true
  status.value = null
  try {
    await saveConfig()
    const res = await webdavRequest(config.value, 'PROPFIND', '', null, { Depth: '0' })
    if (res.status === 207) {
      status.value = { type: 'success', message: '连接成功' }
      await loadBackupList()
    } else if (res.status === 401) status.value = { type: 'error', message: '认证失败' }
    else if (res.status === 404) status.value = { type: 'warning', message: '文件夹不存在，上传时会自动创建' }
    else status.value = { type: 'error', message: `HTTP ${res.status}` }
  } catch (err: unknown) {
    const e = err as Error
    status.value = { type: 'error', message: e.message }
  } finally {
    testing.value = false
  }
}

async function loadBackupList(): Promise<void> {
  try {
    const result = await listBackups(config.value)
    backupList.value = Array.isArray(result) ? result : []
    if (backupList.value.length === 0) msg.info('没有找到备份文件')
    else msg.success(`找到 ${backupList.value.length} 个备份`)
  } catch (err: unknown) {
    const e = err as Error
    msg.error('加载备份列表失败: ' + e.message)
  }
}

async function uploadBackup(): Promise<void> {
  syncing.value = true
  status.value = null
  try {
    const allKeys = await store.getAll()
    const localData: Record<string, unknown> = {}
    for (const key of Object.keys(allKeys)) localData[key] = allKeys[key]
    const result = await fullSync(config.value, localData)
    status.value = { type: result.success ? 'success' : 'error', message: result.message }
    if (result.success) await loadBackupList()
  } catch (err: unknown) {
    const e = err as Error
    status.value = { type: 'error', message: e.message }
  } finally {
    syncing.value = false
  }
}

async function confirmRestoreLatest(): Promise<void> {
  const latest = await getLatestBackup(config.value)
  if (!latest) {
    status.value = { type: 'warning', message: '没有可恢复的备份' }
    return
  }
  confirmRestoreFile(latest.filename)
}

function confirmRestoreFile(filename: string): void {
  dialog.warning({
    title: '确认恢复',
    content: `恢复将覆盖当前本地数据，确定恢复「${filename}」？`,
    positiveText: '恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      await restoreBackupFile(filename)
    },
  })
}

async function restoreBackupFile(filename: string): Promise<void> {
  syncing.value = true
  status.value = null
  try {
    const result = await restoreBackup(config.value, filename)
    if (result.success) {
      await bookshelfStore.loadBooks()
      status.value = { type: 'success', message: `已恢复: ${filename}` }
      msg.success('恢复成功')
    } else {
      status.value = { type: 'error', message: result.message }
    }
  } catch (err: unknown) {
    const e = err as Error
    status.value = { type: 'error', message: e.message }
  } finally {
    syncing.value = false
  }
}

watch(config, () => scheduleSave(), { deep: true })
onMounted(async () => { await loadConfig() })
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.setting-label { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); }
.webdav-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
.status-message { margin-top: 14px; padding: 12px 16px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
.status-message.success { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.2); color: #4caf50; }
.status-message.error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }
.status-message.warning { background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.2); color: #f39c12; }
.backup-list { margin-top: 18px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.backup-header { padding: 10px 14px; background: var(--bg-hover); font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: 500; }
.backup-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); transition: background 0.15s; }
.backup-item:last-child { border-bottom: none; }
.backup-item:hover { background: var(--bg-hover); }
.backup-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-date { color: var(--text-muted); font-size: 12px; flex-shrink: 0; }
</style>
