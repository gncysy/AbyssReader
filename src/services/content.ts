// ============================================
// 正文获取编排服务 — 对齐 Legado BookContent
// ============================================

import { analyzeUrl } from '@engine/url/index.js'
import { logInfo, logError, logWarn } from '@engine/log/index.js'
import { parseContentPage, injectImageStyle } from '@engine/business/content/fetcher-parser.js'
import type { RuleEvaluator } from '@engine/business/book/index.js'
import { getString, getStringList, getElements } from '@engine/parser/index.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
import { shouldExecuteInDeno, evaluateRule } from './rule-evaluator.js'
import { fetchWithWebviewFallback } from './fetch.js'
import { aesDecrypt } from '@engine/crypto/index.js'
import { engine } from './engine.js'
import type { BookSource } from '@/types'
import type { EngineBookSource, EngineBook, EngineChapter } from '@engine/types.js'
import { NETWORK } from '@/constants/index.js'

const MAX_CONTENT_PAGES = 20
// 降低 BFS 每轮并发，避免瞬间发太多请求。
// 原 5：一章 10 页会 2 轮并发发 10 个请求，峰值高。
// 现在 2：一章 10 页分 5 轮，峰值低，总耗时略增但不抢网络。
const MAX_CONCURRENT_PAGES = 2
const BASE64_LENGTH_THRESHOLD = 2000
const AES_MIN_LENGTH_RATIO = 0.3
const HEX_MAX_LENGTH = 500
const HEX_MIN_NEWLINE_COUNT = 1
const INVALID_RESULT_MIN_LENGTH = 100
const DEBUG_PARAMS_PREVIEW_LENGTH = 200

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function createRuleEvaluator(): RuleEvaluator {
  return {
    getString: (content, rule, ctx) => getString(content, rule, ctx),
    getStringList: (content, rule, ctx) => getStringList(content, rule, ctx),
    getElements: (content, rule, ctx) => getElements(content, rule, ctx),
  }
}

