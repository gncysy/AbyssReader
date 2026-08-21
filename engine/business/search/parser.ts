// ============================================
// 搜索解析 — 纯函数（对齐 Legado）
// ============================================

import { getString, getStringList, resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource, ParseContext } from '../../types.js'

const NAME_MAX_LENGTH = 100
const MAX_TAG_COUNT = 3
const INTRO_MAX_LENGTH = 500
const NAME_REGEX = /\s+作\s*者.*|\s+\S+\s+著/
const AUTHOR_REGEX = /^\s*作\s*者[:：\s]+|\s+著/
const WORD_COUNT_THRESHOLD = 10000

function getRuleString(rule: Record<string, unknown> | null | undefined, key: string): string {
  if (!rule) return ''
  const val = rule[key]
  return typeof val === 'string' ? val : ''
}

function isHtmlContent(str: string): boolean {
  return str.startsWith('<') && str.includes('>') && str.length > 100
}

function extractString(val: unknown, preferAttribute = false): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return ''
    for (const item of val) {
      const result = extractString(item, preferAttribute)
      if (result) return result
    }
    return ''
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>

    if (typeof obj.getAttribute === 'function') {
      const getAttr = obj.getAttribute as (name: string) => string | null
      const src = getAttr('src')
      if (src && src.trim()) return src.trim()
      const href = getAttr('href')
      if (href && href.trim()) return href.trim()
      const alt = getAttr('alt')
      if (alt && alt.trim()) return alt.trim()
      const title = getAttr('title')
      if (title && title.trim()) return title.trim()

      if (preferAttribute) return ''
    }

    if (typeof obj.src === 'string' && obj.src.trim()) return obj.src.trim()
    if (typeof obj.href === 'string' && obj.href.trim()) return obj.href.trim()
    if (typeof obj.alt === 'string' && obj.alt.trim()) return obj.alt.trim()
    if (typeof obj.title === 'string' && obj.title.trim()) return obj.title.trim()

    if (typeof obj.text === 'function') {
      const text = (obj.text as () => unknown)()
      if (typeof text === 'string') return text
    }
    if (typeof obj.textContent === 'string') return obj.textContent.trim()
    if (typeof obj.innerText === 'string') return obj.innerText.trim()
    if (typeof obj.outerHTML === 'string') return obj.outerHTML.trim()
    if (typeof obj.html === 'function') {
      const html = (obj.html as () => unknown)()
      if (typeof html === 'string') return html
    }
    return ''
  }
  return String(val)
}

export function formatBookName(name: string): string {
  return name.replace(NAME_REGEX, '').trim()
}

export function formatBookAuthor(author: string): string {
  return author.replace(AUTHOR_REGEX, '').trim()
}

export function isValidBookName(name: string): boolean {
  if (!name || name.length > NAME_MAX_LENGTH) return false
  const tagCount = (name.match(/<\/?[a-zA-Z][^>]*>/g) || []).length
  if (tagCount > MAX_TAG_COUNT) return false
  return true
}

