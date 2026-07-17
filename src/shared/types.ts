// ============================================
// 数据类型定义
// ============================================

export interface Book {
  id?: string | number
  origin?: string
  originName?: string
  name: string
  author: string
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  bookUrl: string
  tocUrl?: string | null
  content?: string | null
  createdAt: string
  updatedAt: string
}

export interface SearchRule {
  bookList?: string | null
  name?: string | null
  author?: string | null
  bookUrl?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  checkKeyWord?: string | null
  replaceRegex?: string | null
}

export interface BookInfoRule {
  init?: string | null
  name?: string | null
  author?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  tocUrl?: string | null
  wordCount?: string | null
}

export interface TocRule {
  chapterList?: string | null
  chapterName?: string | null
  chapterUrl?: string | null
  isVip?: string | null
  isPay?: string | null
  isVolume?: string | null
  updateTime?: string | null
  nextTocUrl?: string | null
}

export interface ContentRule {
  content?: string | null
  nextContentUrl?: string | null
  replaceRegex?: string | null
  imageStyle?: string | null
  webView?: boolean | string | null
  sourceRegex?: string | null
  webJs?: string | null
}

export interface ExploreRule {
  bookList?: string | null
  name?: string | null
  author?: string | null
  bookUrl?: string | null
  coverUrl?: string | null
  intro?: string | null
  kind?: string | null
  lastChapter?: string | null
  wordCount?: string | null
  updateTime?: string | null
}

export interface BookSource {
  id: string
  name: string
  bookSourceName?: string
  bookSourceUrl?: string
  url: string
  searchUrl: string
  ruleSearch: SearchRule
  ruleBookInfo: BookInfoRule
  ruleToc: TocRule
  ruleContent: ContentRule
  ruleExplore?: ExploreRule | null
  exploreUrl?: string | null
  enabled: boolean
  group?: string | null
  comment?: string | null
  weight: number
  header?: string | null
  enabledCookieJar: boolean
  jsLib?: string | null
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  respondTime: number
  lastUpdateTime: number
  bookUrlPattern?: string | null
  code?: string | null
  concurrentRate?: number
  enabledExplore?: boolean
  customOrder?: number
  bookSourceType?: 0 | 1
  _legado: boolean
  _desktop: boolean
}

export interface Chapter {
  id: number
  title: string
  url: string
  index: number
  isVip?: boolean
  isPay?: boolean
  content?: string | null
  updateTime?: string
}

export interface ReplaceRule {
  id: string
  name: string
  pattern: string
  replacement: string
  isRegex: boolean
  isEnabled: boolean
  scope: 'title' | 'content'
  bookName: string
  bookOrigin: string
  timeoutMs: number
}

export interface ReadingProgress {
  bookUrl: string
  chapterId: number
  chapterTitle: string
  scrollPercent: number
  updatedAt: string
}

export function createBook(data: Partial<Book> = {}): Book {
  const now = new Date().toISOString()
  return {
    id: data.id ?? Date.now(),
    origin: data.origin ?? undefined,
    originName: data.originName ?? undefined,
    name: data.name ?? '未命名',
    author: data.author ?? '未知作者',
    coverUrl: data.coverUrl ?? null,
    intro: data.intro ?? null,
    kind: data.kind ?? null,
    lastChapter: data.lastChapter ?? null,
    bookUrl: data.bookUrl ?? '',
    tocUrl: data.tocUrl ?? null,
    content: data.content ?? null,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  }
}

export function createSource(data: Partial<BookSource> = {}): BookSource {
  const now = Date.now()
  const sourceUrl = data.bookSourceUrl || data.url || ''
  return {
    id: sourceUrl || `source_${now}`,
    name: data.name ?? data.bookSourceName ?? '未命名书源',
    bookSourceName: data.bookSourceName ?? data.name ?? '未命名书源',
    bookSourceUrl: data.bookSourceUrl ?? data.url ?? '',
    url: data.url ?? '',
    searchUrl: data.searchUrl ?? '',
    ruleSearch: data.ruleSearch ?? {},
    ruleBookInfo: data.ruleBookInfo ?? {},
    ruleToc: data.ruleToc ?? {},
    ruleContent: data.ruleContent ?? {},
    ruleExplore: data.ruleExplore ?? null,
    exploreUrl: data.exploreUrl ?? null,
    enabled: data.enabled !== undefined ? data.enabled : true,
    group: data.group ?? null,
    comment: data.comment ?? null,
    weight: data.weight ?? 0,
    header: data.header ?? null,
    enabledCookieJar: data.enabledCookieJar ?? false,
    jsLib: data.jsLib ?? null,
    loginUrl: data.loginUrl ?? null,
    loginUi: data.loginUi ?? null,
    loginCheckJs: data.loginCheckJs ?? null,
    respondTime: data.respondTime ?? 0,
    lastUpdateTime: data.lastUpdateTime ?? now,
    bookUrlPattern: data.bookUrlPattern ?? null,
    code: data.code ?? null,
    concurrentRate: data.concurrentRate ?? 0,
    enabledExplore: data.enabledExplore !== undefined ? data.enabledExplore : true,
    customOrder: data.customOrder ?? 0,
    bookSourceType: data.bookSourceType ?? 0,
    _legado: !!data.code,
    _desktop: true,
  }
}

export function createChapter(data: Partial<Chapter> = {}, index = 0): Chapter {
  return {
    id: data.id ?? index,
    title: data.title ?? '无标题',
    url: data.url ?? '',
    index: data.index ?? index,
    isVip: data.isVip ?? false,
    isPay: data.isPay ?? false,
    content: data.content ?? null,
    updateTime: data.updateTime ?? '',
  }
}

export function isValidBook(obj: any): obj is Book {
  return obj && typeof obj === 'object' && typeof obj.name === 'string' && typeof obj.bookUrl === 'string'
}

export function isValidSource(obj: any): obj is BookSource {
  return obj && typeof obj === 'object' && (obj.bookSourceName || obj.name) && (obj.url || obj.bookSourceUrl)
}

