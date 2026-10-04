// ============================================
// 智能网络获取 — HTTP 失败自动降级 WebView
// ============================================

import { getGlobalHttpClient } from '@engine/network/client.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
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
  // data: URL 保持原样，不参与 base 拼接
  if (url.startsWith('data:')) return url
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

/**
 * base64 字符串 → 字节数组。
 * 兼容 URL-safe base64（`-` `_`）和标准 base64（`+` `/`）。
 */
function base64ToBytes(base64: string): Uint8Array {
  // 归一化：URL-safe → 标准
  let normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  // 补 padding
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return new Uint8Array(0)
  }
}

/**
 * 字节数组 → 小写 hex 字符串。
 * 对齐 Legado 的 `HexUtil.encodeHexStr`。
 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += ('0' + bytes[i]!.toString(16)).slice(-2)
  }
  return hex
}

/**
 * 处理 Legado 的 `data:` URL。
 *
 * 语义（对齐 Legado AnalyzeUrl.getByteArrayIfDataUri）：
 * - URL 形如 `data:<声明>;base64,<base64内容>`
 * - 提取 base64 部分，解码为字节数组
 * - 再 hex 编码为字符串返回（因为 Legado 的 getStrResponseAwait
 *   在 type != null 时走 HexUtil.encodeHexStr(getByteArrayAwait())）
 * - **不发任何 HTTP 请求**
 *
 * 书源侧 fqMarkText 会检测 hex 字符串并解码回 UTF-8 文本。
 *
 * 返回：
 * - 匹配 data:base64 格式 → hex 字符串
 * - 其他（data:text/plain,xxx 等非 base64）→ null，调用方继续走 HTTP（会失败）
 */
function handleDataUrl(url: string): string | null {
  if (!url.startsWith('data:')) return null

  // 只匹配 base64 格式：data:<mime/声明>;base64,<内容>
  const match = /^data:[^,]*;base64,(.+)$/is.exec(url)
  if (!match || !match[1]) {
    return null
  }

  const base64Content = match[1].trim()
  const bytes = base64ToBytes(base64Content)
  if (bytes.length === 0) {
    logWarn('network', 'frontend', `[fetch] data: URL base64 解码为空，长度=${base64Content.length}`)
    return ''
  }

  const hex = bytesToHex(bytes)
  logInfo('network', 'frontend', `[fetch] data: URL 解码完成: ${bytes.length} 字节 → ${hex.length} 字符 hex`)
  return hex
}

export async function fetchWithWebviewFallback(
  url: string,
  options: FetchOptions = {},
): Promise<string | null> {
  // ─── 第一优先级：data: URL ───
  // 在任何网络操作之前处理，不发 HTTP 请求
  const dataUrlResult = handleDataUrl(url)
  if (dataUrlResult !== null) {
    return dataUrlResult
  }

  const httpClient = getGlobalHttpClient()
  const runtime = getJsRuntime()
  const source = options.source || null
  const timeout = options.timeout || NETWORK.DEFAULT_TIMEOUT
  const absoluteUrl = resolveAbsoluteUrl(url, options.baseUrl || source?.bookSourceUrl || '')

  const sourceHeaders = source?.header
    ? await parseSourceHeader(toEngineBookSource(source), runtime)
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
