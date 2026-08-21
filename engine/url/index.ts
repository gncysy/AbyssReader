// ============================================
// URL 解析 — 对齐 Legado AnalyzeUrl + NetworkUtils
// ============================================

import { getJsRuntime } from '../parser/js-executor.js'
import type { UrlAnalysis, EngineBookSource, EngineBook, EngineChapter } from '../types.js'

const PAGE_PATTERN = /<(.*?)>/g
const PARAM_PATTERN = /\s*,\s*(?=\{)/

export interface UrlOption {
  method?: string
  charset?: string
  headers?: Record<string, string>
  body?: string | null
  origin?: string
  retry?: number
  type?: string
  webView?: boolean | string
  webJs?: string
  dnsIp?: string
  js?: string
  bodyJs?: string
  serverID?: number
  webViewDelayTime?: number
}

function formatJsValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' && Number.isInteger(val)) return String(val)
  if (typeof val === 'boolean') return String(val)
  return String(val)
}

export function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url.trim()

  const relativePathTrim = url.trim()

  if (/^https?:\/\//i.test(relativePathTrim)) return relativePathTrim
  if (/^\/\//.test(relativePathTrim)) return relativePathTrim
  if (/^data:/i.test(relativePathTrim)) return relativePathTrim
  if (relativePathTrim.toLowerCase().startsWith('javascript')) return ''

  // 修复：当 baseUrl 没有逗号时不应截断
  const commaIndex = baseUrl.indexOf(',')
  const cleanBase = commaIndex === -1 ? baseUrl.trim() : baseUrl.substring(0, commaIndex).trim()

  try {
    return new URL(relativePathTrim, cleanBase).toString()
  } catch {
    return relativePathTrim
  }
}

export function getBaseUrl(url: string): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) {
    const index = url.indexOf('/', 9)
    return index === -1 ? url : url.substring(0, index)
  }
  return null
}

export function getSubDomain(url: string): string {
  const baseUrl = getBaseUrl(url) || url
  try {
    const parsed = new URL(baseUrl)
    const host = parsed.hostname

    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host

    const parts = host.split('.')
    if (parts.length <= 2) return host
    const lastTwo = parts.slice(-2).join('.')
    if (parts.length === 3 && parts[0] === 'www') return lastTwo
    if (parts.length === 3) return host
    return lastTwo
  } catch {
    return url
  }
}

export function buildUrl(url: string, baseUrl: string, variables: Record<string, unknown> = {}): string {
  if (!url) return ''
  let result = url
  for (const [key, val] of Object.entries(variables)) {
    if (val === null || val === undefined) continue
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), encodeURIComponent(String(val)))
  }
  return resolveUrl(result, baseUrl)
}

