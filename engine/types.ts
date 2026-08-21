// ============================================
// 引擎类型 — 单一数据源（零外部依赖）
// ============================================

export interface EngineBookSource {
  bookSourceName?: string
  bookSourceUrl?: string
  name?: string
  bookSourceType?: number
  bookSourceGroup?: string | null
  bookUrlPattern?: string | null
  header?: string | null
  searchUrl?: string | null
  exploreUrl?: string | null
  ruleSearch?: Record<string, unknown> | null
  ruleBookInfo?: Record<string, unknown> | null
  ruleToc?: Record<string, unknown> | null
  ruleContent?: string | Record<string, unknown> | null
  ruleExplore?: Record<string, unknown> | null
  enabled?: boolean
  [key: string]: unknown
}

export interface EngineBook {
  name?: string
  author?: string
  bookUrl?: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  tocUrl?: string | null
  wordCount?: string | null
  [key: string]: unknown
}

export interface EngineChapter {
  id?: number
  title?: string
  url?: string
  index?: number
  isVip?: boolean
  isPay?: boolean
  updateTime?: string | undefined
  wordCount?: string | undefined
  _deferredJs?: string | undefined
  _deferredResult?: unknown
  [key: string]: unknown
}

export interface ParseContext {
  source?: EngineBookSource
  book?: Partial<EngineBook>
  chapter?: Partial<EngineChapter>
  baseUrl?: string
  nextChapterUrl?: string
  page?: number
  key?: string
  isUrl?: boolean
  result?: unknown
  src?: unknown
  [key: string]: unknown
}

export type RuleMode = 'css' | 'json' | 'xpath' | 'js' | 'regex' | 'webjs' | 'default'

export interface SourceRule {
  mode: RuleMode
  rule: string
  replaceRegex?: string
  replacement?: string
  replaceFirst?: boolean
  putMap?: Record<string, string>
  _combineType?: '&&' | '||' | '%%'
}

export interface UrlAnalysis {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: string | null
  charset: string | null
  retry: number
  useWebView: boolean
  webJs: string | null
  serverID: number | null
  baseUrl: string
  bodyJs: string | null
  webViewDelayTime: number
}

export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | undefined
  headers?: Record<string, string> | undefined
  body?: unknown
  timeout?: number | undefined
  retry?: number | undefined
  followRedirect?: boolean | undefined
  responseType?: 'text' | 'arraybuffer' | 'json' | undefined
  charset?: string | undefined
  useWebView?: boolean | undefined
  webJs?: string | null | undefined
  sourceType?: number | undefined
  bodyJs?: string | null | undefined
}

export interface ResponseData {
  status: number
  data: string | ArrayBuffer
  headers: Record<string, string>
  url: string
  duration: number
}

export interface JsRuntime {
  execute(code: string, context: Record<string, unknown>): Promise<string>
  setCookieJar?(jar: unknown): void
  clearCache?(): void
}

export interface DomParser {
  parse(html: string, baseUrl?: string): DomNode
}

export interface DomNode {
  tag: string
  attrs: Record<string, string>
  children: DomNode[]
  text: string
  html: string
  outerHtml: string
  querySelectorAll(selector: string): DomNode[]
}

export interface JsonPathQuery {
  query(obj: unknown, path: string): unknown
}