export function cleanIntro(intro: string, maxLength: number = INTRO_MAX_LENGTH): string {
  if (!intro) return ''
  const trimmed = String(intro).trim()
  if (trimmed.startsWith('<usehtml>') || trimmed.startsWith('<md>') || trimmed.startsWith('<useweb>')) {
    return trimmed
  }
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

export function formatWordCount(raw: string): string {
  const num = parseInt(String(raw).replace(/[^\d]/g, ''), 10)
  if (isNaN(num) || num < 0) return raw || ''
  if (num < WORD_COUNT_THRESHOLD) return String(num)
  return (num / WORD_COUNT_THRESHOLD).toFixed(1) + '万'
}

export function matchesBookUrlPattern(url: string, pattern: string | null | undefined): boolean {
  if (!pattern) return false
  try {
    return new RegExp(pattern).test(url)
  } catch {
    return false
  }
}

export async function parseSearchItem(
  item: unknown,
  source: EngineBookSource,
  baseUrl: string,
  ruleName: string,
  ruleAuthor: string,
  ruleKind: string,
  ruleCoverUrl: string,
  ruleWordCount: string,
  ruleIntro: string,
  ruleLastChapter: string,
  ruleBookUrl: string,
  key: string,
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null,
): Promise<EngineBook | null> {
  const bookPlaceholder: Partial<EngineBook> = {}
  const itemCtx: ParseContext = { source, baseUrl, result: item, book: bookPlaceholder, key, page }

  // 修复：规则为空时使用空字符串，不调用 getString 避免回退到整个 HTML
  const rawName = ruleName ? await getString(item, ruleName, itemCtx) : ''
  const nameRawStr = extractString(rawName)
  const name = formatBookName(nameRawStr)
  if (!name || !isValidBookName(name)) return null

  const rawAuthor = ruleAuthor ? await getString(item, ruleAuthor, itemCtx) : ''
  const authorRawStr = extractString(rawAuthor)
  const author = formatBookAuthor(authorRawStr) || '未知作者'

  let kind: string | null = null
  try {
    if (ruleKind) {
      const kindList = await getStringList(item, ruleKind, itemCtx)
      if (kindList && kindList.length > 0) {
        kind = kindList.join(',')
        bookPlaceholder.kind = kind
      }
    }
  } catch {
    // ignore
  }

  if (filter && filter(name, author, kind) === false) return null

  let wordCount: string | null = null
  try {
    if (ruleWordCount) {
      const wc = await getString(item, ruleWordCount, itemCtx)
      const wcStr = extractString(wc)
      if (wcStr && !isHtmlContent(wcStr)) wordCount = formatWordCount(wcStr)
    }
  } catch {
    // ignore
  }

  let lastChapter: string | null = null
  try {
    if (ruleLastChapter) {
      const raw = await getString(item, ruleLastChapter, itemCtx)
      const str = extractString(raw)
      if (str && !isHtmlContent(str)) lastChapter = str
    }
  } catch {
    // ignore
  }

  let intro: string | null = null
  try {
    if (ruleIntro) {
      const rawIntro = await getString(item, ruleIntro, itemCtx)
      const introStr = extractString(rawIntro)
      if (introStr && !isHtmlContent(introStr)) {
        intro = cleanIntro(introStr)
      }
    }
  } catch {
    // ignore
  }

  let coverUrl: string | null = null
  try {
    if (ruleCoverUrl) {
      const rawCover = await getString(item, ruleCoverUrl, itemCtx)
      const coverStr = extractString(rawCover, true)
      if (coverStr && !isHtmlContent(coverStr)) {
        coverUrl = resolveUrl(coverStr, baseUrl)
      }
    }
  } catch {
    // ignore
  }

  let bookUrlRaw = ''
  if (ruleBookUrl) {
    const bookUrlStr = await getString(item, ruleBookUrl, itemCtx)
    bookUrlRaw = extractString(bookUrlStr, true)
  }
  const urlParts = bookUrlRaw.split(/[\n\r\t ]+/).filter(Boolean)
  if (urlParts.length > 0 && urlParts[0]) {
    bookUrlRaw = urlParts[0]
  }
  const resolvedBookUrl = bookUrlRaw ? resolveUrl(bookUrlRaw, baseUrl) : baseUrl

  return {
    name,
    author,
    bookUrl: resolvedBookUrl,
    coverUrl,
    intro,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount,
  }
}

export async function parseInfoItem(
  source: EngineBookSource,
  baseUrl: string,
  body: string,
  key: string,
  page: number,
  filter?: ((name: string, author: string, kind: string | null) => boolean) | null,
): Promise<EngineBook | null> {
  const rule = source.ruleBookInfo as Record<string, unknown> | null
  if (!rule) return null

  const ctx: ParseContext = { source, baseUrl, result: body, book: {}, key, page }

  const nameRule = getRuleString(rule, 'name')
  const rawName = nameRule ? await getString(body, nameRule, ctx) : ''
  const nameRawStr = extractString(rawName)
  const name = formatBookName(nameRawStr)
  if (!name || !isValidBookName(name)) return null

  if (filter && filter(name, '', null) === false) return null

  const authorRule = getRuleString(rule, 'author')
  const rawAuthor = authorRule ? await getString(body, authorRule, ctx) : ''
  const authorRawStr = extractString(rawAuthor)
  const author = formatBookAuthor(authorRawStr) || '未知作者'

  const coverRule = getRuleString(rule, 'coverUrl')
  let coverUrl: string | null = null
  if (coverRule) {
    const rawCover = await getString(body, coverRule, ctx)
    const coverStr = extractString(rawCover, true)
    if (coverStr && !isHtmlContent(coverStr)) coverUrl = resolveUrl(String(coverStr), baseUrl)
  }

  const introRule = getRuleString(rule, 'intro')
  let intro: string | null = null
  if (introRule) {
    const rawIntro = await getString(body, introRule, ctx)
    const introStr = extractString(rawIntro)
    if (introStr && !isHtmlContent(introStr)) intro = cleanIntro(introStr)
  }

  const kindRule = getRuleString(rule, 'kind')
  let kind: string | null = null
  if (kindRule) {
    const rawKind = await getString(body, kindRule, ctx)
    const kindStr = extractString(rawKind)
    if (kindStr && !isHtmlContent(kindStr)) kind = kindStr
  }

  const lastChapterRule = getRuleString(rule, 'lastChapter')
  let lastChapter: string | null = null
  if (lastChapterRule) {
    const rawLastChapter = await getString(body, lastChapterRule, ctx)
    const lastChapterStr = extractString(rawLastChapter)
    if (lastChapterStr && !isHtmlContent(lastChapterStr)) lastChapter = lastChapterStr
  }

  return {
    name,
    author,
    bookUrl: baseUrl,
    coverUrl,
    intro,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    tocUrl: null,
  }
}
