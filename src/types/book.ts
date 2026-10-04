// ============================================
// Book 类型 — 对齐 Legado
// ============================================

export interface ReadConfig {
  reverseToc?: boolean
  reSegment?: boolean
  imageStyle?: string | null
  useReplaceRule?: boolean | null
  delTag?: number
  ttsEngine?: string | null
  splitLongChapter?: boolean
  readSimulating?: boolean
  dailyChapters?: number
  openCredits?: number
  closeCredits?: number
  playMode?: number
  playSpeed?: number
  /** 内部字段：是否使用全局阅读配置（由 ReaderSettings 写入） */
  _useGlobal?: boolean
  /** 内部字段：书籍独立主题 */
  _theme?: string
  /** 内部字段：书籍独立字号 */
  _fontSize?: number
  /** 内部字段：书籍独立转换类型 */
  _converterType?: number
}

export interface Book {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string | null
  customCoverUrl?: string | null
  intro?: string | null
  customIntro?: string | null
  kind?: string | null
  customTag?: string | null
  lastChapter?: string | null
  latestChapterTitle?: string | null
  tocUrl?: string | null
  origin?: string
  originName?: string
  originOrder?: number
  group?: number
  order?: number
  type?: number
  canUpdate?: boolean
  durChapterIndex?: number
  durChapterPos?: number
  durChapterTime?: number
  durChapterTitle?: string
  durVolumeIndex?: number
  chapterInVolumeIndex?: number
  lastCheckCount?: number
  lastCheckTime?: number
  latestChapterTime?: number
  totalChapterNum?: number
  wordCount?: string
  readConfig?: ReadConfig | null
  variable?: string
  syncTime?: number
  charset?: string | null

  /** 内部字段：打开阅读器时强制跳转到的章节索引（从详情页点击章节时使用） */
  _forceChapterIndex?: number
  /** 内部字段：搜索结果里标记来源书源（用于换源和详情页） */
  _sourceKey?: string
  /** 内部字段：换源候选项的来源书源名 */
  _sourceName?: string
  /** 内部字段：换源候选项的来源书源 URL */
  _sourceUrl?: string
  /** 内部字段：封面加载失败标记 */
  _coverFailed?: boolean
}