async function resolveChapterUrl(
  url: string,
  deferredJs: string | undefined,
  deferredResult: unknown,
  source: BookSource,
  book: Record<string, unknown>,
): Promise<string> {
  if (!deferredJs) return url

  try {
    let jsCode = deferredJs
      .replace(/^[\s\S]*?@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()
    if (!jsCode) return url
    jsCode = jsCode.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (!jsCode) return url
    jsCode = jsCode.replace(/\blet\b/g, 'var').replace(/\bconst\b/g, 'var')
    const result = await engine.executeJs(jsCode, {
      result: deferredResult ?? url,
      src: url,
      baseUrl: source.bookSourceUrl || '',
      book: book || {},
      chapter: { url },
    })
    if (result && typeof result === 'string' && result.trim().length > 0) {
      logInfo('reader', 'frontend', '[正文] 章节 URL 解密成功')
      return result.trim()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', '[正文] 章节 URL 解密失败: ' + msg)
  }

  return url
}

function isValidHtmlContent(html: string): boolean {
  return html.trim().length > 0 &&
    (html.includes('<') || html.includes('\n') || html.length > 20)
}

function getDecryptKey(source: BookSource): string | null {
  const rule = source.ruleContent
  if (!rule) return null
  const key = (rule as unknown as Record<string, unknown>).decryptKey
  return typeof key === 'string' && key.length > 0 ? key : null
}

async function decryptJsonFromHtml(html: string, source: BookSource): Promise<string> {
  const decryptKey = getDecryptKey(source)
  if (!decryptKey) {
    logWarn('reader', 'frontend', '[正文] fallback: 书源未配置 decryptKey')
    return ''
  }

  try {
    const paramsMatch = html.match(/params = '([^']+)'/)
    if (!paramsMatch || !paramsMatch[1]) {
      logWarn('reader', 'frontend', '[正文] fallback: 未能从 HTML 中提取 params')
      return ''
    }
    const params = paramsMatch[1]

    logInfo('reader', 'frontend', `[正文] fallback params 长度=${params.length} 前缀=${params.substring(0, DEBUG_PARAMS_PREVIEW_LENGTH)}`)

    let binary: string
    try {
      binary = atob(params)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('reader', 'frontend', `[正文] fallback params base64 解码失败: ${msg}`)
      return ''
    }
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    if (bytes.length <= 16) {
      logError('reader', 'frontend', `[正文] fallback params 解码后长度不足: ${bytes.length}`)
      return ''
    }
    const iv = bytes.slice(0, 16)
    const ciphertext = bytes.slice(16)
    const ivB64 = btoa(String.fromCharCode(...iv))
    const cipherB64 = btoa(String.fromCharCode(...ciphertext))
    const decryptedText = aesDecrypt(cipherB64, decryptKey, 'CBC', ivB64)

    if (!decryptedText || decryptedText.length < 10) {
      logError('reader', 'frontend', '[正文] fallback: 解密结果为空')
      return ''
    }

    try {
      const parsed = JSON.parse(decryptedText) as Record<string, unknown>
      if (Array.isArray(parsed.chapter_images) && parsed.chapter_images.length > 0) {
        const images = (parsed.chapter_images as string[]).map((imgUrl) => `<img src="${imgUrl.replace(/\\/g, '')}">`).join('\n')
        logInfo('reader', 'frontend', `[正文] fallback JSON 解密成功: ${(parsed.chapter_images as string[]).length} 张图片`)
        return images
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logWarn('reader', 'frontend', `[正文] fallback 解密结果不是合法 JSON: ${msg}`)
    }

    logError('reader', 'frontend', '[正文] fallback: 无法从解密结果中提取图片列表')
    return ''
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', '[正文] fallback 解密失败: ' + msg)
    return ''
  }
}

async function executeBodyJs(
  bodyJs: string,
  responseBody: string,
  source: BookSource,
  book: Record<string, unknown>,
  chapter: Record<string, unknown>,
  nextChapterUrl: string | null | undefined,
): Promise<string> {
  try {
    const runtime = getJsRuntime()
    if (!runtime) return responseBody

    const jsCode = bodyJs
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()

    const result = await runtime.execute(jsCode, {
      result: responseBody,
      src: responseBody,
      baseUrl: source.bookSourceUrl || '',
      book: book || {},
      chapter: chapter || {},
      nextChapterUrl: nextChapterUrl || '',
    })
    if (typeof result === 'string' && result.length > 0) {
      logInfo('reader', 'frontend', '[正文] bodyJs 执行成功')
      return result
    }
    return responseBody
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', '[正文] bodyJs 执行失败: ' + msg)
    return responseBody
  }
}

async function executeHeaderRule(source: BookSource): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (!source.header) return headers

  try {
    const headerStr = source.header
    if (headerStr.startsWith('@js:') || headerStr.startsWith('<js>')) {
      const runtime = getJsRuntime()
      if (runtime) {
        const result = await runtime.execute(headerStr, {
          source: toEngineBookSource(source),
          baseUrl: source.bookSourceUrl || '',
          result: '',
          book: {},
        })
        if (typeof result === 'string') {
          try {
            const parsed = JSON.parse(result) as Record<string, unknown>
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== null && value !== undefined) headers[key] = String(value)
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logWarn('reader', 'frontend', `[正文] header JS 返回非 JSON: ${msg}`)
          }
        }
      }
    } else {
      try {
        const parsed = JSON.parse(headerStr) as Record<string, unknown>
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== null && value !== undefined) headers[key] = String(value)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logWarn('reader', 'frontend', `[正文] header 字符串非 JSON: ${msg}`)
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', '[正文] header 规则执行失败: ' + msg)
  }

  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 15; V2304A Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36'
  }

  return headers
}

interface FetchAndDecryptResult {
  html: string
  redirectUrl: string
  jsExecuted: boolean
}

