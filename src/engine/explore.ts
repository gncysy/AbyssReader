import { getGlobalHttpClient } from './network/client.js'
import { getString, getElements } from './rule-parser/index.js'
import { resolveUrl } from './utils/url.js'
import { parseBookItem } from './utils/book-parser.js'
import type { Book, BookSource } from '../shared/types.js'

export interface Category {
  title: string
  url: string
  style?: { layout_flexGrow?: number; layout_flexBasisPercent?: number }
}

export function getExploreCategories(source: BookSource): Category[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({ title: item.title || '未命名', url: item.url || '', style: item.style || undefined }))
      }
    } catch {}
  }

  if (trimmed.includes('\n') && trimmed.includes('::')) {
    return trimmed.split('\n').filter(line => line.includes('::')).map(line => {
      const [title, url] = line.split('::').map(s => s.trim())
      return { title, url }
    })
  }

  return []
}

export async function getExploreBooks(
  source: BookSource,
  categoryUrl: string,
  page: number = 1
): Promise<Book[]> {
  if (!categoryUrl || typeof categoryUrl !== 'string' || !categoryUrl.trim()) return []

  const httpClient = getGlobalHttpClient()

  let url = categoryUrl.replace(/\{\{page\}\}/g, String(page))
  url = url.replace(/\{\{([^}]+)\}\}/g, (_match: string, expr: string) => {
    try {
      if (!/^[\d\s+\-*/().page]+$/.test(expr)) return String(page)
      return String(Math.max(1, Math.floor(Function(`"use strict"; return (${expr.replace(/page/g, String(page))})`)() as number) || 1))
    } catch { return String(page) }
  })

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const base = source.url.replace(/\/+$/, '')
    url = url.startsWith('/') ? base + url : base + '/' + url
  }

  const response = await httpClient.request({
    url, method: 'GET',
    headers: source.header ? JSON.parse(source.header) : {},
    timeout: 30000,
  })

  if (response.status < 200 || response.status >= 300) return []

  const rawData = response.data
  const rule = source.ruleExplore?.bookList ? source.ruleExplore : source.ruleSearch
  if (!rule || !rule.bookList) return []

  const ctx = { source, baseUrl: source.url, page }
  const bookList = getElements(rawData, rule.bookList, ctx)
  if (!bookList || !Array.isArray(bookList)) return []

  const books: Book[] = []
  for (const item of bookList) {
    const book = parseBookItem(item, source, rule, ctx)
    if (book) books.push(book)
  }
  return books
}
