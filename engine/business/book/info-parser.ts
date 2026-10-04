// ============================================
// 书籍详情解析 — 纯函数（对齐 Legado BookInfo）
// 规则执行通过 RuleEvaluator 注入
// ============================================

import { resolveUrl } from '../../index.js'
import type { EngineBook, EngineBookSource, ParseContext } from '../../types.js'

export interface RuleEvaluator {
  getString(content: unknown, rule: string, ctx?: ParseContext): Promise<string>
  getStringList(content: unknown, rule: string, ctx?: ParseContext): Promise<string[]>
  getElements(content: unknown, rule: string, ctx?: ParseContext): Promise<unknown[]>
}

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

/**
 * 局部日志辅助：engine 是纯函数层，不 import 日志系统。
 * 通过全局 console 输出，由 services 层的日志桥接重定向。
 */
function debugLog(message: string): void {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(`[engine:bookInfo] ${message}`)
  }
}

export async function parseBookInfo(
  source: EngineBookSource,
  html: string,
  finalRedirectUrl: string,
  evaluator: RuleEvaluator,
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
      const initResults = await evaluator.getElements(workingHtml, initRule, ctx)
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      debugLog(`init 规则执行失败: ${msg}`)
    }
  }

  const mCanReName = canReName && !!rule.canReName

  const nameRule = getRuleString(rule, 'name')
  const rawName = nameRule ? (await evaluator.getString(workingHtml, nameRule, ctx)) : ''
  const name = rawName.trim()
  if (name && (mCanReName || !bookPlaceholder.name)) {
    bookPlaceholder.name = name
  }

  const authorRule = getRuleString(rule, 'author')
  const rawAuthor = authorRule ? (await evaluator.getString(workingHtml, authorRule, ctx)) : ''
  const author = rawAuthor.replace(/^\s*作\s*者[:：\s]+|\s+著$/g, '').trim()
  if (author && (mCanReName || !bookPlaceholder.author)) {
    bookPlaceholder.author = author
  }

  let kind = ''
  try {
    const kindRule = getRuleString(rule, 'kind')
    if (kindRule) {
      const kindList = await evaluator.getStringList(workingHtml, kindRule, ctx)
      if (kindList && kindList.length > 0) {
        kind = kindList.join(',')
        bookPlaceholder.kind = kind
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    debugLog(`kind 规则执行失败: ${msg}`)
  }

  let wordCount = ''
  try {
    const wordCountRule = getRuleString(rule, 'wordCount')
    if (wordCountRule) {
      const rawWordCount = (await evaluator.getString(workingHtml, wordCountRule, ctx)) || ''
      if (rawWordCount && !isHtmlContent(rawWordCount)) {
        wordCount = rawWordCount
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    debugLog(`wordCount 规则执行失败: ${msg}`)
  }

  const lastChapterRule = getRuleString(rule, 'lastChapter')
  let lastChapter = ''
  if (lastChapterRule) {
    lastChapter = (await evaluator.getString(workingHtml, lastChapterRule, ctx)) || ''
    if (isHtmlContent(lastChapter)) {
      lastChapter = ''
    }
  }

  let intro = ''
  try {
    const introRule = getRuleString(rule, 'intro')
    if (introRule) {
      const rawIntro = (await evaluator.getString(workingHtml, introRule, ctx)) || ''
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    debugLog(`intro 规则执行失败: ${msg}`)
  }

  let coverUrl: string | null = null
  try {
    const coverRule = getRuleString(rule, 'coverUrl')
    if (coverRule) {
      const rawCover = (await evaluator.getString(workingHtml, coverRule, ctx)) || ''
      if (rawCover && !isHtmlContent(rawCover)) {
        const firstLine = rawCover.split('\n')[0]?.trim() || rawCover
        coverUrl = resolveUrl(firstLine, finalRedirectUrl)
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    debugLog(`coverUrl 规则执行失败: ${msg}`)
  }

  let tocUrl = finalRedirectUrl
  const tocUrlRule = getRuleString(rule, 'tocUrl')
  if (tocUrlRule && tocUrlRule !== '{{baseUrl}}') {
    try {
      const parsedTocUrl = (await evaluator.getString(workingHtml, tocUrlRule, ctx)) || ''
      if (parsedTocUrl && !parsedTocUrl.startsWith('<') && parsedTocUrl !== workingHtml) {
        tocUrl = parsedTocUrl
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      debugLog(`tocUrl 规则执行失败: ${msg}`)
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
