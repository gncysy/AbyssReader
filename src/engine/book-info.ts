import { getGlobalHttpClient } from './network/client.js'
import { getString } from './rule-parser/index.js'
import { resolveUrl, cleanIntro } from './utils/url.js'
import type { Book, BookSource } from '../shared/types.js'

export interface BookInfoOptions {
  redirectUrl?: string
  cachedHtml?: string
  debugLog?: (msg: string) => void
}

export async function getBookInfo(
  source: BookSource,
  bookUrl: string,
  options: BookInfoOptions = {}
): Promise<Book | null> {
  if (!bookUrl || typeof bookUrl !== 'string' || !bookUrl.trim()) return null

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleBookInfo
  if (!rule) return null

  const { redirectUrl = bookUrl, cachedHtml, debugLog } = options

  let html = cachedHtml
  let finalRedirectUrl = redirectUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({ url: bookUrl, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return null
      html = response.data
      if (response.url && response.url !== bookUrl) finalRedirectUrl = response.url
    } catch (err: any) { return null }
  }

  if (!html || typeof html !== 'string') return null

  const ctx = { source, baseUrl: source.url, bookUrl, redirectUrl: finalRedirectUrl, result: html }

  // init 规则（可选）
  if (rule.init) {
    try {
      const initResult = getString(html, rule.init, ctx)
      if (initResult && typeof initResult === 'string') {
        html = initResult
        ctx.result = initResult
      }
    } catch (err) { debugLog?.('[BookInfo] init 失败') }
  }

  const name = getString(html, rule.name || '', ctx) || '未命名'
  const author = getString(html, rule.author || '', ctx) || '未知作者'
  const kind = getString(html, rule.kind || '', ctx) || ''
  const lastChapter = getString(html, rule.lastChapter || '', ctx) || ''
  const intro = cleanIntro(getString(html, rule.intro || '', ctx) || '')
  const coverUrl = getString(html, rule.coverUrl || '', ctx) || ''
  const tocUrl = getString(html, rule.tocUrl || '', ctx) || bookUrl

  return {
    id: bookUrl,
    name: String(name).trim(),
    author: String(author).trim(),
    coverUrl: coverUrl ? resolveUrl(String(coverUrl), finalRedirectUrl) : null,
    intro: intro || null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    bookUrl,
    tocUrl: tocUrl ? resolveUrl(String(tocUrl), finalRedirectUrl) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
