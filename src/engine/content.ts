import { getGlobalHttpClient } from './network/client.js'
import { getString } from './rule-parser/index.js'
import type { BookSource, Chapter } from '../shared/types.js'

export interface ContentOptions {
  redirectUrl?: string
  cachedHtml?: string
  nextChapterUrl?: string
  bookKind?: string
  book?: any
  _background?: boolean
}

const contentCache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

function isJsonString(str: string): boolean {
  const trimmed = str.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function safeParseJson(str: string): any {
  try { return JSON.parse(str) } catch { return null }
}

function parseRequestConfig(url: string, defaultHeaders: Record<string, string>): { url: string; method: string; headers: Record<string, string>; body: any } {
  let result = { url, method: 'GET' as string, headers: { ...defaultHeaders }, body: null as any }
  const commaIdx = url.lastIndexOf(',{')
  if (commaIdx > 0) {
    let depth = 0, jsonEnd = -1
    for (let i = commaIdx + 1; i < url.length; i++) {
      if (url[i] === '{') depth++
      else if (url[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break } }
    }
    if (jsonEnd > 0) {
      try {
        let configStr = url.substring(commaIdx + 1, jsonEnd + 1).trim().replace(/'/g, '"')
        const config = JSON.parse(configStr)
        result.url = url.substring(0, commaIdx).trim()
        if (config.method) result.method = config.method.toUpperCase()
        if (config.headers) result.headers = { ...defaultHeaders, ...config.headers }
        if (config.body) result.body = config.body
      } catch {}
    }
  }
  return result
}

async function fetchWithElectronAPI(url: string, options: any): Promise<any> {
  const api = (globalThis as any).electronAPI
  if (api && typeof api.fetch === 'function') return api.fetch(url, options)
  const httpClient = getGlobalHttpClient()
  return httpClient.request({
    url: options.url || url,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    timeout: options.timeout || 30000,
  })
}

async function fetchContent(source: BookSource, chapterUrl: string, options: ContentOptions): Promise<string> {
  const rule = source.ruleContent
  const headers = source.header ? JSON.parse(source.header) : {}
  let reqConfig = parseRequestConfig(chapterUrl, headers)
  if (reqConfig.method === 'POST' && reqConfig.body && !reqConfig.headers['Content-Type']) {
    reqConfig.headers['Content-Type'] = 'application/json'
  }
  if (reqConfig.body && typeof reqConfig.body === 'string') {
    try {
      const bodyObj = JSON.parse(reqConfig.body)
      if (bodyObj.ContentAnchorBatch?.[0] && !bodyObj.ContentAnchorBatch[0].BookID && options.bookKind) {
        bodyObj.ContentAnchorBatch[0].BookID = options.bookKind
      }
      reqConfig.body = bodyObj
    } catch (e) {}
  }

  console.log('[Content] 请求参数:', { url: reqConfig.url, method: reqConfig.method, headers: reqConfig.headers, body: typeof reqConfig.body === 'string' ? reqConfig.body.substring(0, 100) : JSON.stringify(reqConfig.body).substring(0, 100) })
  const response = await fetchWithElectronAPI(reqConfig.url, {
    method: reqConfig.method, headers: reqConfig.headers, body: reqConfig.body, timeout: 30000
  })
  console.log('[Content] 响应:', response.status)

  if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status)

  const html = response.data
  if (!html || typeof html !== 'string') throw new Error('内容为空')

  const isJson = isJsonString(html)
  const parsedData = isJson ? safeParseJson(html) : html
  const ctx = { source, baseUrl: source.url, book: options.book || {}, result: parsedData }

  // 正文标题（可选）
  if ((rule as any).title) {
    const titleResult = getString(parsedData, (rule as any).title, ctx)
    if (titleResult) {
      console.log('[Content] 提取标题:', titleResult)
    }
  }
  let content = getString(parsedData, rule.content || '', ctx)

  if (!content || !content.trim()) {
    if (!isJson) {
      content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n\s*\n/g, '\n\n')
        .split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n\n').trim()
    }
  }

  if (content.includes('<') && content.includes('>')) {
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n\s*\n/g, '\n\n')
      .split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n\n').trim()
  }

  if (!content || !content.trim()) throw new Error('正文为空')

  // 替换规则在渲染进程 Reader.vue 里应用，主进程跳过
  return content
}

export async function getContent(source: BookSource, chapterUrl: string, options: ContentOptions = {}): Promise<string> {
  if (!chapterUrl || typeof chapterUrl !== 'string' || !chapterUrl.trim()) return '章节链接无效'
  const rule = source.ruleContent
  if (!rule || !rule.content) return '书源缺少正文规则'

  const cacheKey = chapterUrl
  const cached = contentCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (!options._background) {
      fetchContent(source, chapterUrl, { ...options, _background: true }).then(newContent => {
        if (newContent && newContent !== cached.content) contentCache.set(cacheKey, { content: newContent, timestamp: Date.now() })
      }).catch(() => {})
    }
    return cached.content
  }

  try {
    const content = await fetchContent(source, chapterUrl, options)
    contentCache.set(cacheKey, { content, timestamp: Date.now() })
    return content
  } catch (err: any) { return '请求失败: ' + err.message }
}

export async function preloadChapters(source: BookSource, chapters: Chapter[], currentIndex: number): Promise<void> {
  const range = 3; const start = Math.min(currentIndex + 1, chapters.length - 1); const end = Math.min(start + range, chapters.length)
  if (start >= end) return
  const urls = chapters.slice(start, end).map(ch => ch.url).filter(Boolean)
  if (!urls.length) return
  const worker = async () => { while (urls.length) { const url = urls.shift(); if (!url) break; try { await getContent(source, url) } catch {} } }
  await Promise.allSettled([worker(), worker()])
}

export function getCacheStats() { return { size: contentCache.size } }
export function cleanExpiredCache(): number { let c = 0; const now = Date.now(); for (const [k, v] of contentCache) { if (now - v.timestamp > CACHE_TTL) { contentCache.delete(k); c++ } } return c }
export function clearContentCache(): void { contentCache.clear() }




