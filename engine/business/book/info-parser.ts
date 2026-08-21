// ============================================
// 书籍详情解析 — 纯函数（对齐 Legado BookInfo）
// ============================================

import { getString, getStringList, resolveUrl, getElements } from '../../index.js'
import type { EngineBook, EngineBookSource, ParseContext } from '../../types.js'

const INTRO_MAX_LENGTH = 500

function cleanIntro(intro: string, maxLength: number = INTRO_MAX_LENGTH): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

function isHtmlContent(str: string): boolean {
  return str.startsWith('<') && str.includes('>') && str.length > 100
}

function getRuleString(rule: Record<string, unknown> | null | undefined, key: string): string {
  if (!rule) return ''
  const val = rule[key]
  return typeof val === 'string' ? val : ''
}

export async function parseBookInfo(
  source: EngineBookSource,
  html: string,
  finalRedirectUrl: string,
  canReName = true,
): Promise<Partial<EngineBook>> {
  const rule = source.ruleBookInfo as Record<string, unknown> | null
  if (!rule) return {}

  const bookPlaceholder: Partial<EngineBook> = {}
  const ctx: ParseContext = { source, baseUrl: finalRedirectUrl, result: html, book: bookPlaceholder }
  let workingHtml = html

  const initRule = getRuleString(rule, 'init')
  if (initRule) {
    try {
      const initResults = await getElements(workingHtml, initRule, ctx)
      if (initResults.length > 0) {
        const initResult = initResults[0]
        if (initResult) {
          const initObj = initResult as Record<string, unknown>
          const initHtml = typeof initResult === 'string'
            ? initResult
            : (typeof initObj.outerHTML === 'string' ? initObj.outerHTML : (typeof initObj.html === 'string' ? initObj.html : ''))
          if (initHtml) {
            workingHtml = initHtml
            ctx.result = initHtml
          }
        }
      }
    } catch {
      // 忽略 init 失败，继续用原始 HTML
    }
  }

  const mCanReName = canReName && !!rule.canReName

  const nameRule = getRuleString(rule, 'name')
  const rawName = nameRule ? (await getString(workingHtml, nameRule, ctx)) : ''
  const name = rawName.trim()
  if (name && (mCanReName || !bookPlaceholder.name)) {
    bookPlaceholder.name = name
  }

  const authorRule = getRuleString(rule, 'author')
  const rawAuthor = authorRule ? (await getString(workingHtml, authorRule, ctx)) : ''
  const author = rawAuthor.replace(/^\s*作\s*者[:：\s]+|\s+著$/g, '').trim()
  if (author && (mCanReName || !bookPlaceholder.author)) {
    bookPlaceholder.author = author
  }

  let kind = ''
  try {
    const kindRule = getRuleString(rule, 'kind')
    if (kindRule) {
      const kindList = await getStringList(workingHtml, kindRule, ctx)
      if (kindList && kindList.length > 0) {
        kind = kindList.join(',')
        bookPlaceholder.kind = kind
      }
    }
  } catch {
    // ignore
  }

  let wordCount = ''
  try {
    const wordCountRule = getRuleString(rule, 'wordCount')
    if (wordCountRule) {
      const rawWordCount = (await getString(workingHtml, wordCountRule, ctx)) || ''
      if (rawWordCount && !isHtmlContent(rawWordCount)) {
        wordCount = rawWordCount
      }
    }
  } catch {
    // ignore
  }

  const lastChapterRule = getRuleString(rule, 'lastChapter')
  let lastChapter = ''
  if (lastChapterRule) {
    lastChapter = (await getString(workingHtml, lastChapterRule, ctx)) || ''
    if (isHtmlContent(lastChapter)) {
      lastChapter = ''
    }
  }

  let intro = ''
  try {
    const introRule = getRuleString(rule, 'intro')
    if (introRule) {
      const rawIntro = (await getString(workingHtml, introRule, ctx)) || ''
      const introTrimS = rawIntro.trimStart()
      if (
        introTrimS.startsWith('<usehtml>') ||
        introTrimS.startsWith('<md>') ||
        introTrimS.startsWith('<useweb>')
      ) {
        intro = introTrimS
      } else {
        intro = cleanIntro(rawIntro)
      }
    }
  } catch {
    // ignore
  }

  let coverUrl: string | null = null
  try {
    const coverRule = getRuleString(rule, 'coverUrl')
    if (coverRule) {
      const rawCover = (await getString(workingHtml, coverRule, ctx)) || ''
      if (rawCover && !isHtmlContent(rawCover)) {
        // 修复：取第一行（CSS 匹配多个元素时取第一个）
        // 第二行是 JS 拼接的带 Referer URL，不需要
        const firstLine = rawCover.split('\n')[0]?.trim() || rawCover
        coverUrl = resolveUrl(firstLine, finalRedirectUrl)
      }
    }
  } catch {
    // ignore
  }

  let tocUrl = finalRedirectUrl
  const tocUrlRule = getRuleString(rule, 'tocUrl')
  if (tocUrlRule && tocUrlRule !== '{{baseUrl}}') {
    try {
      const parsedTocUrl = (await getString(workingHtml, tocUrlRule, ctx)) || ''
      if (parsedTocUrl && !parsedTocUrl.startsWith('<') && parsedTocUrl !== workingHtml) {
        tocUrl = parsedTocUrl
      }
    } catch {
      // ignore
    }
  }

  const resolvedTocUrl =
    tocUrl === finalRedirectUrl
      ? finalRedirectUrl
      : resolveUrl(String(tocUrl), finalRedirectUrl)

  return {
    name: bookPlaceholder.name ? String(bookPlaceholder.name).trim() : (name || '未命名'),
    author: bookPlaceholder.author ? String(bookPlaceholder.author).trim() : (author || '未知作者'),
    coverUrl,
    intro: intro || null,
    kind: kind ? String(kind).trim() : null,
    lastChapter: lastChapter ? String(lastChapter).trim() : null,
    wordCount: wordCount || null,
    tocUrl: resolvedTocUrl || null,
  }
}
