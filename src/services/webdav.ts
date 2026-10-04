// ============================================
// WebDAV 同步服务 — 安全加密
// ============================================

import { store, network } from './index.js'
import { invoke } from '@tauri-apps/api/core'
import { logError } from '@engine/log/index.js'

const PASSWORD_SALT = 'moYue-reader-webdav-salt-v1'
const KEY_DERIVE_ITERATIONS = 50000

interface BackupItem {
  filename: string
  date: string
  deviceName: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function getDefaultDeviceName(): Promise<string> {
  try {
    const hostname = await invoke('get_hostname')
    if (typeof hostname === 'string' && hostname.trim()) return hostname.trim()
  } catch {
    // ignore
  }
  return 'desktop'
}

export const DEFAULT_WEBDAV_CONFIG: Record<string, unknown> = {
  server: '',
  username: '',
  password: '',
  folder: 'legado',
  deviceName: '',
  enabled: false,
}

async function deriveKeyFromDevice(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const deviceName = await getDeviceName()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(PASSWORD_SALT + deviceName),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(PASSWORD_SALT),
      iterations: KEY_DERIVE_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const encoded = { ...config }
  if (typeof encoded.password === 'string' && encoded.password) {
    try {
      const key = await deriveKeyFromDevice()
      const enc = new TextEncoder()
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(encoded.password)
      )
      const combined = new Uint8Array(iv.length + encrypted.byteLength)
      combined.set(iv)
      combined.set(new Uint8Array(encrypted), iv.length)
      encoded.password = bytesToBase64(combined)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('sync', 'frontend', `[WebDAV] 加密失败: ${msg}`)
      encoded.password = ''
    }
  }
  return encoded
}

export async function decryptConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const decoded = { ...config }
  if (typeof decoded.password === 'string' && decoded.password) {
    try {
      const combined = base64ToBytes(decoded.password)
      if (!combined) {
        logError('sync', 'frontend', '[WebDAV] 密码 base64 解码失败')
        decoded.password = ''
        return decoded
      }
      const iv = combined.slice(0, 12)
      const encrypted = combined.slice(12)
      const key = await deriveKeyFromDevice()
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted as BufferSource
      )
      decoded.password = new TextDecoder().decode(decrypted)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('sync', 'frontend', `[WebDAV] 解密失败: ${msg}`)
      decoded.password = ''
    }
  }
  return decoded
}

export async function getDeviceName(): Promise<string> {
  return getDefaultDeviceName()
}

export async function webdavRequest(
  config: Record<string, unknown>,
  method: string,
  path: string,
  body: unknown = null,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: string }> {
  const base = typeof config.server === 'string' ? config.server.replace(/\/+$/, '') : ''
  const folder = typeof config.folder === 'string' ? config.folder.replace(/^\/+/, '').replace(/\/+$/, '') : 'legado'
  const cleanPath = path.replace(/^\/+/, '')
  const url = base + '/' + folder + '/' + cleanPath
  const username = typeof config.username === 'string' ? config.username : ''
  const password = typeof config.password === 'string' ? config.password : ''
  const auth = btoa(username + ':' + password)
  const allHeaders = { Authorization: 'Basic ' + auth, ...headers }

  const bodyStr = typeof body === 'string' ? body : null
  const fetchOptions: { method: string; headers: Record<string, string>; timeout: number; body?: string } = {
    method,
    headers: allHeaders,
    timeout: 30000,
  }
  if (bodyStr !== null && bodyStr !== undefined) {
    fetchOptions.body = bodyStr
  }
  const res = await network.fetch(url, fetchOptions)
  return { status: 200, data: typeof res === 'string' ? res : JSON.stringify(res) }
}

/**
 * 从 XML 中提取所有 response 节点。
 * 修复：兼容任意命名空间前缀（<d:>、<D:>、<ns1:>、无前缀）。
 */
function extractResponses(xml: string): string[] {
  // 用正则提取 <X:response>...</X:response> 或 <response>...</response>
  const responses: string[] = []
  const regex = /<([a-zA-Z0-9_-]+:)?response\b[^>]*>([\s\S]*?)<\/([a-zA-Z0-9_-]+:)?response>/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(xml)) !== null) {
    responses.push(m[2] || '')
  }
  return responses
}

/**
 * 提取子元素的文本内容，兼容任意命名空间前缀。
 */
function extractChildText(xml: string, tagName: string): string {
  const regex = new RegExp(`<([a-zA-Z0-9_-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/([a-zA-Z0-9_-]+:)?${tagName}>`, 'i')
  const m = regex.exec(xml)
  return m && m[2] !== undefined ? m[2] : ''
}

