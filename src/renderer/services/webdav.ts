/**
 * WebDAV 同步服务 - 与开源阅读 Legado 无缝衔接
 */

import JSZip from 'jszip'
import CryptoJS from 'crypto-js'

const SECRET_KEY = 'abyss-reader-webdav-2026'

function encrypt(text: string): string {
  if (!text) return ''
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString()
}

function decrypt(encrypted: string): string {
  if (!encrypted) return ''
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch {
    return ''
  }
}

export interface WebDAVConfig {
  server: string
  username: string
  password: string
  folder: string
  deviceName: string
  enabled: boolean
  autoSync: boolean
}

export interface WebDAVConfigStorage {
  server: string
  username: string
  password: string
  folder: string
  deviceName: string
  enabled: boolean
  autoSync: boolean
}

export interface BackupInfo {
  filename: string
  date: string
  deviceName: string
  timestamp: number
  isLatest?: boolean
}

export interface SyncResult {
  success: boolean
  message: string
  details?: Record<string, any>
}

export const DEFAULT_WEBDAV_CONFIG: WebDAVConfig = {
  server: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  folder: 'legado',
  deviceName: '',
  enabled: false,
  autoSync: false,
}

export function getDeviceName(): string {
  try {
    const os = require('os')
    return os.hostname() || '未知设备'
  } catch {
    return '未知设备'
  }
}

export function encryptConfig(config: WebDAVConfig): WebDAVConfigStorage {
  return { ...config, password: encrypt(config.password) }
}

export function decryptConfig(stored: WebDAVConfigStorage): WebDAVConfig {
  return { ...stored, password: decrypt(stored.password) }
}

