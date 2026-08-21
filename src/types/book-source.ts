// ============================================
// BookSource 类型 — 对齐 Legado
// ============================================

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
  updateTime?: string | null
  checkKeyWord?: string | null
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
  canReName?: string | null
}

export interface TocRule {
  preUpdateJs?: string | null
  chapterList?: string | null
  chapterName?: string | null
  chapterUrl?: string | null
  formatJs?: string | null
  isVolume?: string | null
  isVip?: string | null
  isPay?: string | null
  updateTime?: string | null
  nextTocUrl?: string | null
}

export interface ContentRule {
  content?: string | null
  subContent?: string | null
  title?: string | null
  nextContentUrl?: string | null
  webJs?: string | null
  sourceRegex?: string | null
  replaceRegex?: string | null
  imageStyle?: string | null
  imageDecode?: string | null
  payAction?: string | null
  callBackJs?: string | null
  webView?: boolean | string | null
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

export interface ReviewRule {
  reviewList?: string | null
  reviewName?: string | null
  reviewContent?: string | null
  reviewTime?: string | null
  reviewRating?: string | null
}

export interface BookSource {
  bookSourceName: string
  bookSourceUrl: string
  name?: string
  bookSourceGroup?: string | null
  bookSourceComment?: string | null
  bookSourceType?: number
  bookUrlPattern?: string | null
  customOrder?: number
  enabled: boolean
  enabledCookieJar?: boolean
  enabledExplore?: boolean
  searchUrl?: string
  exploreUrl?: string | null
  exploreScreen?: string | null
  ruleSearch?: SearchRule
  ruleBookInfo?: BookInfoRule
  ruleToc?: TocRule
  ruleContent?: ContentRule
  ruleExplore?: ExploreRule | null
  ruleReview?: ReviewRule | null
  header?: string | null
  weight?: number
  concurrentRate?: string | null
  jsLib?: string | null
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  coverDecodeJs?: string | null
  respondTime?: number
  lastUpdateTime?: number
  customButton?: boolean
  eventListener?: boolean
  variableComment?: string | null
  code?: string | null
  callBackJs?: string | null
}
