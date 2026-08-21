// ============================================
// 目录解析 — 对齐 Legado BookChapterList
// ============================================

import { getString, getElements, resolveUrl } from '../../index.js'
import type { EngineBookSource, EngineBook, EngineChapter, ParseContext } from '../../types.js'

const WORD_COUNT_REGEX = /(?:^|字数[：:、]?|\s+)([0-9万千百\.]{1,6}字)/

function isJsonString(str: string): boolean {
  const t = str.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function getRuleString(rule: Record<string, unknown> | null | undefined, key: string): string {
  if (!rule) return ''
  const val = rule[key]
  return typeof val === 'string' ? val : ''
}

function parseJsonChapters(list: unknown[], baseUrl: string): EngineChapter[] {
  const chapters: EngineChapter[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>
    const title = obj.chapterName || obj.title || obj.name || ''
    const hasChapterId = obj.chapterId !== undefined && obj.chapterId !== null
    const url = hasChapterId
      ? '/chapter/' + String(obj.chapterId)
      : (obj.url || obj.path || '')
    if (title) {
      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), baseUrl),
        index: chapters.length,
        isVip: !!(obj.isFree === 0 || obj.isVip),
        isPay: !!(obj.isChapterBuy || obj.isPay),
      })
    }
  }
  chapters.forEach((ch, idx) => {
    ch.index = idx
    ch.id = idx
  })
  return chapters
}

export async function parseTocPage(
  book: Partial<EngineBook>,
  baseUrl: string,
  redirectUrl: string,
  body: string,
  tocRule: Record<string, unknown>,
  listRule: string,
  bookSource: EngineBookSource,
  getNextUrl: boolean,
): Promise<{ chapters: EngineChapter[]; nextUrls: string[] }> {
  const chapters: EngineChapter[] = []
  const nextUrls: string[] = []

  const baseCtx: ParseContext = {
    source: bookSource,
    baseUrl: bookSource.bookSourceUrl || baseUrl,
    book: book || {},
    result: body,
  }

  const isJson = isJsonString(body)
  const parsedData: unknown = isJson ? safeParseJson(body) : body
  const elements = await getElements(parsedData, listRule, baseCtx)

  const nextTocUrlRule = getRuleString(tocRule, 'nextTocUrl')
  if (getNextUrl && nextTocUrlRule) {
    try {
      const results = await getElements(parsedData, nextTocUrlRule, { ...baseCtx, isUrl: true })
      if (Array.isArray(results)) {
        for (const item of results) {
          if (item && typeof item === 'string' && item.trim() && item.trim() !== redirectUrl) {
            const abs = resolveUrl(item.trim(), redirectUrl)
            if (abs && !nextUrls.includes(abs) && abs !== redirectUrl) {
              nextUrls.push(abs)
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (Array.isArray(elements) && elements.length > 0) {
    const nameRule = getRuleString(tocRule, 'chapterName')
    const urlRule = getRuleString(tocRule, 'chapterUrl')
    const vipRule = getRuleString(tocRule, 'isVip')
    const payRule = getRuleString(tocRule, 'isPay')
    const isVolumeRule = getRuleString(tocRule, 'isVolume')
    const upTimeRule = getRuleString(tocRule, 'updateTime')

    const hasDeferredJs = urlRule.includes('@js:') || urlRule.includes('<js>')
    let firstRule = ''
    if (hasDeferredJs) {
      const jsIdx = urlRule.search(/@js:|<js>/)
      firstRule = jsIdx > 0 ? urlRule.substring(0, jsIdx).trim() : ''
    }

    for (const item of elements) {
      if (item === null || item === undefined) continue

      const itemCtx: ParseContext = { ...baseCtx, result: item }

      const title = (await getString(item, nameRule, itemCtx)) || ''
      if (!title) continue

      let url = ''
      let deferredJs: string | undefined
      let deferredResult: unknown

      if (hasDeferredJs) {
        if (firstRule) {
          url = (await getString(item, firstRule, itemCtx)) || ''
        }
        deferredJs = urlRule
        deferredResult = url
      } else {
        url = (await getString(item, urlRule, itemCtx)) || ''
      }

      const info = upTimeRule ? (await getString(item, upTimeRule, itemCtx)) || '' : ''
      const isVolumeStr = isVolumeRule ? (await getString(item, isVolumeRule, itemCtx)) || '' : ''
      const isVolume = isVolumeStr === 'true'

      let wordCount: string | undefined
      let tag = info
      if (!isVolume) {
        const wcMatch = WORD_COUNT_REGEX.exec(info)
        if (wcMatch && wcMatch[1]) {
          wordCount = wcMatch[1].trim()
          tag = info.replace(wcMatch[0], '')
        }
      }

      if (!url) {
        if (isVolume) {
          url = title + chapters.length
        } else {
          url = baseUrl
        }
      }

      chapters.push({
        id: chapters.length,
        title: String(title),
        url: resolveUrl(String(url), redirectUrl),
        index: chapters.length,
        isVip: vipRule ? (await getString(item, vipRule, itemCtx)) === 'true' : false,
        isPay: payRule ? (await getString(item, payRule, itemCtx)) === 'true' : false,
        updateTime: tag || undefined,
        wordCount: wordCount,
        _deferredJs: deferredJs,
        _deferredResult: deferredResult,
      })
    }
  }
  return { chapters, nextUrls }
}

export function parseTocJson(body: string, redirectUrl: string): EngineChapter[] {
  const isJson = isJsonString(body)
  if (!isJson) return []
  const parsed = safeParseJson(body)
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    const dataObj = obj.data as Record<string, unknown> | undefined
    if (dataObj && Array.isArray(dataObj.list)) {
      return parseJsonChapters(dataObj.list, redirectUrl)
    }
  }
  return []
}

export function dedupChapters(chapters: EngineChapter[]): EngineChapter[] {
  const seen = new Map<string, EngineChapter>()
  for (const ch of chapters) {
    const key = (ch.url || ch.title) ?? ''
    if (key && !seen.has(key)) seen.set(key, ch)
  }
  return Array.from(seen.values())
}
