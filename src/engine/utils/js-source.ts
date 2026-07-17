import vm from 'node:vm'
import * as cheerio from 'cheerio'
import jsonpath from 'jsonpath'
import { https, http } from 'atomics-http'
import * as cssWhat from 'css-what'

let _sandboxContext: vm.Context | null = null
const scriptCache = new Map<string, vm.Script>()
const variableStore = new Map<string, any>()

function getSandbox(): vm.Context {
  if (!_sandboxContext) {
    _sandboxContext = vm.createContext({
      JSON, console, String, Number, Boolean, Array, Object,
      parseInt, parseFloat, isNaN, isFinite,
    })
  }
  return _sandboxContext
}

interface IndexSingle { type: 'single'; value: number }
interface IndexRange { type: 'range'; start: number | null; end: number | null; step: number }
type IndexEntry = IndexSingle | IndexRange

interface IndexInfo {
  baseSelector: string
  split: string
  indexes: IndexEntry[]
}

function parseIndexSelector(selector: string): IndexInfo | null {
  const trimmed = selector.trim()
  const bracketMatch = trimmed.match(/^(.*?)\[([^\]]+)\]$/)
  if (bracketMatch) {
    const baseSelector = bracketMatch[1]
    const content = bracketMatch[2]
    let split = '.'
    let idxContent = content
    if (idxContent.startsWith('!')) { split = '!'; idxContent = idxContent.substring(1) }
    const indexes: IndexEntry[] = []
    const parts = idxContent.split(',').map(s => s.trim())
    for (const part of parts) {
      if (part.includes(':')) {
        const segs = part.split(':').map(s => s.trim())
        indexes.push({
          type: 'range',
          start: segs[0] && segs[0] !== '' ? parseInt(segs[0], 10) : null,
          end: segs[1] && segs[1] !== '' ? parseInt(segs[1], 10) : null,
          step: segs[2] ? parseInt(segs[2], 10) : 1,
        })
      } else {
        indexes.push({ type: 'single', value: parseInt(part, 10) })
      }
    }
    return { baseSelector, split, indexes }
  }
  const legacyMatch = trimmed.match(/^(.*?)([!.])([0-9:\-]+)$/)
  if (legacyMatch) {
    const baseSelector = legacyMatch[1]
    const split = legacyMatch[2]
    const nums = legacyMatch[3].split(':').map(s => parseInt(s, 10)).filter(n => !isNaN(n))
    if (split === '.' && nums.length === 1 && nums[0] >= 0 && !legacyMatch[3].includes('-')) return null
    const indexes: IndexEntry[] = nums.map(n => ({ type: 'single' as const, value: n }))
    return { baseSelector, split, indexes }
  }
  return null
}

function applyIndexFilter(elements: any[], indexInfo: IndexInfo): any[] {
  const totalLen = elements.length
  if (totalLen === 0) return []
  const indexSet = new Set<number>()
  for (const entry of indexInfo.indexes) {
    if (entry.type === 'single') {
      let idx = entry.value
      if (idx < 0) idx = totalLen + idx
      if (idx >= 0 && idx < totalLen) indexSet.add(idx)
    } else {
      let start = entry.start
      let end = entry.end
      const step = Math.abs(entry.step) || 1
      if (start === null) start = 0; else if (start < 0) start = totalLen + start
      if (end === null) end = totalLen - 1; else if (end < 0) end = totalLen + end
      if (start < 0 && end < 0) continue
      if (start >= totalLen && end >= totalLen) continue
      if (start >= totalLen) start = totalLen - 1; else if (start < 0) start = 0
      if (end >= totalLen) end = totalLen - 1; else if (end < 0) end = 0
      if (start === end || step >= totalLen) { indexSet.add(start) }
      else if (end > start) { for (let i = start; i <= end; i += step) indexSet.add(i) }
      else { for (let i = start; i >= end; i -= step) indexSet.add(i) }
    }
  }
  const sortedIndexes = [...indexSet].sort((a, b) => a - b)
  if (indexInfo.split === '!') {
    const excludeSet = new Set(sortedIndexes)
    return elements.filter((_, i) => !excludeSet.has(i))
  }
  return sortedIndexes.map(i => elements[i]).filter(el => el !== undefined)
}