async function fetchAndDecryptPage(
  source: BookSource,
  url: string,
  headers: Record<string, string>,
  book: Record<string, unknown>,
  contentRule: Record<string, unknown>,
  ctx: Record<string, unknown>,
  chapter?: Record<string, unknown>,
  nextChapterUrl?: string | null,
): Promise<FetchAndDecryptResult | null> {
  try {
    const needsAnalyze = url.includes('@js:') || url.includes('<js>') || url.includes('{{') || url.includes(',{')
    let reqUrl = url
    let method: 'GET' | 'POST' = 'GET'
    let reqHeaders = headers
    let body: string | null = null
    let bodyJs: string | null = null

    if (needsAnalyze) {
      const analysis = await analyzeUrl(url, {
        source: toEngineBookSource(source),
        book: book as Partial<EngineBook>,
        baseUrl: source.bookSourceUrl || '',
        headerMap: headers,
        chapter: chapter as Partial<EngineChapter>,
      })
      reqUrl = analysis.url
      method = analysis.method
      reqHeaders = analysis.headers
      if (analysis.method === 'POST' && analysis.body) {
        body = typeof analysis.body === 'string' ? analysis.body : JSON.stringify(analysis.body)
      }
      bodyJs = analysis.bodyJs
    }

    const rawHtml = await fetchWithWebviewFallback(reqUrl, {
      method,
      headers: reqHeaders,
      body,
      source,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })

    if (!rawHtml) return null

    let processedHtml = rawHtml
    if (bodyJs) {
      processedHtml = await executeBodyJs(bodyJs, processedHtml, source, book, chapter || {}, nextChapterUrl)
    }

    const redirectUrl = reqUrl
    let decrypted = processedHtml
    let jsExecuted = false

    const contentRuleStr = typeof contentRule.content === 'string' ? contentRule.content : ''
    if (shouldExecuteInDeno(contentRuleStr)) {
      try {
        const result = await evaluateRule(
          contentRuleStr,
          processedHtml,
          { ...ctx, baseUrl: source.bookSourceUrl || '', book, result: processedHtml },
          { forceDeno: true }
        )
        if (typeof result === 'string' && result.trim()) {
          decrypted = result.trim()
          jsExecuted = true

          if (decrypted.startsWith('<img src="') && decrypted.length < INVALID_RESULT_MIN_LENGTH) {
            logWarn('reader', 'frontend', `[正文] JS 解密结果异常(${decrypted.length}字符)，触发 fallback`)
            const fallbackHtml = await decryptJsonFromHtml(processedHtml, source)
            if (fallbackHtml) decrypted = fallbackHtml
          } else if (decrypted.length > 10 && decrypted.includes('<img')) {
            logInfo('reader', 'frontend', `[正文] @js 解密成功: ${decrypted.length} 字符`)
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('reader', 'frontend', '[正文] @js 解密失败: ' + msg)
      }
    }

    const sourceRegex = typeof contentRule.sourceRegex === 'string' ? contentRule.sourceRegex : ''
    if (sourceRegex) {
      try {
        const regex = new RegExp(sourceRegex, 's')
        const match = decrypted.match(regex)
        if (match && match[1]) {
          decrypted = match[1]
          logInfo('reader', 'frontend', '[正文] sourceRegex 提取成功')
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('reader', 'frontend', '[正文] sourceRegex 失败: ' + msg)
      }
    }

    if (decrypted.length < HEX_MAX_LENGTH && /^[0-9a-fA-F\s]+$/.test(decrypted.trim())) {
      try {
        const hex = decrypted.replace(/\s/g, '')
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
        const decoded = new TextDecoder().decode(bytes)
        if (decoded.length > 10 && decoded.split('\n').length > HEX_MIN_NEWLINE_COUNT) {
          decrypted = decoded
          logInfo('reader', 'frontend', '[正文] Hex 解密成功')
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logWarn('reader', 'frontend', `[正文] Hex 解密失败: ${msg}`)
      }
    }

    if (decrypted.length < BASE64_LENGTH_THRESHOLD && /^[A-Za-z0-9+/=\s]+$/.test(decrypted.trim())) {
      try {
        const decryptedStr = aesDecrypt(decrypted.trim(), source.bookSourceUrl || '', 'ECB')
        if (decryptedStr && decryptedStr.length > decrypted.length * AES_MIN_LENGTH_RATIO) {
          decrypted = decryptedStr
          logInfo('reader', 'frontend', '[正文] AES/ECB 解密成功')
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logWarn('reader', 'frontend', `[正文] AES/ECB 解密失败: ${msg}`)
      }
    }

    if (!isValidHtmlContent(decrypted) && isValidHtmlContent(processedHtml)) {
      decrypted = processedHtml
    }

    return { html: decrypted, redirectUrl, jsExecuted }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', `[正文] 获取失败: ${msg}`)
    return null
  }
}

export interface GetContentOptions {
  bookKind?: string | undefined
  book?: Record<string, unknown>
  nextChapterUrl?: string
  cachedHtml?: string
  redirectUrl?: string
  chapter?: Record<string, unknown>
  skipCache?: boolean
}

/**
 * 抓取一章的正文（可能多页），拼成完整文本。
 *
 * BFS 队列 + 分批并发抓取。
 *   - 队列初始 = [第 1 页 URL]
 *   - while 队列非空且 pages.length < MAX_CONTENT_PAGES：
 *       - 取队列头 MAX_CONCURRENT_PAGES 个，并发抓取
 *       - 每抓一页，抓它的 nextUrls，加入队列
 *   - nextUrlSet 防止重复抓取，不会无限循环
 */
export async function getContent(
  source: BookSource, chapterUrl: string,
  options: GetContentOptions = {}
): Promise<string> {
  if (!chapterUrl) {
    logError('reader', 'frontend', '[正文] chapterUrl 为空')
    return '章节链接无效'
  }
  const contentRule = source.ruleContent
  if (!contentRule || !contentRule.content) {
    logError('reader', 'frontend', '[正文] 书源缺少正文规则')
    return '书源缺少正文规则'
  }

  logInfo('reader', 'frontend', `[正文] 开始 url=${chapterUrl.substring(0, 100)}`)

  const headers = await executeHeaderRule(source)
  const book = options.book || {}
  const chapter = options.chapter || { url: chapterUrl }
  const nextChapterUrl = options.nextChapterUrl || ''
  const isComic = source.bookSourceType === 2
  const evaluator = createRuleEvaluator()
  const engineSource = toEngineBookSource(source)
  const ruleObj = contentRule as unknown as Record<string, unknown>

  let resolvedUrl = chapterUrl
  const chRecord = chapter as Record<string, unknown>
  if (typeof chRecord._deferredJs === 'string') {
    resolvedUrl = await resolveChapterUrl(chapterUrl, chRecord._deferredJs, chRecord._deferredResult, source, book)
    chapter.url = resolvedUrl
  }

  const ctx = { source: engineSource, baseUrl: source.bookSourceUrl || '', book, chapter, nextChapterUrl, result: '' }
  const nextUrlSet = new Set<string>()

  // ─── 漫画：只抓第一页，不解密，直接返回 HTML ───
  if (isComic) {
    try {
      const firstPage = await fetchAndDecryptPage(source, resolvedUrl, headers, book, ruleObj, ctx, chapter, nextChapterUrl)
      if (!firstPage) return '正文获取失败'
      if (firstPage.jsExecuted && firstPage.html.includes('<img src="')) {
        let contentStr = firstPage.html
        if (contentRule.imageStyle) contentStr = injectImageStyle(contentStr, contentRule.imageStyle)
        logInfo('reader', 'frontend', `[正文] 漫画直接返回 ${contentStr.length} 字符`)
        return contentStr
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('reader', 'frontend', `[正文] 漫画获取异常: ${msg}`)
      return '正文获取失败'
    }
  }

  // ─── 普通文本：BFS 抓取所有页 ───
  const pages: { url: string; content: string }[] = []

  try {
    // 第一页
    const firstPage = await fetchAndDecryptPage(source, resolvedUrl, headers, book, ruleObj, ctx, chapter, nextChapterUrl)
    if (!firstPage) return '正文获取失败'
    nextUrlSet.add(firstPage.redirectUrl)

    const firstResult = await parseContentPage(
      book as Partial<EngineBook>,
      resolvedUrl,
      firstPage.redirectUrl,
      firstPage.html,
      ruleObj as Parameters<typeof parseContentPage>[4],
      chapter as Partial<EngineChapter>,
      engineSource,
      nextChapterUrl,
      true,
      evaluator,
    )
    if (firstResult.content && firstResult.content.trim()) {
      pages.push({ url: firstPage.redirectUrl, content: firstResult.content.trim() })
    }

    // BFS 队列：第一页的 nextUrls 作为下一轮
    let pending: string[] = []
    for (const u of firstResult.nextUrls) {
      const trimmed = u.trim()
      if (trimmed && !nextUrlSet.has(trimmed)) {
        nextUrlSet.add(trimmed)
        pending.push(trimmed)
      }
    }

    // 循环抓取，直到没有下一页或达到 MAX_CONTENT_PAGES
    while (pending.length > 0 && pages.length < MAX_CONTENT_PAGES) {
      const batch = pending.slice(0, MAX_CONCURRENT_PAGES)
      pending = pending.slice(MAX_CONCURRENT_PAGES)

      const results = await Promise.all(
        batch.map(async (nextUrl) => {
          try {
            const nextPage = await fetchAndDecryptPage(source, nextUrl, headers, book, ruleObj, ctx, chapter, nextChapterUrl)
            if (!nextPage) return null
            const parsed = await parseContentPage(
              book as Partial<EngineBook>,
              nextUrl,
              nextPage.redirectUrl,
              nextPage.html,
              ruleObj as Parameters<typeof parseContentPage>[4],
              chapter as Partial<EngineChapter>,
              engineSource,
              nextChapterUrl,
              true,
              evaluator,
            )
            return {
              url: nextPage.redirectUrl,
              content: parsed.content ? parsed.content.trim() : '',
              nextUrls: parsed.nextUrls,
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logWarn('reader', 'frontend', `[正文] 抓取分页失败 ${nextUrl}: ${msg}`)
            return null
          }
        })
      )

      for (const r of results) {
        if (!r) continue
        if (r.content) pages.push({ url: r.url, content: r.content })

        for (const u of r.nextUrls) {
          const trimmed = u.trim()
          if (trimmed && !nextUrlSet.has(trimmed)) {
            nextUrlSet.add(trimmed)
            pending.push(trimmed)
          }
        }

        if (pages.length >= MAX_CONTENT_PAGES) break
      }
    }

    if (pages.length >= MAX_CONTENT_PAGES && pending.length > 0) {
      logWarn('reader', 'frontend', `[正文] 达到 MAX_CONTENT_PAGES=${MAX_CONTENT_PAGES}，停止抓取`)
    }

    logInfo('reader', 'frontend', `[正文] 共抓取 ${pages.length} 页`)

    let contentStr = pages.map((p) => p.content).join('\n')

    if (contentRule.replaceRegex) {
      try {
        const parts = contentRule.replaceRegex.split('##')
        const pattern = parts[1] || ''
        const replacement = parts[2] || ''
        const replaceFirst = parts.length > 3 && parts[3] === 'true'
        if (pattern) {
          try {
            if (replaceFirst) {
              contentStr = contentStr.replace(new RegExp(pattern), replacement)
            } else {
              contentStr = contentStr.replace(new RegExp(pattern, 'g'), replacement)
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logWarn('reader', 'frontend', `[正文] replaceRegex 失败: ${msg}`)
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logWarn('reader', 'frontend', `[正文] replaceRegex 拆分失败: ${msg}`)
      }
    }

    if (!isComic) {
      contentStr = contentStr.split('\n').map(l => l.trim() ? '\u3000\u3000' + l.trim() : '').join('\n')
      if (!contentStr.startsWith('\u3000\u3000')) contentStr = '\u3000\u3000' + contentStr
    }

    logInfo('reader', 'frontend', `[正文] 完成 ${contentStr.length} 字符`)
    return contentStr
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('reader', 'frontend', `[正文] 异常: ${msg}`)
    return '正文获取失败'
  }
}
