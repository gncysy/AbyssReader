// ============================================
// 智能网络获取 — HTTP 失败自动降级 WebView
// ============================================

import { getGlobalHttpClient } from '@engine/network/client.js'
import { logInfo, logError, logWarn } from '@engine/log/index.js'
import { network } from './network.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { NETWORK } from '@/constants/index.js'
import type { BookSource } from '@/types'
import type { EngineBookSource } from '@engine/types.js'

const WEBVIEW_MIN_HTML_LENGTH = 100
const WEBVIEW_DECODE_MAX_ITERATIONS = 5
const NO_WEBVIEW_FALLBACK_STATUS = [400, 401, 403, 404, 410]

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | string
  headers?: Record<string, string>
  body?: string | null
  source?: BookSource | null
  timeout?: number
  preserveStyle?: boolean
  baseUrl?: string
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err)
  if (typeof err === 'string') return err
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error === 'string') return obj.error
    try { return JSON.stringify(err) } catch { return String(err) }
  }
  return String(err)
}

function decodeWebviewHtml(raw: string): string {
  let current = raw.trim()
  let iterations = 0
  while (iterations < WEBVIEW_DECODE_MAX_ITERATIONS) {
    if (current.startsWith('"') && current.endsWith('"') && current.length >= 2) {
      try {
        const inner = JSON.parse(current) as unknown
        if (typeof inner === 'string' && inner.length > 0 && inner !== current) {
          current = inner.trim()
          iterations++
          continue
        }
      } catch {
        break
      }
    }
    break
  }
  return current
}

function resolveAbsoluteUrl(url: string, baseUrl?: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (!baseUrl) return url
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

export async function fetchWithWebviewFallback(
  url: string,
  options: FetchOptions = {},
): Promise<string | null> {
  const httpClient = getGlobalHttpClient()
  const source = options.source || null
  const timeout = options.timeout || NETWORK.DEFAULT_TIMEOUT
  const absoluteUrl = resolveAbsoluteUrl(url, options.baseUrl || source?.bookSourceUrl || '')

  const sourceHeaders = source?.header
    ? await parseSourceHeader(toEngineBookSource(source))
    : {}
  const mergedHeaders = { ...sourceHeaders, ...(options.headers || {}) }

  try {
    const response = await httpClient.request({
      url: absoluteUrl,
      method: (options.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD',
      headers: mergedHeaders,
      body: options.body || null,
      timeout,
      sourceType: source?.bookSourceType ?? 0,
    })
    if (response.status >= 200 && response.status < 300) {
      return response.data as string
    }
    // 404 等明确错误不降级 WebView
    if (NO_WEBVIEW_FALLBACK_STATUS.includes(response.status)) {
      logWarn('network', 'frontend', `[fetch] HTTP ${response.status}，跳过 WebView 降级: ${absoluteUrl}`)
      return null
    }
    logInfo('network', 'frontend', `[fetch] HTTP ${response.status}，降级为 WebView: ${absoluteUrl}`)
  } catch (err: unknown) {
    const errorMsg = formatErrorMessage(err)
    logInfo('network', 'frontend', `[fetch] HTTP 请求失败: ${errorMsg}，降级为 WebView`)
  }

  try {
    const webviewHtml = await network.fetchWebView(absoluteUrl, {
      headers: mergedHeaders,
      timeout,
      sourceType: source?.bookSourceType ?? 0,
      preserveStyle: options.preserveStyle ?? true,
    })
    if (webviewHtml && webviewHtml.length > WEBVIEW_MIN_HTML_LENGTH) {
      const decoded = decodeWebviewHtml(webviewHtml)
      return decoded
    }
    logWarn('network', 'frontend', `[fetch] WebView 返回内容过短: ${webviewHtml?.length || 0} 字符`)
    return null
  } catch (err: unknown) {
    const errorMsg = formatErrorMessage(err)
    logError('network', 'frontend', `[fetch] WebView 降级失败: ${errorMsg}`)
    return null
  }
}