function fixSelector(sel: string): string {
  if (!sel || typeof sel !== 'string') return sel
  sel = sel.replace(/\bid\.(\w+)/g, '#')
  sel = sel.replace(/\bclass\.(\w+)/g, '.')
  sel = sel.replace(/\btag\.(\w+)/g, '')
  try {
    const ast = cssWhat.parse(sel)
    const fixed = ast.map((complex: any[]) => {
      const newComplex: any[] = []
      let i = 0
      while (i < complex.length) {
        const part = complex[i]
        if (part.type === 'tag' && part.name === 'tag' && i + 1 < complex.length && complex[i+1].type === 'attribute' && complex[i+1].name === 'class') {
          newComplex.push({ ...part, name: complex[i+1].value }); i += 2
        } else { newComplex.push(part); i++ }
      }
      return newComplex
    })
    return cssWhat.stringify(fixed) as string
  } catch { return sel.replace(/(^|[,\s>+~(])tag\.([a-zA-Z][\w-]*)/g, '$1$2') }
}

function sandboxGetString(data: any, rule: string): string {
  if (!rule || !data) return ''
  try {
    if (rule.startsWith('$.')) {
      const obj = typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data
      const r = jsonpath.query(obj, rule)
      if (r && r.length > 0) return String(r[0])
      return ''
    }
    const html = typeof data === 'string' ? data : String(data)
    const $ = cheerio.load(html)
    const el = $(fixSelector(rule)).first()
    if (el.length === 0) return ''
    const atIdx = rule.lastIndexOf('@')
    if (atIdx > 0) {
      const attr = rule.substring(atIdx + 1)
      if (attr === 'html' || attr === 'outerHTML') return el.html() || ''
      if (attr === 'text') return el.text()
      return el.attr(attr) || ''
    }
    return el.text() || el.attr('href') || el.attr('src') || el.html() || ''
  } catch { return '' }
}

function sandboxGetStringList(data: any, rule: string): string[] {
  if (!rule || !data) return []
  try {
    if (rule.startsWith('$.')) {
      const obj = typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data
      const r = jsonpath.query(obj, rule)
      return (Array.isArray(r) ? r : [r]).map(i => String(i))
    }
    const html = typeof data === 'string' ? data : String(data)
    const $ = cheerio.load(html)
    const atIdx = rule.lastIndexOf('@')
    let sel = rule, attr = ''
    if (atIdx > 0) { sel = rule.substring(0, atIdx); attr = rule.substring(atIdx + 1) }
    const results: string[] = []
    $(fixSelector(sel)).each((_i: number, el: any) => {
      if (attr === 'html') results.push($(el).html() || '')
      else if (attr === 'text') results.push($(el).text())
      else if (attr) results.push($(el).attr(attr) || '')
      else results.push($(el).text() || $(el).attr('href') || '')
    })
    return results
  } catch { return [] }
}

function buildJsoupDocument(html: string): any {
  const $ = cheerio.load(html)
  const body = $('body')

  function buildElementList(elements: cheerio.Cheerio<any>): any {
    const arr: any = []
    const len = elements.length
    for (let i = 0; i < len; i++) arr[i] = buildElement($(elements[i]))
    arr.length = len
    arr.size = () => len
    arr.isEmpty = () => len === 0

    arr.select = (sel: string) => {
      const indexInfo = parseIndexSelector(sel)
      let rawElements: cheerio.Cheerio<any>
      if (indexInfo) {
        rawElements = elements.find(fixSelector(indexInfo.baseSelector))
      } else {
        rawElements = elements.find(fixSelector(sel))
      }
      let resultArr = buildElementList(rawElements)
      if (indexInfo) {
        const rawArr: any[] = []
        const rawLen = rawElements.length
        for (let j = 0; j < rawLen; j++) rawArr.push(rawElements[j])
        const filtered = applyIndexFilter(rawArr, indexInfo)
        const newArr: any = []
        const newLen = filtered.length
        for (let j = 0; j < newLen; j++) newArr[j] = buildElement($(filtered[j]))
        newArr.length = newLen
        newArr.size = () => newLen
        newArr.isEmpty = () => newLen === 0
        newArr.select = arr.select
        newArr.remove = arr.remove
        newArr.get = (i: number) => newArr[i] || null
        newArr.first = () => newArr[0] || null
        newArr.last = () => newArr[newLen - 1] || null
        newArr.toArray = () => { const r: any[] = []; for (let j = 0; j < newLen; j++) r.push(newArr[j]); return r }
        newArr.forEach = (fn: any) => { for (let j = 0; j < newLen; j++) fn(newArr[j], j) }
        newArr.subList = (from: number, to: number) => { const sub: any[] = []; for (let j = from; j < Math.min(to, newLen); j++) sub.push(newArr[j]); return sub }
        newArr.clear = () => {}
        newArr.toString = () => filtered.map((e: any) => $(e).html() || $(e).text() || '').join('\n')
        newArr.text = () => filtered.map((e: any) => $(e).text()).join('')
        newArr.html = () => filtered.map((e: any) => $(e).html() || '').join('\n')
        newArr.attr = (name: string) => filtered.map((e: any) => $(e).attr(name) || '').join(',')
        const parents: any[] = []
        for (const e of filtered) {
          const p = $(e).parent()
          if (p.length > 0) parents.push(p)
        }
        newArr.parents = () => buildElementList($(parents as any))
        newArr.contains = (_other: any) => false
        return newArr
      }
      return resultArr
    }

    arr.remove = () => { elements.remove(); return arr }
    arr.get = (i: number) => arr[i] || null
    arr.first = () => arr[0] || null
    arr.last = () => arr[len - 1] || null
    arr.toArray = () => { const r: any[] = []; for (let i = 0; i < len; i++) r.push(arr[i]); return r }
    arr.forEach = (fn: any) => { for (let i = 0; i < len; i++) fn(arr[i], i) }
    arr.subList = (from: number, to: number) => { const sub: any[] = []; for (let i = from; i < Math.min(to, len); i++) sub.push(arr[i]); return sub }
    arr.clear = () => {}
    arr.toString = () => elements.html() || elements.text() || ''
    arr.match = (re: RegExp) => (elements.html() || elements.text() || '').match(re)
    arr.text = () => elements.text()
    arr.html = () => elements.html() || ''
    arr.outerHtml = () => elements.html() || ''
    arr.attr = (name: string) => elements.attr(name) || ''
    arr.parents = () => buildElementList(elements.parents() as any)
    arr.contains = (_other: any) => false
    arr.eachText = () => buildElementList(elements.filter((_i: number, e: any) => $(e).text().trim()) as any)
    arr.eq = (i: number) => $(elements[i])
    arr.children = () => buildElementList(elements.children() as any)
    return arr
  }

  function buildElement(el: any): any {
    if (!el || el.length === 0) return null
    return {
      text: () => el.text(),
      ownText: () => el.contents().filter((_i: number, node: any) => node.type === 'text').text().trim() || '',
      html: () => el.html() || '',
      outerHtml: () => el.html() || '',
      attr: (name: string) => el.attr(name) || '',
      select: (sel: string) => buildElementList(el.find(fixSelector(sel)) as any),
      tagName: () => (el.prop('tagName') || el[0]?.name || '').toLowerCase(),
      parent: () => buildElement(el.parent()),
      parents: () => buildElementList(el.parents() as any),
      children: () => buildElementList(el.children() as any),
      remove: () => {},
      toString: () => el.html() || el.text() || '',
      match: (re: RegExp) => (el.html() || el.text() || '').match(re),
      contains: (_other: any) => false,
      eachText: () => buildElementList(el.find('*').filter((_i: number, e: any) => $(e).text().trim()) as any),
      eq: (i: number) => $(el.eq ? el.eq(i) : el),
      siblings: () => buildElementList(el.siblings() as any),
      next: () => buildElement(el.next()),
      prev: () => buildElement(el.prev()),
      data: () => el.data ? el.data() || '' : '',
    }
  }

  return {
    select: (sel: string) => buildElementList($(fixSelector(sel)) as any),
    text: () => body.text(),
    html: () => $.html() || '',
    outerHtml: () => $.html() || '',
    title: () => $('title').text() || '',
    body: () => ({
      text: () => body.text(),
      html: () => body.html() || '',
      outerHtml: () => body.html() || '',
      select: (sel: string) => buildElementList(body.find(fixSelector(sel)) as any),
      children: () => buildElementList(body.children() as any),
    }),
    head: () => ({
      html: () => $('head').html() || '',
      select: (sel: string) => buildElementList($('head').find(fixSelector(sel)) as any),
    }),
  }
}

/**
 * 将 JS 代码中的 let/const 声明转为 var（兼容 vm.Script 沙箱）
 */
function compatLetConst(code: string): string {
  return code
    .replace(/\blet\s+/g, 'var ')
    .replace(/\bconst\s+/g, 'var ')
}

export function executeJs(result: any, jsCode: string, context: any = {}): any {
  if (!jsCode) return result
  let { source = {}, book = {}, baseUrl = '', chapter = null, nextChapterUrl = null, src = result, cookie = null } = context
  if (!chapter) chapter = {}
  if (!book) book = {}
  if (!book.bookUrl) book.bookUrl = context.book?.bookUrl || ''
  if (!book.tocUrl) book.tocUrl = context.book?.tocUrl || book.bookUrl || ''
  if (!book.name) book.name = context.book?.name || ''
  if (!book.author) book.author = context.book?.author || ''
  if (!book.kind) book.kind = context.book?.kind || ''
  if (!chapter.title) chapter.title = context.chapter?.title || ''
  try {
    const sandbox = getSandbox()
    ;(sandbox as any).result = result
    ;(sandbox as any).book = book
    ;(sandbox as any).source = source
    ;(sandbox as any).baseUrl = baseUrl
    ;(sandbox as any).chapter = chapter
    ;(sandbox as any).nextChapterUrl = nextChapterUrl
    ;(sandbox as any).src = src
    ;(sandbox as any).cookie = cookie
    const sourceKey = source?.bookSourceUrl || source?.url || 'default'
    const ajaxSync = (url: any): string => {
      try {
        const urlStr = Array.isArray(url) ? String(url[0]) : String(url)
        const mod = urlStr.startsWith('https') ? https : http
        const req = mod.request(urlStr)
        req.setTimeout(10000)
        const res = req.end()
        const body = res.body
        if (Buffer.isBuffer(body)) return body.toString('utf-8')
        if (typeof body === 'string') return body
        return JSON.stringify(body)
      } catch { return '' }
    }
    let _sandboxContent: any = null
    let _sandboxBaseUrl: string = ''
    ;(sandbox as any).java = {
      put: (key: string, value: any) => { variableStore.set(sourceKey + '::' + key, value); return value },
      get: (key: string) => {
        const val = variableStore.get(sourceKey + '::' + key)
        if (val === undefined) return ''
        return val
      },
      ajax: ajaxSync,
      setContent: (content: any, baseUrl?: string) => { _sandboxContent = content; if (baseUrl) _sandboxBaseUrl = baseUrl },
      getString: (rule: string, mContent?: any) => sandboxGetString(mContent || _sandboxContent, rule),
      getStringList: (rule: string, mContent?: any) => sandboxGetStringList(mContent || _sandboxContent, rule),
      base64Decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),
      base64Encode: (str: string) => Buffer.from(str).toString('base64'),
      md5Encode: (str: string) => require('crypto').createHash('md5').update(str).digest('hex'),
      log: (msg: any) => { console.log('[js-sandbox]', msg); return msg },
      getCookie: (_tag: string, _key?: string) => '',
      connect: (urlStr: string) => ({ body: '', url: urlStr, headers: {}, statusCode: () => 200 }),
    }
    if (!book.putVariable) book.putVariable = (key: string, value: string) => { variableStore.set(sourceKey + '::' + key, value) }
    if (!book.getVariable) book.getVariable = (key: string) => variableStore.get(sourceKey + '::' + key) || ''
    if (!book.setReverseToc) book.setReverseToc = (_val: boolean) => {}
    if (!book.getReverseToc) book.getReverseToc = () => false
    if (!chapter.putVariable) chapter.putVariable = (key: string, value: string) => { variableStore.set(sourceKey + '::chapter::' + key, value) }
    if (!chapter.getVariable) chapter.getVariable = (key: string) => variableStore.get(sourceKey + '::chapter::' + key) || ''
    ;(sandbox as any).org = { jsoup: { Jsoup: { parse: (html: string) => buildJsoupDocument(html) } } }

    // 兼容 let/const → var
    const compatCode = compatLetConst(jsCode)

    const trimmed = compatCode.trim()
    const lastSemi = trimmed.lastIndexOf(';')
    const lastNewline = trimmed.lastIndexOf('\n')
    const splitPoint = Math.max(lastSemi, lastNewline)
    let code: string
    if (splitPoint > 0) {
      const prefix = trimmed.substring(0, splitPoint + (lastSemi >= lastNewline ? 1 : 0))
      let suffix = trimmed.substring(splitPoint + (lastSemi >= lastNewline ? 1 : 0)).trim()
      if (suffix && !suffix.startsWith('return ') && !suffix.startsWith('if ') && !suffix.startsWith('if(') &&
        !suffix.startsWith('for ') && !suffix.startsWith('for(') &&
        !suffix.startsWith('while ') && !suffix.startsWith('while(') &&
        !suffix.startsWith('var ') &&
        !suffix.startsWith('}') && !suffix.startsWith('//')) { suffix = 'return ' + suffix }
      code = prefix + '\n' + suffix
    } else { code = trimmed }
    const wrappedCode = '(function() {\n' + code + '\n})()'
    let script = scriptCache.get(wrappedCode)
    if (!script) { script = new vm.Script(wrappedCode); scriptCache.set(wrappedCode, script) }
    const output = script.runInContext(sandbox, { timeout: 5000 })
    if (output && typeof output === 'object' && typeof output.size === 'function' && typeof output.get === 'function') {
      const arr: any = []
      const len = output.size()
      for (let i = 0; i < len; i++) arr.push(output.get(i))
      ;(arr as any).size = output.size
      ;(arr as any).select = output.select
      ;(arr as any).remove = output.remove
      ;(arr as any).subList = output.subList
      ;(arr as any).clear = output.clear
      ;(arr as any).isEmpty = output.isEmpty
      return arr
    }
    if (typeof output === 'string') return output
    if (output !== undefined && output !== null) return JSON.stringify(output)
    return ''
  } catch (e: any) {
    console.warn('[js-source] 执行失败:', e.message)
    return ''
  }
}
