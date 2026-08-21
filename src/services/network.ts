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

export const network = {
  fetch: (url: string, options?: FetchOptions): Promise<string> =>
    invoke('fetch_url', {
      url,
      method: options?.method || 'GET',
      body: options?.body || null,
      headers: options?.headers || {},
      charset: null,
      useWebview: false,
      sourceType: options?.sourceType ?? 0,
      preserveStyle: false,
    }),

  fetchWebView: (url: string, options?: FetchWebViewOptions): Promise<string> =>
    invoke('fetch_url', {
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
    }),

  downloadBinary: (url: string, headers?: Record<string, string>): Promise<string> =>
    invoke('download_binary', { url, headers }),
}

export async function loginWebview(url: string, title?: string, timeoutSecs?: number): Promise<string> {
  return invoke('login_webview', { url, title, timeoutSecs })
}
