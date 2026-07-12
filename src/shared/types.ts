// ============================================
// 数据类型定义
// ============================================

export interface Book {
  id: string | number
  sourceId: string
  sourceName: string
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
  read_progress?: number
  current_chapter_id?: number
  current_chapter_title?: string
}

export interface BookWithProgress extends Book {
  read_progress?: number
  current_chapter_id?: number
  current_chapter_title?: string
}

// ===== 书源规则类型 =====

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

export interface ReadingProgress {
  bookId: string | number
  chapterId: number
  chapterTitle: string
  scrollPercent: number
  updatedAt: string
}

export interface ParsedRule {
  type: 'css' | 'xpath' | 'json' | 'regex' | 'js' | 'text'
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

// ========== 工厂函数 ==========
export function createBook(data: Partial<Book> = {}): Book {
  const now = new Date().toISOString()
  return {
    id: data.id ?? Date.now(),
    sourceId: data.sourceId ?? '',
    sourceName: data.sourceName ?? '',
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
  return {
    id: data.id ?? `source_${now}`,
    name: data.name ?? '未命名书源',
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

export function createReadingProgress(data: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    bookId: data.bookId ?? 0,
    chapterId: data.chapterId ?? 0,
    chapterTitle: data.chapterTitle ?? '',
    scrollPercent: data.scrollPercent ?? 0,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  }
}

// ========== 验证函数 ==========
export function isValidBook(obj: any): obj is Book {
  return obj && typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.bookUrl === 'string'
}

export function isValidSource(obj: any): obj is BookSource {
  return obj && typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string'
}

export function isValidChapter(obj: any): obj is Chapter {
  return obj && typeof obj === 'object' &&
    typeof obj.title === 'string' &&
    typeof obj.url === 'string'
}

export function isValidReadingProgress(obj: any): obj is ReadingProgress {
  return obj && typeof obj === 'object' &&
    obj.bookId !== undefined &&
    obj.chapterId !== undefined
}