export async function listBackups(config: Record<string, unknown>): Promise<BackupItem[]> {
  try {
    const res = await webdavRequest(config, 'PROPFIND', '', null, { Depth: '1' })
    const xml = res.data
    if (!xml.includes('multistatus') && !xml.includes('response')) return []

    const items: BackupItem[] = []
    const responseBlocks = extractResponses(xml)

    for (const block of responseBlocks) {
      const href = extractChildText(block, 'href')
      const displayName = extractChildText(block, 'displayname')
      const lastModified = extractChildText(block, 'getlastmodified')

      const name = displayName || href.split('/').filter(Boolean).pop() || ''
      if (!name || (!name.endsWith('.zip') && !name.endsWith('.json'))) continue

      const nameWithoutExt = name.replace(/\.(zip|json)$/, '')
      const parts = nameWithoutExt.split('-')
      const deviceName = parts.length >= 3 ? parts.slice(2).join('-') : 'unknown'

      items.push({ filename: name, date: lastModified, deviceName })
    }

    return items.sort((a, b) => b.filename.localeCompare(a.filename))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('sync', 'frontend', `[WebDAV] 列出备份失败: ${msg}`)
    return []
  }
}

export async function getLatestBackup(config: Record<string, unknown>): Promise<BackupItem | null> {
  const list = await listBackups(config)
  return list.length > 0 ? (list[0] || null) : null
}

export async function restoreBackup(
  config: Record<string, unknown>,
  filename: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const base = typeof config.server === 'string' ? config.server.replace(/\/+$/, '') : ''
    const folder = typeof config.folder === 'string' ? config.folder.replace(/^\/+/, '').replace(/\/+$/, '') : 'legado'
    const url = base + '/' + folder + '/' + filename
    const username = typeof config.username === 'string' ? config.username : ''
    const password = typeof config.password === 'string' ? config.password : ''
    const auth = btoa(username + ':' + password)
    const headers = { Authorization: 'Basic ' + auth }

    if (filename.endsWith('.json')) {
      const res = await network.fetch(url, { method: 'GET', headers, timeout: 30000 })
      const data = JSON.parse(typeof res === 'string' ? res : JSON.stringify(res))
      if (isRecord(data)) {
        // 修复：先收集所有 key-value，再批量写入（减少一次 IPC 开销）
        const entries = Object.entries(data)
        for (const [key, value] of entries) {
          await store.set(key, value)
        }
      }
      return { success: true, message: '恢复成功' }
    }

    const base64Data = await network.downloadBinary(url, headers)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(base64Data, { base64: true })
    const jsonFiles = zip.file(/\.json$/)
    if (!jsonFiles || jsonFiles.length === 0) {
      return { success: false, message: 'ZIP 中未找到 JSON 文件' }
    }

    // 修复：先收集所有待写入数据，再逐个写
    const pendingWrites: Array<{ key: string; value: unknown; isReplaceRule: boolean }> = []

    for (const file of jsonFiles) {
      const content = await file.async('string')
      try {
        const parsed = JSON.parse(content) as unknown
        const key = file.name.replace(/\.json$/, '').replace(/^.*\//, '')
        pendingWrites.push({ key, value: parsed, isReplaceRule: key === 'replaceRule' })
      } catch {
        continue
      }
    }

    for (const write of pendingWrites) {
      if (write.isReplaceRule) {
        const rawExisting = await store.get('replaceRule')
        const existing = Array.isArray(rawExisting) ? [...rawExisting] : []
        const incoming = Array.isArray(write.value) ? write.value : []
        const merged = [...existing]
        for (const rule of incoming) {
          const r = rule as Record<string, unknown>
          if (!merged.find((er) => {
            const e = er as Record<string, unknown>
            return e.name === r.name && e.pattern === r.pattern
          })) {
            merged.push(rule)
          }
        }
        await store.set('replaceRule', merged)
      } else {
        await store.set(write.key, write.value)
      }
    }

    return { success: true, message: '恢复成功' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: '恢复失败: ' + msg }
  }
}

export async function fullSync(
  config: Record<string, unknown>,
  localData?: Record<string, unknown>,
): Promise<{ success: boolean; message: string }> {
  try {
    const allData = localData || await store.getAll()
    const dataToSync = isRecord(allData) ? allData : {}
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    const keysToSync = [
      'bookshelf', 'bookSource', 'readingProgress', 'replaceRule',
      'bookGroup', 'txtTocRule', 'dictRule', 'keyboardAssists', 'rssSources',
    ]
    let syncedCount = 0

    for (const key of keysToSync) {
      const value = dataToSync[key]
      if (value !== undefined && value !== null) {
        zip.file(key + '.json', JSON.stringify(value, null, 2))
        syncedCount++
      }
    }

    if (syncedCount === 0) return { success: false, message: '没有数据可同步' }

    const zipData = await zip.generateAsync({ type: 'base64' })
    const device = typeof config.deviceName === 'string' ? config.deviceName : await getDeviceName()
    const filename = `backup${new Date().toISOString().slice(0, 10)}-${device}.zip`

    await webdavRequest(config, 'PUT', filename, zipData, { 'Content-Type': 'application/zip' })
    return { success: true, message: `备份上传成功: ${filename} (${syncedCount} 个文件)` }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: msg }
  }
}
