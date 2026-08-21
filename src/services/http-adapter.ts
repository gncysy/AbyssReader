// ============================================
// Tauri HTTP 适配器 — 实现 HttpClientAdapter 接口
// ============================================

import type { RequestConfig, ResponseData } from '@engine/types.js'
import type { HttpClientAdapter } from '@engine/network/client.js'

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err)
  }
  if (typeof err === 'string') return err
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error === 'string') return obj.error
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const tauriHttpAdapter: HttpClientAdapter = {
  async request(config: RequestConfig): Promise<ResponseData> {
    const { invoke } = await import('@tauri-apps/api/core')
    const bodyStr = config.body
      ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body))
      : null

    try {
      const data = await invoke('fetch_url', {
        url: config.url,
        method: config.method || 'GET',
        body: bodyStr,
        headers: config.headers || {},
        charset: config.charset || null,
        useWebview: config.useWebView || false,
        webJs: config.webJs || null,
        timeoutSecs: Math.ceil((config.timeout || 30000) / 1000),
        sourceType: config.sourceType ?? 0,
        preserveStyle: false,
      })

      return {
        status: 200,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        headers: {},
        url: config.url,
        duration: 0,
      }
    } catch (err) {
      throw new Error(formatError(err))
    }
  },
}

export function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}
