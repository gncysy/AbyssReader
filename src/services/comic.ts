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

/**
 * 拆分漫画图片 URL 中的 ,{...} 选项。
 * 例如：https://img.example.com/1.jpg,{"headers":{"Referer":"https://example.com/"}}
 * 返回干净 URL 和额外 headers。
 */
function parseImageUrl(url: string): { cleanUrl: string; extraHeaders: Record<string, string> } {
  const commaIdx = url.indexOf(',{')
  if (commaIdx === -1) return { cleanUrl: url, extraHeaders: {} }
  const cleanUrl = url.substring(0, commaIdx)
  const optionsStr = url.substring(commaIdx + 1)
  try {
    const options = JSON.parse(optionsStr) as Record<string, unknown>
    const headers = (options.headers as Record<string, string>) || {}
    return { cleanUrl, extraHeaders: headers }
  } catch {
    return { cleanUrl, extraHeaders: {} }
  }
}

/**
 * 合并 headers：额外 headers 优先
 */
function mergeSourceJson(sourceJson: string, extraHeaders: Record<string, string>): string {
  if (Object.keys(extraHeaders).length === 0) return sourceJson
  try {
    const source = JSON.parse(sourceJson) as Record<string, unknown>
    const existingHeaders = (source.header as Record<string, string>) || {}
    source.header = { ...existingHeaders, ...extraHeaders }
    return JSON.stringify(source)
  } catch {
    return sourceJson
  }
}

export async function proxyCover(url: string, sourceJson: string): Promise<string> {
  // 拆分 URL 中的 headers 选项
  const { cleanUrl, extraHeaders } = parseImageUrl(url)
  const mergedSource = mergeSourceJson(sourceJson, extraHeaders)

  try {
    const result = await invoke('proxy_image', { url: cleanUrl, sourceJson: mergedSource })
    return typeof result === 'string' ? result : cleanUrl
  } catch {
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
  // 拆分 URL 中的 headers 选项
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
