/**
 * JS 执行沙箱 - 对标 Legado JsExtensions.kt
 */

import vm from 'node:vm'
import * as cheerio from 'cheerio'
import { buildJavaAPI } from '../platform/java-bridge.js'
import { putVariable, getVariable } from './index.js'

export interface JsContext {
  source?: any
  baseUrl?: string
  redirectUrl?: string
  book?: any
  chapter?: any
  result?: any
  src?: any
  key?: string
  page?: number
  nextChapterUrl?: string
  [key: string]: any
}

const DANGEROUS_PATTERNS = [
  /require\s*\(/, /import\s*\(/, /process\./, /global\./, /__dirname/, /__filename/,
  /eval\s*\(/, /Function\s*\(/, /new\s+Function/, /child_process/, /exec\s*\(/, /spawn\s*\(/,
  /fork\s*\(/, /fs\./, /http\./, /https\./, /net\./, /dgram\./, /cluster\./, /vm\./,
]

function isDangerous(code: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) return true
  }
  return false
}

function createJavaAPI(context: JsContext): any {
  const baseApi = buildJavaAPI()
  return {
    ...baseApi,
    put: (key: string, value: any) => { putVariable(key, value); return value },
    get: (key: string): any => getVariable(key),
    getString: (key: string): string => { const v = getVariable(key); return v !== undefined && v !== null ? String(v) : '' },
    putBookVariable: (key: string, value: any) => putVariable(key, value),
    getBookVariable: (key: string): any => getVariable(key),
    putChapterVariable: (key: string, value: any) => putVariable(key, value),
    getChapterVariable: (key: string): any => getVariable(key),
    timeFormat: (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN'),
    toNumChapter: (str: string): string => { if (!str) return ''; const m = str.match(/第\s*([零一二三四五六七八九十百千万0-9]+)\s*章/); return m ? m[0] : str },
  }
}

function buildSandbox(context: JsContext): Record<string, any> {
  const java = createJavaAPI(context)
  const Jsoup = { parse: (html: string) => cheerio.load(html || '') }
  
  const sandbox: Record<string, any> = {
    java,
    org: { jsoup: { Jsoup } },
    source: context.source,
    result: context.result || context.source,
    baseUrl: context.baseUrl || '',
    redirectUrl: context.redirectUrl || '',
    src: context.src || context.source,
    key: context.key || '',
    page: context.page || 1,
    nextChapterUrl: context.nextChapterUrl || '',
    book: context.book ? {
      ...context.book,
      putVariable: (key: string, value: any) => putVariable(key, value),
      getVariable: (key: string) => getVariable(key),
      get bookUrl() { return context.book?.bookUrl || '' },
      get name() { return context.book?.name || '' },
      get tocUrl() { return context.book?.tocUrl || '' },
    } : null,
    chapter: context.chapter ? {
      ...context.chapter,
      putVariable: (key: string, value: any) => putVariable(key, value),
      getVariable: (key: string) => getVariable(key),
      get url() { return context.chapter?.url || '' },
      get title() { return context.chapter?.title || '' },
    } : null,
    Math, JSON, Date, String, Number, Boolean, Array, Object,
    encodeURI: encodeURIComponent, decodeURI: decodeURIComponent,
    parseInt, parseFloat, isNaN, isFinite,
    trim: (s: any) => String(s).trim(),
    replace: (s: any, p: string, r: string) => String(s).replace(new RegExp(p, 'g'), r),
    split: (s: any, p: string) => String(s).split(p),
    join: (arr: any[], sep?: string) => Array.isArray(arr) ? arr.join(sep || '') : String(arr),
    filter: (arr: any[], fn: any) => Array.isArray(arr) ? arr.filter(fn) : [],
    map: (arr: any[], fn: any) => Array.isArray(arr) ? arr.map(fn) : [],
    reduce: (arr: any[], fn: any, init: any) => Array.isArray(arr) ? arr.reduce(fn, init) : init,
    isString: (v: any) => typeof v === 'string',
    isNumber: (v: any) => typeof v === 'number',
    isArray: (v: any) => Array.isArray(v),
    isObject: (v: any) => typeof v === 'object' && v !== null && !Array.isArray(v),
    log: (...args: any[]) => console.log('[JS]', ...args),
    error: (...args: any[]) => console.error('[JS]', ...args),
  }
  
  for (const [key, value] of Object.entries(context)) {
    if (key in sandbox) continue
    if (typeof value === 'function') continue
    sandbox[key] = value
  }
  return sandbox
}

export function executeJs(source: any, expression: string, context: JsContext = { source: null }): any {
  if (!source && source !== null) return null
  if (!expression) return null
  if (isDangerous(expression)) { console.error('[RuleParser.js] 拒绝执行危险代码'); return null }
  
  try {
    const sandbox = buildSandbox({ source, ...context })
    const vmContext = vm.createContext(sandbox)
    const script = new vm.Script(`(() => { ${expression} })()`, { timeout: 3000, displayErrors: true } as any)
    const result = script.runInContext(vmContext, { timeout: 3000, displayErrors: true, breakOnSigint: true })
    if (result !== null && result !== undefined) {
      try { return JSON.parse(JSON.stringify(result)) } catch { return result }
    }
    return null
  } catch (error: any) {
    console.warn('[RuleParser.js] 执行失败:', error.message)
    return null
  }
}
