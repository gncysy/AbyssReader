/**
 * JS 执行沙箱 - 对标 Legado JsExtensions.kt
 */

import vm from 'node:vm'
import * as cheerio from 'cheerio'
import { buildJavaAPI } from '../platform/java-bridge.js'
import { putVariable, getVariable } from './variable.js'

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

// ===== org.jsoup 完整模拟 =====
function createJsoupElement(el: any, $: any): any {
  if (!el) return null
  
  // 基础属性
  const base = {
    tag: () => el.name || '',
    text: () => $(el).text(),
    html: () => $(el).html() || '',
    outerHtml: () => $.html(el),
    hasAttr: (name: string) => $(el).attr(name) !== undefined,
    remove: () => { $(el).remove(); return el },
    removeAttr: (name: string) => { $(el).removeAttr(name); return el },
    addClass: (cls: string) => { $(el).addClass(cls); return el },
    removeClass: (cls: string) => { $(el).removeClass(cls); return el },
    hasClass: (cls: string) => $(el).hasClass(cls),
    parent: () => createJsoupElement($(el).parent()[0], $),
    parents: () => createJsoupElements($(el).parents(), $),
    children: () => createJsoupElements($(el).children(), $),
    siblings: () => createJsoupElements($(el).siblings(), $),
    next: () => createJsoupElement($(el).next()[0], $),
    prev: () => createJsoupElement($(el).prev()[0], $),
    first: () => createJsoupElement($(el).first()[0], $),
    last: () => createJsoupElement($(el).last()[0], $),
    eq: (i: number) => createJsoupElement($(el).eq(i)[0], $),
    get: (i: number) => createJsoupElement($(el).get(i), $),
    size: () => $(el).length,
    val: () => $(el).val() || '',
    append: (html: string) => { $(el).append(html); return el },
    prepend: (html: string) => { $(el).prepend(html); return el },
    after: (html: string) => { $(el).after(html); return el },
    before: (html: string) => { $(el).before(html); return el },
    wrap: (html: string) => { $(el).wrap(html); return el },
    unwrap: () => { $(el).unwrap(); return el },
    empty: () => { $(el).empty(); return el },
    clone: () => createJsoupElement($(el).clone()[0], $),
    toArray: () => createJsoupElements($(el), $),
    each: (fn: (i: number, el: any) => void) => { 
      $(el).each((i: number, e: any) => fn(i, createJsoupElement(e, $))) 
    },
  }
  
  // attr 和 val 支持重载，单独处理
  const attr = (name: string, value?: any) => {
    if (value !== undefined) {
      $(el).attr(name, value)
      return el
    }
    return $(el).attr(name) || ''
  }
  
  const val = (v?: any) => {
    if (v !== undefined) {
      $(el).val(v)
      return el
    }
    return $(el).val() || ''
  }
  
  return { ...base, attr, val }
}

function createJsoupElements(elements: any, $: any): any {
  const arr = elements.toArray ? elements.toArray() : elements
  const result = arr.map((el: any) => createJsoupElement(el, $))
  
  result.size = () => result.length
  result.first = () => result[0] || null
  result.last = () => result[result.length - 1] || null
  result.get = (i: number) => result[i] || null
  result.each = (fn: (i: number, el: any) => void) => { 
    result.forEach((el: any, i: number) => fn(i, el)) 
  }
  result.select = (selector: string) => {
    const selected = $(elements).find(selector)
    return createJsoupElements(selected, $)
  }
  result.text = () => $(elements).text()
  result.html = () => $(elements).html() || ''
  result.outerHtml = () => {
    let html = ''
    elements.each((i: number, el: any) => { html += $.html(el) })
    return html
  }
  result.remove = () => { $(elements).remove(); return result }
  result.attr = (name: string) => $(elements).attr(name) || ''
  result.hasAttr = (name: string) => $(elements).attr(name) !== undefined
  
  return result
}

const Jsoup = {
  parse: (html: string) => {
    const $ = cheerio.load(html || '', { decodeEntities: false })
    const root = $.root()
    return {
      $,
      root: () => root,
      select: (selector: string) => createJsoupElements($(selector), $),
      text: () => $('body').text(),
      html: () => $('body').html() || '',
      outerHtml: () => $.html(),
      title: () => $('title').text() || '',
      body: () => createJsoupElement($('body')[0], $),
      head: () => createJsoupElement($('head')[0], $),
      getElementsByTag: (tag: string) => createJsoupElements($(tag), $),
      getElementById: (id: string) => createJsoupElement($('#' + id)[0], $),
      getElementsByClass: (cls: string) => createJsoupElements($('.' + cls), $),
      getElementsByAttribute: (attr: string) => createJsoupElements($('[' + attr + ']'), $),
      getElementsByAttributeValue: (attr: string, val: string) => createJsoupElements($('[' + attr + '="' + val + '"]'), $),
    }
  }
}
const org = { jsoup: { Jsoup } }