export async function webdavRequest(
  config: WebDAVConfig,
  method: string,
  path: string,
  body?: string | ArrayBuffer | null,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; data: string; headers: Record<string, string> }> {
  const baseUrl = config.server.replace(/\/+$/, '')
  const folder = config.folder.replace(/^\/+/, '').replace(/\/+$/, '')
  const url = `${baseUrl}/${folder}/${path.replace(/^\/+/, '')}`
  const auth = btoa(`${config.username}:${config.password}`)

  const headers: Record<string, string> = {
    'Authorization': `Basic ${auth}`,
    'Accept': '*/*',
    ...extraHeaders,
  }

  if (body) {
    headers['Content-Type'] = 'application/octet-stream'
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  })

  const text = await response.text()

  return {
    status: response.status,
    data: text,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

export async function listDirectory(
  config: WebDAVConfig,
  path: string = ''
): Promise<string[]> {
  try {
    const response = await webdavRequest(config, 'PROPFIND', path, null, { 'Depth': '1' })
    if (response.status === 404) return []
    if (response.status !== 207) return []

    const items: string[] = []
    const hrefMatches = response.data.match(/<d:href>[^<]*?([^<]+)<\/d:href>/g)
    if (hrefMatches) {
      for (const match of hrefMatches) {
        const href = match.replace(/<[^>]+>/g, '').trim()
        if (href && !href.endsWith('/')) {
          const parts = href.split('/')
          const filename = parts[parts.length - 1]
          if (filename) {
            items.push(filename)
          }
        }
      }
    }
    return items
  } catch {
    return []
  }
}

export async function uploadFile(
  config: WebDAVConfig,
  remotePath: string,
  content: string | object
): Promise<boolean> {
  try {
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    const encoder = new TextEncoder()
    const buffer = encoder.encode(data)

    const response = await webdavRequest(config, 'PUT', remotePath, buffer)
    return response.status === 201 || response.status === 204
  } catch {
    return false
  }
}

export async function downloadFile(
  config: WebDAVConfig,
  remotePath: string
): Promise<string | ArrayBuffer | null> {
  try {
    const baseUrl = config.server.replace(/\/+$/, '')
    const folder = config.folder.replace(/^\/+/, '').replace(/\/+$/, '')
    const url = `${baseUrl}/${folder}/${remotePath.replace(/^\/+/, '')}`
    const auth = btoa(`${config.username}:${config.password}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': '*/*'
      }
    })

    if (response.status === 200) {
      const contentType = response.headers.get('Content-Type') || ''
      if (contentType.includes('zip') || remotePath.endsWith('.zip')) {
        return await response.arrayBuffer()
      }
      return await response.text()
    }
    if (response.status === 404) return null
    return null
  } catch {
    return null
  }
}

export async function listBackups(config: WebDAVConfig): Promise<BackupInfo[]> {
  const files = await listDirectory(config, '')
  const backups: BackupInfo[] = []
  const pattern = /^backup(\d{4}-\d{2}-\d{2})-(.+)\.zip$/

  for (const file of files) {
    const decoded = decodeURIComponent(file)
    const match = decoded.match(pattern)
    if (match) {
      const dateStr = match[1]
      const parts = dateStr.split('-').map(Number)
      const timestamp = new Date(parts[0], parts[1] - 1, parts[2]).getTime()
      backups.push({
        filename: file,
        date: dateStr,
        deviceName: match[2],
        timestamp: timestamp,
      })
    }
  }

  return backups.sort((a, b) => b.timestamp - a.timestamp)
}

export async function getLatestBackup(config: WebDAVConfig): Promise<BackupInfo | null> {
  const backups = await listBackups(config)
  return backups.length > 0 ? backups[0] : null
}

export async function createBackup(
  config: WebDAVConfig,
  data: Record<string, any>
): Promise<SyncResult> {
  try {
    const date = new Date().toISOString().slice(0, 10)
    const deviceName = config.deviceName || getDeviceName()
    const filename = `backup${date}-${deviceName}.zip`

    const zip = new JSZip()
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        zip.file(`${key}.json`, JSON.stringify(value, null, 2))
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const buffer = await zipBlob.arrayBuffer()

    const response = await webdavRequest(config, 'PUT', filename, buffer)
    if (response.status === 201 || response.status === 204) {
      return { success: true, message: `备份成功: ${filename}` }
    }
    return { success: false, message: `备份失败: HTTP ${response.status}` }
  } catch (err: any) {
    return { success: false, message: `备份失败: ${err.message}` }
  }
}

export async function restoreBackup(
  config: WebDAVConfig,
  filename: string
): Promise<SyncResult> {
  try {
    const data = await downloadFile(config, filename)
    if (!data) {
      return { success: false, message: '下载备份文件失败' }
    }

    const zip = await JSZip.loadAsync(data)
    const result: Record<string, any> = {}

    for (const [path, file] of Object.entries(zip.files)) {
      if (!file.dir) {
        const name = path.replace(/\.json$/, '')
        const content = await file.async('string')
        try {
          result[name] = JSON.parse(content)
        } catch {
          result[name] = content
        }
      }
    }

    return {
      success: true,
      message: `恢复成功: ${filename}`,
      details: result,
    }
  } catch (err: any) {
    console.error('[WebDAV] 恢复失败:', err)
    return { success: false, message: `恢复失败: ${err.message}` }
  }
}

export async function fullSync(
  config: WebDAVConfig,
  localData: Record<string, any>
): Promise<SyncResult> {
  try {
    const results: Record<string, any> = {}
    const files = ['bookshelf', 'bookSource', 'searchHistory', 'readConfig', 'txtTocRule', 'dictRule', 'themeConfig']

    for (const name of files) {
      if (localData[name]) {
        const success = await uploadFile(config, `${name}.json`, localData[name])
        results[name] = success ? 'uploaded' : 'failed'
      }
    }

    const backupResult = await createBackup(config, localData)
    results.backup = backupResult.success ? 'created' : 'failed'

    const failed = Object.values(results).filter(r => r === 'failed').length
    if (failed === 0) {
      return { success: true, message: '全量同步成功', details: results }
    } else {
      return { success: false, message: `部分同步失败 (${failed} 项)`, details: results }
    }
  } catch (err: any) {
    return { success: false, message: `同步失败: ${err.message}` }
  }
}
