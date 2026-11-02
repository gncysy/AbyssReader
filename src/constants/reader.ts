// ============================================
// 阅读器常量
// ============================================

export const READER = {
  FONT_SIZE_MIN: 12,
  FONT_SIZE_MAX: 32,
  FONT_SIZE_DEFAULT: 18,
  LINE_HEIGHT_MIN: 1.2,
  LINE_HEIGHT_MAX: 2.8,
  LINE_HEIGHT_DEFAULT: 1.8,
  // 段落间距以 em 为单位，随字号缩放；默认 0 保持原有排版
  PARAGRAPH_SPACING_MIN: 0,
  PARAGRAPH_SPACING_MAX: 3,
  PARAGRAPH_SPACING_STEP: 0.2,
  PARAGRAPH_SPACING_DEFAULT: 0,
  MAX_TOC_PAGES: 20,
  MAX_CONTENT_PAGES: 20,
  PRELOAD_COUNT: 5,
  CONTROLS_HIDE_DELAY: 3000,
} as const

export const COMIC = {
  MAX_RETRIES: 3,
  CONCURRENCY: 2,
  RETRY_DELAY: 500,
} as const

// 书籍信息展示
export const BOOK_INFO = {
  INTRO_MAX_LENGTH: 500,
  SEARCH_INTRO_MAX_LENGTH: 200,
  NAME_MAX_LENGTH: 100,
  MAX_TAG_COUNT: 3,
} as const

// 目录分页
export const TOC = {
  PAGE_SIZE: 200,
} as const

// 换源搜索
export const CHANGE_SOURCE = {
  CONCURRENCY: 5,
} as const
