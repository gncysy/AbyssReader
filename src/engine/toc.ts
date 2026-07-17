import { getGlobalHttpClient } from './network/client.js'
import { getString, getElements } from './rule-parser/index.js'
import { resolveUrl } from './utils/url.js'
import * as cheerio from 'cheerio'
import type { BookSource, Chapter } from '../shared/types.js'

export interface TocOptions {
  redirectUrl?: string
  cachedHtml?: string
  book?: any
}

export async function getToc(
  source: BookSource,
  tocUrl: string,
  options: TocOptions = {}
): Promise<Chapter[]> {
  if (!tocUrl || typeof tocUrl !== 'string' || tocUrl === '') return []

  const httpClient = getGlobalHttpClient()
  const rule = source.ruleToc
  if (!rule || !rule.chapterList) return []

  let html = options.cachedHtml || null
  let finalRedirectUrl = options.redirectUrl || tocUrl

  if (!html) {
    try {
      const headers = source.header ? JSON.parse(source.header) : {}
      const response = await httpClient.request({ url: tocUrl, method: 'GET', headers, timeout: 30000 })
      if (response.status < 200 || response.status >= 300) return []
      html = response.data
      if (response.url && response.url !== tocUrl) finalRedirectUrl = response.url
    } catch { return [] }
  }

  if (!html || typeof html !== 'string') return []

  console.log('[Toc] 数据前100:', html.substring(0, 100))
  console.log('[Toc] chapterList规则:', rule.chapterList)

  const contextBook = options.book || {}
  const ctx = { source, baseUrl: source.url, tocUrl, redirectUrl: finalRedirectUrl, book: contextBook, result: html }

  let chapterItems = getElements(html, rule.chapterList, ctx)
  console.log('[Toc] chapterItems数量:', Array.isArray(chapterItems) ? chapterItems.length : '非数组')

  if (!Array.isArray(chapterItems) || chapterItems.length === 0) {
    // getElements 返回空，尝试直接用 cheerio 解析（处理 CSS 规则）
    const cssRule = rule.chapterList
    if (cssRule && typeof cssRule === 'string' && !cssRule.startsWith('$.')) {
      let fixedRule = cssRule
      if (fixedRule.startsWith('@css:')) fixedRule = fixedRule.substring(5)
      fixedRule = fixedRule.replace(/class\.([^@]+)@([^@]+)/g, '.$1 $2')
      // 修复 cheerio 不支持的无引号属性值
      fixedRule = fixedRule.replace(/\[(\w+)~=(\/[^\]]+\/)\]/g, '[$1="$2"]')

      const $ = cheerio.load(html)
      const items: any[] = []
      $(fixedRule).each((_i: number, el: any) => {
        const a = $(el).find('a').first()
        const title = a.text().trim() || $(el).text().trim()
        const url = a.attr('href') || ''
        if (title) items.push({ title, url })
      })
      chapterItems = items
    }
  }

  if (!Array.isArray(chapterItems) || chapterItems.length === 0) return []

  let chapterListRule = rule.chapterList || ''
  if (chapterListRule.startsWith('-')) chapterItems.reverse()

  const allChapters: Chapter[] = []

  for (const item of chapterItems) {
    const itemCtx = { ...ctx, result: item, book: { ...contextBook, kind: contextBook.kind || '' } }
    const title = getString(item, rule.chapterName || '', itemCtx) || '无标题'
    const url = getString(item, rule.chapterUrl || '', itemCtx)

    const trimmedUrl = (url || '').trim()
    if (allChapters.length === 0) { console.log('[Toc] 第一章url:', trimmedUrl, 'title:', title) }
    if (trimmedUrl) {
      const isVip = rule.isVip ? (getString(item, rule.isVip, itemCtx) === 'true' || getString(item, rule.isVip, itemCtx) === '1') : false
      const isPay = rule.isPay ? (getString(item, rule.isPay, itemCtx) === 'true' || getString(item, rule.isPay, itemCtx) === '1') : false
      allChapters.push({
        id: allChapters.length, title,
        url: resolveUrl(url, finalRedirectUrl),
        index: allChapters.length,
        isVip, isPay,
        content: null, updateTime: undefined,
      })
    }
  }

  console.log('[Toc] 最终章节数:', allChapters.length)
  allChapters.forEach((ch, idx) => { ch.index = idx; ch.id = idx })
  return allChapters
}


