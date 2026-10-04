// ============================================
// 网络 API — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  responseType?: string
  sourceType?: number
}

export interface FetchWebViewOptions {
  headers?: Record<string, string>
  webJs?: string
  timeout?: number
  sourceType?: number
  preserveStyle?: boolean
}

interface FetchUrlResponse {
  status: number
  body: string
  headers: Record<string, string>
  url: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFetchUrlResponse(value: unknown): value is FetchUrlResponse {
  if (!isRecord(value)) return false
  return typeof value.status === 'number' && typeof value.body === 'string'
}

export const network = {
  fetch: async (url: string, options?: FetchOptions): Promise<string> => {
    const result: unknown = await invoke('fetch_url', {
      url,
      method: options?.method || 'GET',
      body: options?.body || null,
      headers: options?.headers || {},
      charset: null,
      useWebview: false,
      sourceType: options?.sourceType ?? 0,
      preserveStyle: false,
    })

    // 修复：后端返回结构化结果，这里提取 body
    if (isFetchUrlResponse(result)) {
      // 非 2xx 时抛错，对齐旧语义
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`HTTP ${result.status}`)
      }
      return result.body
    }

    // 兼容：旧后端返回字符串
    if (typeof result === 'string') {
      return result
    }

    return JSON.stringify(result)
  },

  /**
   * 获取完整响应（含状态码）。
   * 供需要检查 status 的调用方使用。
   */
  fetchFull: async (url: string, options?: FetchOptions): Promise<FetchUrlResponse> => {
    const result: unknown = await invoke('fetch_url', {
      url,
      method: options?.method || 'GET',
      body: options?.body || null,
      headers: options?.headers || {},
      charset: null,
      useWebview: false,
      sourceType: options?.sourceType ?? 0,
      preserveStyle: false,
    })

    if (isFetchUrlResponse(result)) {
      return result
    }

    if (typeof result === 'string') {
      return { status: 200, body: result, headers: {}, url }
    }

    return { status: 200, body: JSON.stringify(result), headers: {}, url }
  },

  fetchWebView: async (url: string, options?: FetchWebViewOptions): Promise<string> => {
    const result: unknown = await invoke('fetch_url', {
      url,
      method: 'GET',
      body: null,
      headers: options?.headers || {},
      charset: null,
      useWebview: true,
      webJs: options?.webJs || null,
      timeoutSecs: options?.timeout ? Math.ceil(options.timeout / 1000) : 30,
      sourceType: options?.sourceType ?? 0,
      preserveStyle: options?.preserveStyle ?? false,
    })

    if (isFetchUrlResponse(result)) {
      return result.body
    }

    if (typeof result === 'string') {
      return result
    }

    return JSON.stringify(result)
  },

  downloadBinary: (url: string, headers?: Record<string, string>): Promise<string> =>
    invoke('download_binary', { url, headers }),
}

export async function loginWebview(url: string, title?: string, timeoutSecs?: number): Promise<string> {
  return invoke('login_webview', { url, title, timeoutSecs })
}
