// ============================================
// useCoverCache — 封面缓存逻辑
// ============================================

import { ref } from 'vue'
import { cache } from '@/services/cache.js'
import type { Book } from '@/types'

export function useCoverCache() {
  const coverCache = ref<Record<string, string>>({})

  function getCoverSrc(book: Book): string | null {
    const url = book.customCoverUrl || book.coverUrl
    if (!url) return null
    if (coverCache.value[url]) return coverCache.value[url]
    loadCoverFromCache(book)
    return url
  }

  async function loadCoverFromCache(book: Book): Promise<void> {
    const url = book.customCoverUrl || book.coverUrl
    if (!url) return
    try {
      const cached = await cache.getCover(url)
      if (cached) {
        coverCache.value = { ...coverCache.value, [url]: cached }
      }
    } catch {
      // ignore
    }
  }

  async function onCoverLoaded(book: Book, event: Event): Promise<void> {
    const img = event.target as HTMLImageElement
    const url = book.customCoverUrl || book.coverUrl
    if (!img || !url || coverCache.value[url]) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(img.naturalWidth, 400)
      canvas.height = Math.round(img.naturalHeight * (canvas.width / img.naturalWidth))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/webp', 0.7)
      await cache.putCover(url, dataUrl)
      coverCache.value = { ...coverCache.value, [url]: dataUrl }
    } catch {
      // ignore
    }
  }

  function onCoverError(book: Book): void {
    const url = book.customCoverUrl || book.coverUrl
    if (!url) return
    ;(book as unknown as Record<string, unknown>)._coverFailed = true
  }

  return { coverCache, getCoverSrc, loadCoverFromCache, onCoverLoaded, onCoverError }
}