function parseUrlOption(jsonStr: string): UrlOption | null {
  try {
    return JSON.parse(jsonStr) as UrlOption
  } catch {
    try {
      return JSON.parse(jsonStr.replace(/'/g, '"')) as UrlOption
    } catch {
      return null
    }
  }
}

function encodeQueryNonAscii(url: string): string {
  const queryIdx = url.indexOf('?')
  if (queryIdx === -1) return url
  const base = url.substring(0, queryIdx + 1)
  const query = url.substring(queryIdx + 1)
  const encoded = query.replace(/[^\x00-\x7F%]/g, (ch) => encodeURIComponent(ch))
  return base + encoded
}

export interface AnalyzeUrlOptions {
  baseUrl?: string
  key?: string
  page?: number
  source?: EngineBookSource
  book?: Partial<EngineBook>
  chapter?: Partial<EngineChapter>
  headerMap?: Record<string, string>
  speakText?: string
  speakSpeed?: number
}

export async function analyzeUrl(
  ruleUrl: string,
  options: AnalyzeUrlOptions = {},
): Promise<UrlAnalysis> {
  let baseUrl = options.baseUrl || ''
  const urlMatcher = PARAM_PATTERN.exec(baseUrl)
  if (urlMatcher) baseUrl = baseUrl.substring(0, urlMatcher.index)
  const hashIdx = baseUrl.indexOf('#')
  if (hashIdx !== -1) baseUrl = baseUrl.substring(0, hashIdx)

  const headerMap: Record<string, string> = {}
  if (options.headerMap) Object.assign(headerMap, options.headerMap)

  let ruleUrlProcessed = ruleUrl

  // 执行 @js: / <js>
  const jsMatcher = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi
  let jsStart = 0
  let jsResult = ruleUrlProcessed
  let jsMatch: RegExpExecArray | null
  while ((jsMatch = jsMatcher.exec(ruleUrlProcessed)) !== null) {
    if (jsMatch.index > jsStart) {
      const prefix = ruleUrlProcessed.substring(jsStart, jsMatch.index).trim()
      if (prefix) {
        jsResult = prefix.replace(/@result/g, jsResult)
      }
    }
    const jsCode = (jsMatch[2] !== undefined ? jsMatch[2] : jsMatch[1])?.trim() || ''
    if (jsCode) {
      const runtime = getJsRuntime()
      if (runtime) {
        try {
          const r = await runtime.execute(jsCode, {
            result: jsResult,
            baseUrl,
            source: options.source || {},
            book: options.book || {},
            page: options.page || 1,
            key: options.key || '',
            speakText: options.speakText || '',
            speakSpeed: options.speakSpeed || 0,
          })
          if (r !== null && r !== undefined && r !== '') {
            jsResult = String(r)
          }
        } catch {
          // ignore
        }
      }
    }
    jsStart = jsMatch.index + jsMatch[0].length
  }
  if (ruleUrlProcessed.length > jsStart) {
    const suffix = ruleUrlProcessed.substring(jsStart).trim()
    if (suffix) {
      jsResult = suffix.replace(/@result/g, jsResult)
    }
  }
  ruleUrlProcessed = jsResult

  // 先同步替换简单变量占位符
  if (options.key !== undefined && options.key !== null) {
    ruleUrlProcessed = ruleUrlProcessed.replace(/\{\{key\}\}/g, encodeURIComponent(String(options.key)))
  }
  if (options.page !== undefined && options.page !== null) {
    ruleUrlProcessed = ruleUrlProcessed.replace(/\{\{page\}\}/g, String(options.page))
  }
  if (options.speakText !== undefined && options.speakText !== null) {
    ruleUrlProcessed = ruleUrlProcessed.replace(/\{\{speakText\}\}/g, encodeURIComponent(String(options.speakText)))
  }
  if (options.speakSpeed !== undefined && options.speakSpeed !== null) {
    ruleUrlProcessed = ruleUrlProcessed.replace(/\{\{speakSpeed\}\}/g, String(options.speakSpeed))
  }

  // 剩余的 {{...}} 执行 JS（async 等待）
  if (ruleUrlProcessed.includes('{{') && ruleUrlProcessed.includes('}}')) {
    const templateRegex = /\{\{([\s\S]*?)\}\}/g
    let templateMatch: RegExpExecArray | null
    const runtime = getJsRuntime()

    while ((templateMatch = templateRegex.exec(ruleUrlProcessed)) !== null) {
      const jsCode = templateMatch[1]
      if (!jsCode || !jsCode.trim()) continue
      if (runtime) {
        try {
          const r = await runtime.execute(jsCode.trim(), {
            result: ruleUrlProcessed,
            baseUrl,
            source: options.source || {},
            book: options.book || {},
            page: options.page || 1,
            key: options.key || '',
          })
          const replacement = formatJsValue(r)
          ruleUrlProcessed = ruleUrlProcessed.substring(0, templateMatch.index) + replacement + ruleUrlProcessed.substring(templateMatch.index + templateMatch[0].length)
          templateRegex.lastIndex = templateMatch.index + replacement.length
        } catch {
          ruleUrlProcessed = ruleUrlProcessed.substring(0, templateMatch.index) + ruleUrlProcessed.substring(templateMatch.index + templateMatch[0].length)
          templateRegex.lastIndex = templateMatch.index
        }
      }
    }
  }

  // 替换页码 <page1,page2,page3>
  if (options.page !== undefined && options.page > 0) {
    ruleUrlProcessed = ruleUrlProcessed.replace(PAGE_PATTERN, (_m, pagesStr: string) => {
      const pages = pagesStr.split(',').map((s: string) => s.trim())
      const idx = options.page! - 1
      const page = pages[idx]
      return page !== undefined ? page : (pages[pages.length - 1] || '')
    })
  }

  // 分离 URL 和选项
  let urlNoOption = ruleUrlProcessed
  let urlOption: UrlOption | null = null
  const paramMatch = PARAM_PATTERN.exec(ruleUrlProcessed)
  if (paramMatch) {
    urlNoOption = ruleUrlProcessed.substring(0, paramMatch.index)
    urlOption = parseUrlOption(ruleUrlProcessed.substring(paramMatch.index + 1))
  }

  let url = resolveUrl(urlNoOption, baseUrl)
  const newBase = getBaseUrl(url)
  if (newBase) baseUrl = newBase

  url = encodeQueryNonAscii(url)

  const method: 'GET' | 'POST' = urlOption?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET'
  let body: string | null = null
  if (urlOption?.body !== undefined && urlOption.body !== null) {
    body = typeof urlOption.body === 'string' ? urlOption.body : JSON.stringify(urlOption.body)
  }
  if (urlOption?.headers) {
    for (const [k, v] of Object.entries(urlOption.headers)) {
      headerMap[k] = String(v)
    }
  }
  const charset = urlOption?.charset || null
  const retry = urlOption?.retry || 0
  const useWebView = urlOption?.webView !== undefined &&
    urlOption.webView !== null &&
    urlOption.webView !== '' &&
    urlOption.webView !== false &&
    urlOption.webView !== 'false'
  const webJs = urlOption?.webJs || null
  const bodyJs = urlOption?.bodyJs || null
  const serverID = urlOption?.serverID || null
  const webViewDelayTime = Math.max(0, urlOption?.webViewDelayTime || 0)

  if (urlOption?.js) {
    const runtime = getJsRuntime()
    if (runtime) {
      try {
        const r = await runtime.execute(urlOption.js, {
          result: url,
          baseUrl,
          source: options.source || {},
          book: options.book || {},
          page: options.page || 1,
          key: options.key || '',
        })
        if (r && typeof r === 'string' && r.trim()) {
          url = r.trim()
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    url,
    method,
    headers: headerMap,
    body,
    charset,
    retry,
    useWebView,
    webJs,
    serverID,
    baseUrl,
    bodyJs,
    webViewDelayTime,
  }
}