function createJavaAPI(context: JsContext): any {
  const baseApi = buildJavaAPI()
  return {
    ...baseApi,
    put: (key: string, value: any) => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      putVariable(key, value, sourceId)
      return value
    },
    get: (key: string): any => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      return getVariable(key, sourceId)
    },
    getString: (key: string): string => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      const v = getVariable(key, sourceId)
      return v !== undefined && v !== null ? String(v) : ''
    },
    putBookVariable: (key: string, value: any) => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      putVariable(key, value, sourceId)
    },
    getBookVariable: (key: string): any => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      return getVariable(key, sourceId)
    },
    putChapterVariable: (key: string, value: any) => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      putVariable(key, value, sourceId)
    },
    getChapterVariable: (key: string): any => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      return getVariable(key, sourceId)
    },
    timeFormat: (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN'),
    toNumChapter: (str: string): string => {
      if (!str) return ''
      const m = str.match(/第\s*([零一二三四五六七八九十百千万0-9]+)\s*章/)
      return m ? m[0] : str
    },
    getElements: (selector: string, html: string) => {
      const { dom } = require('../platform/modules/dom.js')
      const result = dom.getElements(selector, html)
      const wrapped = result.map((el: any) => ({
        text: () => el.text || '',
        html: () => el.html || '',
        outerHtml: () => el.outerHTML || '',
        attr: (name: string) => el.attributes?.[name] || '',
        tag: () => el.tag || '',
      }))
      wrapped.size = () => wrapped.length
      wrapped.first = () => wrapped[0] || null
      wrapped.get = (i: number) => wrapped[i] || null
      return wrapped
    },
    getStringValue: (selector: string, html: string) => { const { dom } = require("../platform/modules/dom.js"); return dom.getString(selector, html) },
    getStringList: (selector: string, html: string) => {
      const { dom } = require('../platform/modules/dom.js')
      return dom.getStringList(selector, html)
    },
    getElement: (selector: string, html: string) => {
      const { dom } = require('../platform/modules/dom.js')
      const el = dom.getElement(selector, html)
      if (!el) return null
      return {
        text: () => el.text || '',
        html: () => el.html || '',
        outerHtml: () => el.outerHTML || '',
        attr: (name: string) => el.attributes?.[name] || '',
        tag: () => el.tag || '',
      }
    },
    setContent: (html: string, baseUrl?: string) => {
      const { dom } = require('../platform/modules/dom.js')
      dom.setContent(html, baseUrl)
    },
    getContent: () => {
      const { dom } = require('../platform/modules/dom.js')
      return dom.getContent()
    },
    getContentBaseUrl: () => {
      const { dom } = require('../platform/modules/dom.js')
      return dom.getContentBaseUrl()
    },
    clearContentCache: () => {
      const { dom } = require('../platform/modules/dom.js')
      dom.clearContentCache()
    },
  }
}

function buildSandbox(context: JsContext): Record<string, any> {
  const java = createJavaAPI(context)

  // ===== 按书源隔离的 cache =====
  const _cacheData = new Map<string, Map<string, { value: any; expire: number }>>()

  const cache = {
    _getSourceMap: () => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      if (!_cacheData.has(sourceId)) {
        _cacheData.set(sourceId, new Map())
      }
      return _cacheData.get(sourceId)!
    },
    put: (key: string, value: any, ttl?: number) => {
      const map = cache._getSourceMap()
      const expire = ttl && ttl > 0 ? Date.now() + ttl * 1000 : 0
      map.set(key, { value, expire })
    },
    get: (key: string) => {
      const map = cache._getSourceMap()
      const entry = map.get(key)
      if (!entry) return null
      if (entry.expire > 0 && Date.now() > entry.expire) {
        map.delete(key)
        return null
      }
      return entry.value
    },
    clear: () => {
      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      _cacheData.delete(sourceId)
    },
  }

  const sandbox: Record<string, any> = {
    java,
    cache,
    org,
    source: context.source,
    result: context.result || context.source,
    baseUrl: context.baseUrl || '',
    redirectUrl: context.redirectUrl || '',
    src: context.src || context.source,
    key: context.key || '',
    page: context.page || 1,
    nextChapterUrl: context.nextChapterUrl || '',
    book: context.book ? {
      ...JSON.parse(JSON.stringify(context.book)),
      kind: context.book.kind || '',
      bookUrl: context.book.bookUrl || '',
      name: context.book.name || '',
      tocUrl: context.book.tocUrl || '',
      putVariable: (key: string, value: any) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        putVariable(key, value, sourceId)
      },
      getVariable: (key: string) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        return getVariable(key, sourceId)
      },
    } : {
      kind: '',
      bookUrl: '',
      name: '',
      tocUrl: '',
      putVariable: (key: string, value: any) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        putVariable(key, value, sourceId)
      },
      getVariable: (key: string) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        return getVariable(key, sourceId)
      },
    },
    chapter: context.chapter ? {
      ...JSON.parse(JSON.stringify(context.chapter)),
      url: context.chapter.url || '',
      title: context.chapter.title || '',
      putVariable: (key: string, value: any) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        putVariable(key, value, sourceId)
      },
      getVariable: (key: string) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        return getVariable(key, sourceId)
      },
    } : {
      url: '',
      title: '',
      putVariable: (key: string, value: any) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        putVariable(key, value, sourceId)
      },
      getVariable: (key: string) => {
        const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
        return getVariable(key, sourceId)
      },
    },
    Math,
    JSON,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    encodeURI: encodeURIComponent,
    decodeURI: decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
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
  if (isDangerous(expression)) {
    console.error('[RuleParser.js] 拒绝执行危险代码')
    return null
  }

  try {
    const sandbox = buildSandbox({ source, ...context })
    const vmContext = vm.createContext(sandbox)
    const script = new vm.Script(`(() => { ${expression} })()`, {
      timeout: 3000,
      displayErrors: true,
    } as any)
    const result = script.runInContext(vmContext, {
      timeout: 3000,
      displayErrors: true,
      breakOnSigint: true,
    })
    if (result !== null && result !== undefined) {
      try {
        return JSON.parse(JSON.stringify(result))
      } catch {
        return result
      }
    }
    return null
  } catch (error: any) {
    console.warn('[RuleParser.js] 执行失败:', error.message)
    return null
  }
}

