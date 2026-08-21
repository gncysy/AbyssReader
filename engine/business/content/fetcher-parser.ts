// ============================================
// 正文解析 — 纯函数（对齐 Legado ContentHelp）
// ============================================

import { getString, getElements, resolveUrl } from '../../index.js'
import type { EngineBookSource, EngineBook, EngineChapter, ParseContext } from '../../types.js'

const NBSP_REGEX = /(&nbsp;)+/g
const ESP_REGEX = /&ensp;|&emsp;/g
const NO_PRINT_REGEX = /&thinsp;|&zwnj;|&zwj;|\u2009|\u200C|\u200D/g
const WRAP_HTML_REGEX = /<\/?(?:div|p|br|hr|h\d|article|dd|dl)[^>]*>/gi
const COMMENT_REGEX = /<!--[\s\S]*?-->/g
const NOT_IMG_HTML_REGEX = /<\/?(?!img)[a-zA-Z]+(?=[ >])[^<>]*>/gi
const INDENT1_REGEX = /\s*\n+\s*/g
const INDENT2_REGEX = /^[\n\s]+/
const LAST_REGEX = /[\n\s]+$/

const FORMAT_IMAGE_PATTERN = /<img[^>]*\ssrc\s*=\s*['"]([^'"{}>]*\{(?:[^{}]|\{[^}>]+\})+\})['"][^>]*>|<img[^>]*\sdata-(?:src|original|srcset)\s*=\s*['"]([^'">]+)['"][^>]*>|<img[^>]*\ssrc\s*=\s*"([^">]+)"[^>]*>|<img[^>]*\s(?:data-[^=>]*|src)=\s*['"]([^'">]*)['"][^>]*>/gi

export function injectImageStyle(html: string, imageStyle: string | null | undefined): string {
  if (!imageStyle) return html
  let style = ''
  if (imageStyle === 'FULL' || imageStyle === 'full') style = 'width:100%;height:auto;'
  else if (imageStyle === 'TEXT' || imageStyle === 'text') style = 'display:none;'
  else if (imageStyle === 'SINGLE' || imageStyle === 'single') style = 'display:block;max-width:100%;height:auto;margin:0 auto;'
  else if (imageStyle === 'center' || imageStyle === 'CENTER') style = 'display:block;margin:0 auto;max-width:100%;height:auto;'
  else if (imageStyle.startsWith('{')) {
    try { const p = JSON.parse(imageStyle.replace(/'/g, '"')) as Record<string, unknown>; style = (typeof p.style === 'string' ? p.style : (typeof p.css === 'string' ? p.css : '')) } catch { style = imageStyle }
  } else style = imageStyle
  if (!style) return html
  return html.replace(/<img\s/g, '<img style="' + style + '" ')
}

export function formatKeepImg(html: string, redirectUrl: string, imageStyle: string | null | undefined): string {
  let result = html
    .replace(NBSP_REGEX, ' ').replace(ESP_REGEX, ' ').replace(NO_PRINT_REGEX, '')
    .replace(WRAP_HTML_REGEX, '\n').replace(COMMENT_REGEX, '').replace(NOT_IMG_HTML_REGEX, '')
    .replace(INDENT1_REGEX, '\n\u3000\u3000').replace(INDENT2_REGEX, '\u3000\u3000').replace(LAST_REGEX, '')

  let appendPos = 0
  const sb: string[] = []
  const regex = new RegExp(FORMAT_IMAGE_PATTERN.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = regex.exec(result)) !== null) {
    if (regex.lastIndex === 0) break
    let param = ''
    const group1 = match[1]
    const rawSrc = group1 || match[2] || match[3] || match[4] || ''
    let src = rawSrc
    if (group1) {
      const m = /,\s*(\{.*\})/.exec(rawSrc)
      if (m) { param = ',' + rawSrc.substring(m.index); src = rawSrc.substring(0, m.index) }
    }
    const styleAttr = imageStyle ? ' style="' + imageStyle + '"' : ''
    sb.push(result.substring(appendPos, match.index), '<img src="' + resolveUrl(src, redirectUrl) + param + '"' + styleAttr + '>')
    appendPos = regex.lastIndex
  }
  if (appendPos < result.length) sb.push(result.substring(appendPos))
  return sb.join('')
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n').trim()
}

const CONTENT_MIN_LENGTH = 50

interface ContentRuleLike {
  content?: string | null
  sourceRegex?: string | null
  imageStyle?: string | null
  nextContentUrl?: string | null
  [key: string]: unknown
}

export async function parseContentPage(
  book: Partial<EngineBook>,
  baseUrl: string,
  redirectUrl: string,
  body: string,
  contentRule: ContentRuleLike,
  chapter: Partial<EngineChapter>,
  bookSource: EngineBookSource,
  nextChapterUrl: string | null | undefined,
  getNextPageUrl: boolean
): Promise<{ content: string; nextUrls: string[] }> {
  const ctx: ParseContext = {
    source: bookSource,
    baseUrl: bookSource.bookSourceUrl || baseUrl,
    book: book || {},
    chapter: chapter || {},
    nextChapterUrl: nextChapterUrl || '',
    result: body,
  }
  const nextUrls: string[] = []
  let workingBody = body

  const sourceRegex = contentRule.sourceRegex || ''
  if (sourceRegex) {
    try {
      const e = await getString(body, sourceRegex, ctx)
      if (e && e.trim()) { workingBody = e; ctx.result = workingBody }
    } catch {}
  }

  let content = ''

  const selector = contentRule.content || ''
  if (selector) {
    try {
      content = await getString(workingBody, selector, ctx) || ''
    } catch {
      content = ''
    }
  }

  if (!content || content.length < CONTENT_MIN_LENGTH) {
    content = stripHtml(workingBody)
  }

  const isComic = bookSource.bookSourceType === 2
  if (!isComic && content) {
    content = formatKeepImg(content, redirectUrl || baseUrl, contentRule.imageStyle || null)
    if (content.indexOf('&') > -1) {
      content = content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
    }
  }

  const nextContentUrlRule = contentRule.nextContentUrl || ''
  if (getNextPageUrl && nextContentUrlRule) {
    try {
      const r = await getElements(workingBody, nextContentUrlRule, { ...ctx, isUrl: true })
      if (Array.isArray(r)) {
        for (const u of r) {
          if (u && typeof u === 'string' && u.trim()) nextUrls.push(u.trim())
        }
      }
    } catch {}
  }

  return { content, nextUrls }
}
