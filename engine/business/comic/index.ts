// ============================================
// 漫画图片处理 — 纯函数（从 sandbox/comic.ts 迁移）
// ============================================

export interface ComicImage {
  url: string
  data: string
  directUrl: string
  status: 'loading' | 'loaded' | 'error'
  retries: number
}

/**
 * 剥离图片 URL 中的 ,{...} 选项。
 * Legado 书源可能在图片 URL 后拼接请求头参数，
 * 但请求头已由书源 header 配置统一管理。
 */
function cleanImageUrl(url: string): string {
  const commaIdx = url.indexOf(',{')
  if (commaIdx !== -1) {
    return url.substring(0, commaIdx)
  }
  return url
}

export function extractImageUrls(html: string): string[] {
  const imgRegex = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  const urls = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = imgRegex.exec(html)) !== null) {
    if (m[1] && m[1].trim()) {
      const url = cleanImageUrl(m[1].trim())
      if (url.includes('//')) {
        urls.add(url)
      }
    }
  }
  return [...urls]
}

export function createComicImages(urls: string[]): ComicImage[] {
  return urls.map((url) => ({
    url,
    data: '',
    directUrl: '',
    status: 'loading' as const,
    retries: 3,
  }))
}
