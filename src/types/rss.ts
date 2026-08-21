// ============================================
// RSS 类型
// ============================================

export interface RssSource {
  sourceName: string
  sourceUrl: string
  sourceIcon?: string | null | undefined
  sourceGroup?: string | null | undefined
  sourceComment?: string | null | undefined
  variableComment?: string | null | undefined
  enabled: boolean
  enabledCookieJar?: boolean | undefined
  singleUrl?: boolean | undefined
  enableJs?: boolean | undefined
  loadWithBaseUrl?: boolean | undefined
  showWebLog?: boolean | undefined
  preload?: boolean | undefined
  cacheFirst?: boolean | undefined
  sortUrl?: string | null | undefined
  customOrder?: number | undefined
  ruleArticles?: string | null | undefined
  ruleNextPage?: string | null | undefined
  ruleTitle?: string | null | undefined
  rulePubDate?: string | null | undefined
  ruleDescription?: string | null | undefined
  ruleImage?: string | null | undefined
  ruleLink?: string | null | undefined
  ruleContent?: string | null | undefined
  contentWhitelist?: string | null | undefined
  contentBlacklist?: string | null | undefined
  shouldOverrideUrlLoading?: string | null | undefined
  style?: string | null | undefined
  injectJs?: string | null | undefined
  preloadJs?: string | null | undefined
  startHtml?: string | null | undefined
  startStyle?: string | null | undefined
  startJs?: string | null | undefined
  coverDecodeJs?: string | null | undefined
  header?: string | null | undefined
  concurrentRate?: string | null | undefined
  jsLib?: string | null | undefined
  loginUrl?: string | null | undefined
  loginUi?: string | null | undefined
  loginCheckJs?: string | null | undefined
  articleStyle?: number | undefined
  type?: number | undefined
  lastUpdateTime?: number | undefined
  searchUrl?: string | null | undefined
  [key: string]: unknown
}

export interface RssArticle {
  title: string
  link: string
  description?: string | null
  image?: string | null
  pubDate?: string | null
  sort?: string
  origin?: string
  read?: boolean
}
