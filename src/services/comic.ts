// ============================================
// 漫画图片服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'
import type { ComicImage } from '@engine/business/comic/index.js'

interface ComicFetchResult {
  url: string
  cached: boolean
  data?: string
  direct?: boolean
  src?: string
}

function isComicFetchResult(value: unknown): value is ComicFetchResult {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.url === 'string'
}

interface ParsedImageUrl {
  cleanUrl: string
  extraHeaders: Record<string, string>
}

const parsedUrlCache = new Map<string, ParsedImageUrl>()
const PARSED_CACHE_MAX = 500

function parseImageUrl(url: string): ParsedImageUrl {
  const cached = parsedUrlCache.get(url)
  if (cached) return cached

  const commaIdx = url.indexOf(',{')
  let result: ParsedImageUrl
  if (commaIdx === -1) {
    result = { cleanUrl: url, extraHeaders: {} }
  } else {
    const cleanUrl = url.substring(0, commaIdx)
    const optionsStr = url.substring(commaIdx + 1)
    try {
      const options = JSON.parse(optionsStr) as Record<string, unknown>
      const headers = (options.headers as Record<string, string>) || {}
      result = { cleanUrl, extraHeaders: headers }
    } catch {
      result = { cleanUrl, extraHeaders: {} }
    }
  }

  if (parsedUrlCache.size >= PARSED_CACHE_MAX) {
    const firstKey = parsedUrlCache.keys().next().value
    if (firstKey !== undefined) parsedUrlCache.delete(firstKey)
  }
  parsedUrlCache.set(url, result)
  return result
}

/**
 * 解析 header 字段。
 * 书源的 header 可能是字符串（JSON 编码）或对象。
 */
function parseHeaderValue(headerVal: unknown): Record<string, string> {
  if (!headerVal) return {}
  if (typeof headerVal === 'object' && !Array.isArray(headerVal)) {
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(headerVal as Record<string, unknown>)) {
      if (v !== null && v !== undefined) result[k] = String(v)
    }
    return result
  }
  if (typeof headerVal === 'string') {
    try {
      const parsed = JSON.parse(headerVal) as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== null && v !== undefined) result[k] = String(v)
      }
      return result
    } catch {
      try {
        const parsed = JSON.parse(headerVal.replace(/'/g, '"')) as Record<string, unknown>
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== null && v !== undefined) result[k] = String(v)
        }
        return result
      } catch {
        return {}
      }
    }
  }
  return {}
}

/**
 * 合并 source JSON 与额外 headers。
 * 修复：原实现把 source.header（字符串）当对象展开，导致 header 被破坏。
 * 现在先解析 header 字符串，再合并。
 */
function mergeSourceJson(sourceJson: string, extraHeaders: Record<string, string>): string {
  if (Object.keys(extraHeaders).length === 0) return sourceJson
  try {
    const source = JSON.parse(sourceJson) as Record<string, unknown>
    // 解析现有 header（可能是字符串或对象）
    const existingHeaders = parseHeaderValue(source.header)
    // 合并
    const mergedHeaders: Record<string, string> = { ...existingHeaders }
    for (const [k, v] of Object.entries(extraHeaders)) {
      // 额外 headers 优先
      mergedHeaders[k] = v
    }
    // 写回为对象（Rust 端 build_headers 支持对象和字符串两种格式）
    source.header = mergedHeaders
    return JSON.stringify(source)
  } catch {
    return sourceJson
  }
}

export async function proxyCover(url: string, sourceJson: string): Promise<string> {
  const { cleanUrl, extraHeaders } = parseImageUrl(url)
  const mergedSource = mergeSourceJson(sourceJson, extraHeaders)

  try {
    const result = await invoke('proxy_image', { url: cleanUrl, sourceJson: mergedSource })
    return typeof result === 'string' ? result : cleanUrl
  } catch {
    // 兜底：直接 fetch（不带 headers，可能失败）
    try {
      const response = await fetch(cleanUrl, { mode: 'no-cors' })
      if (response.ok) {
        const blob = await response.blob()
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
      }
    } catch {
      // ignore
    }
    return cleanUrl
  }
}

const COMIC_RETRY_DELAY_MS = 500

export async function loadSingleImage(
  item: ComicImage,
  sourceJson: string,
  comicId: string,
): Promise<void> {
  const { cleanUrl, extraHeaders } = parseImageUrl(item.url)
  const mergedSource = mergeSourceJson(sourceJson, extraHeaders)

  while (item.retries > 0 && item.status !== 'loaded') {
    try {
      const result = await invoke('comic_fetch_image', {
        url: cleanUrl,
        sourceJson: mergedSource,
        comicId,
      })
      if (isComicFetchResult(result)) {
        if (result.data) { item.data = result.data; item.status = 'loaded'; return }
        if (result.direct && result.src) { item.directUrl = result.src; item.status = 'loaded'; return }
      }
      item.retries--
    } catch {
      item.retries--
      if (item.retries <= 0) { item.status = 'error'; return }
      await new Promise((r) => setTimeout(r, COMIC_RETRY_DELAY_MS))
    }
  }
  if (item.status !== 'loaded') item.status = 'error'
}

const COMIC_CONCURRENCY = 2

export async function loadComicImages(
  images: ComicImage[],
  sourceJson: string,
  comicId: string,
  concurrency = COMIC_CONCURRENCY,
): Promise<void> {
  const queue = [...images]
  const workers: Promise<void>[] = []
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      await loadSingleImage(item, sourceJson, comicId)
    }
  }
  for (let i = 0; i < Math.min(concurrency, images.length); i++) workers.push(worker())
  await Promise.all(workers)
}

export async function prefetchComicImages(
  urls: string[],
  sourceJson: string,
  comicId: string,
): Promise<void> {
  invoke('comic_prefetch_images', { urls, sourceJson, comicId }).catch(() => {})
}
