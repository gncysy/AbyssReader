/**
 * AnalyzeUrl - URL 规则解析（兼容 legado 书源格式）
 * 
 * 支持的格式：
 * - 基础 URL，含 @js: 片段执行
 * - {{key}} 变量替换、{{js表达式}} 内联 JS
 * - <page1,page2,page3> 分页参数
 * - ,{ method: "POST", headers: {...}, body: "...", charset: "gbk", webView: true } URL 选项
 */

/**
 * URL 选项接口（对应 legado UrlOption）
 */
export interface UrlOption {
  method?: string
  charset?: string
  headers?: Record<string, string>
  body?: string
  retry?: number
  type?: string
  webView?: boolean
  webJs?: string
  js?: string
  serverID?: number
  webViewDelayTime?: number
}

export interface AnalyzeUrlResult {
  url: string
  urlNoQuery: string
  encodedQuery?: string
  encodedForm?: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: string | null
  charset: string | null
  type: string | null
  retry: number
  useWebView: boolean
  webJs: string | null
  serverID: number | null
  webViewDelayTime: number
  baseUrl: string
}

const PAGE_PATTERN = /<([^>]*)>/g
const PARAM_PATTERN = /\s*,\s*(?=\{)/

/**
 * 执行 JS 表达式
 */
function evalJsExpr(jsStr: string, context: Record<string, any>): any {
  try {
    const fn = new Function(
      ...Object.keys(context),
      `return (${jsStr})`
    )
    return fn(...Object.values(context))
  } catch {
    return ''
  }
}

/**
 * 解析 URL 选项 JSON（末尾的 ,{...}）
 */
function parseUrlOption(optionStr: string): UrlOption | null {
  try {
    // 替换单引号为双引号
    const normalized = optionStr.replace(/'/g, '"')
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

/**
 * 构建完整 URL
 */
export function buildUrl(
  url: string,
  baseUrl: string,
  variables: Record<string, any> = {}
): string {
  if (!url) return ''

  let result = url

  for (const [key, val] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      encodeURIComponent(String(val))
    )
  }

  if (result.startsWith('/')) {
    try {
      const base = new URL(baseUrl)
      result = base.origin + result
    } catch {
      const origin = baseUrl.match(/^(https?:\/\/[^/]+)/)
      if (origin) result = origin[1] + result
      else result = baseUrl + result
    }
  } else if (!result.match(/^https?:\/\//)) {
    const base = baseUrl.replace(/\/+$/, '')
    if (base.match(/^https?:\/\//)) {
      result = base + '/' + result.replace(/^\/+/, '')
    } else {
      result = 'https://' + base.replace(/^\/+/, '') + '/' + result.replace(/^\/+/, '')
    }
  }

  return result
}

/**
 * 完整的 AnalyzeUrl 解析（兼容 legado）
 * @param ruleUrl 规则 URL 字符串
 * @param options 上下文选项
 */
export function analyzeUrl(
  ruleUrl: string,
  options: {
    baseUrl?: string
    key?: string
    page?: number
    speakText?: string
    speakSpeed?: number
    source?: any
    book?: any
    chapter?: any
    headerMap?: Record<string, string>
    coroutineContext?: any
  } = {}
): AnalyzeUrlResult {
  let baseUrl = options.baseUrl || ''

  // 去掉 baseUrl 中的参数部分
  const urlMatcher = PARAM_PATTERN.exec(baseUrl)
  if (urlMatcher) {
    baseUrl = baseUrl.substring(0, urlMatcher.index)
  }

  const headerMap: Record<string, string> = {}
  if (options.headerMap) {
    Object.assign(headerMap, options.headerMap)
  }
  if (options.source?.header) {
    try {
      const h = typeof options.source.header === 'string'
        ? JSON.parse(options.source.header)
        : options.source.header
      Object.assign(headerMap, h)
    } catch {}
  }

  let ruleUrlProcessed = ruleUrl

  // 1. 执行 @js: 片段
  ruleUrlProcessed = ruleUrlProcessed.replace(/<js>([\s\S]*?)<\/js>|@js:([^\s,{]+)/gi,
    (_m: string, tagContent?: string, attrContent?: string) => {
      const code = (tagContent || attrContent || '').trim()
      if (!code) return ''
      const ctx: Record<string, any> = {
        result: ruleUrlProcessed,
        baseUrl,
        key: options.key,
        page: options.page,
        speakText: options.speakText,
        speakSpeed: options.speakSpeed,
        book: options.book,
        source: options.source,
        chapter: options.chapter,
      }
      const val = evalJsExpr(code, ctx)
      return val !== undefined && val !== null ? String(val) : ''
    }
  )

  // 处理 @result 占位符
  let jsResult = ruleUrlProcessed
  ruleUrlProcessed = ruleUrlProcessed.replace(/@result/g, () => jsResult)

  // 2. 替换 {{js}} 内嵌表达式
  ruleUrlProcessed = ruleUrlProcessed.replace(/\{\{([^}]+)\}\}/g, (_m: string, expr: string) => {
    const trimmed = expr.trim()
    if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
      const key = trimmed
      if (key === 'key' && options.key !== undefined) return encodeURIComponent(String(options.key))
      if (key === 'page' && options.page !== undefined) return String(options.page)
      if (key === 'speakText' && options.speakText !== undefined) return encodeURIComponent(String(options.speakText))
      if (key === 'speakSpeed' && options.speakSpeed !== undefined) return String(options.speakSpeed)
      const sourceKey = options.source?.bookSourceUrl || options.source?.url || 'default'
      // 尝试从 source/book/chapter 获取
      if (options.source?.[key] !== undefined) return encodeURIComponent(String(options.source[key]))
      if (options.book?.[key] !== undefined) return encodeURIComponent(String(options.book[key]))
      return ''
    }
    try {
      const fn = new Function(
        'result', 'baseUrl', 'key', 'page', 'source', 'book',
        `return (${trimmed})`
      )
      const val = fn(ruleUrlProcessed, baseUrl, options.key, options.page, options.source, options.book)
      if (val === null || val === undefined) return ''
      if (typeof val === 'number' && val % 1 === 0) return String(Math.floor(val))
      return String(val)
    } catch {
      return ''
    }
  })

  // 3. 替换 <page> 分页参数
  if (options.page !== undefined && options.page > 0) {
    const page = options.page
    ruleUrlProcessed = ruleUrlProcessed.replace(PAGE_PATTERN, (_m: string, pagesStr: string) => {
      const pages = pagesStr.split(',').map((s: string) => s.trim())
      if (page <= pages.length) {
        return pages[page - 1]
      }
      return pages[pages.length - 1]
    })
  }

  // 4. 解析 URL 选项（末尾 ,{...}）
  let urlNoOption = ruleUrlProcessed
  let option: UrlOption | null = null

  const paramMatch = PARAM_PATTERN.exec(ruleUrlProcessed)
  if (paramMatch) {
    urlNoOption = ruleUrlProcessed.substring(0, paramMatch.index)
    const optionStr = ruleUrlProcessed.substring(paramMatch.index + 1) // 跳过逗号
    option = parseUrlOption(optionStr)
  }

  // 5. 处理 URL
  let url = buildUrl(urlNoOption, baseUrl)
  if (url) {
    try {
      const parsed = new URL(url)
      baseUrl = parsed.origin
    } catch {}
  }

  // 6. 应用 URL 选项
  const method: 'GET' | 'POST' =
    option?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET'

  if (option?.headers) {
    Object.assign(headerMap, option.headers)
  }

  let body: string | null = option?.body || null
  if (typeof body === 'object' && body !== null) {
    try { body = JSON.stringify(body) } catch { body = null }
  }

  // 如果 option 中有 js，执行它并替换 url
  if (option?.js) {
    const ctx: Record<string, any> = {
      result: url,
      baseUrl,
      key: options.key,
      page: options.page,
      book: options.book,
      source: options.source,
    }
    const jsResult = evalJsExpr(option.js, ctx)
    if (jsResult !== undefined && jsResult !== null && jsResult !== '') {
      url = String(jsResult)
    }
  }

  // 7. 分离 query / form
  let urlNoQuery = url
  let encodedQuery: string | undefined
  let encodedForm: string | undefined

  if (method === 'GET') {
    const pos = url.indexOf('?')
    if (pos !== -1) {
      urlNoQuery = url.substring(0, pos)
      encodedQuery = url.substring(pos + 1)
    }
  } else if (method === 'POST' && body) {
    if (!body.startsWith('{') && !body.startsWith('[') && !headerMap['Content-Type']) {
      // form 编码的 body
      encodedForm = encodeParams(body, option?.charset || null)
    }
  }

  return {
    url,
    urlNoQuery,
    encodedQuery,
    encodedForm,
    method,
    headers: headerMap,
    body,
    charset: option?.charset || null,
    type: option?.type || null,
    retry: option?.retry || 0,
    useWebView: option?.webView === true,
    webJs: option?.webJs || null,
    serverID: option?.serverID || null,
    webViewDelayTime: Math.max(0, option?.webViewDelayTime || 0),
    baseUrl,
  }
}

/**
 * 编码查询参数或表单字段
 */
function encodeParams(params: string, charset: string | null): string {
  if (!params) return ''
  if (charset) {
    // 有指定 charset，按指定编码
    try {
      return params.split('&').map(pair => {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) return encodeURIComponent(pair)
        const key = pair.substring(0, eqIdx)
        const value = pair.substring(eqIdx + 1)
        return encodeURIComponent(key) + '=' + encodeURIComponent(value)
      }).join('&')
    } catch {
      return params
    }
  }
  // 无 charset，检查是否已编码
  if (/^[\w%+./=-]+$/.test(params)) return params
  try {
    return params.split('&').map(pair => {
      const eqIdx = pair.indexOf('=')
      if (eqIdx === -1) return encodeURIComponent(pair)
      const key = pair.substring(0, eqIdx)
      const value = pair.substring(eqIdx + 1)
      return encodeURIComponent(key) + '=' + encodeURIComponent(value)
    }).join('&')
  } catch {
    return params
  }
}

// ===== 以下为原有兼容导出 =====

export function parseRequestConfig(
  url: string
): {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: any
  charset: string | null
} {
  const result = analyzeUrl(url)
  return {
    url: result.url,
    method: result.method,
    headers: result.headers,
    body: result.body,
    charset: result.charset,
  }
}

export function buildHeaders(
  source: { header?: string | Record<string, string> | null },
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...extraHeaders,
  }
  if (source.header) {
    try {
      const h = typeof source.header === 'string' ? JSON.parse(source.header) : source.header
      Object.assign(headers, h)
    } catch {}
  }
  return headers
}

export function resolveUrl(url: string, baseUrl: string): string {
  return buildUrl(url, baseUrl)
}

export function isJsonResponse(headers: Record<string, string>): boolean {
  const contentType = headers['content-type'] || headers['Content-Type'] || ''
  return contentType.includes('application/json')
}

export function safeParseJson<T = any>(data: any): T | null {
  if (typeof data === 'object' && data !== null) return data as T
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return null }
  }
  return null
}

export function cleanIntro(intro: string, maxLength: number = 500): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}
