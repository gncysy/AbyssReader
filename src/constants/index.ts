// ============================================
// 全局常量
// ============================================

export const APP_NAME = 'AbyssReader'
export const APP_VERSION = '0.1.0'
export const APP_ID = 'com.gncysy.abyss-reader'

export const NETWORK = {
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  MAX_REDIRECTS: 5,
  MAX_RETRIES: 2,
  RETRY_DELAY: 500,
  CONCURRENCY: 5,
} as const

export const CACHE = {
  CHAPTER_TTL: 30 * 60 * 1000,
  SEARCH_TTL: 5 * 60 * 1000,
  MAX_CHAPTERS: 100,
  PRELOAD_RANGE: 3,
  DEFAULT_MAX_TOTAL_BYTES: 200 * 1024 * 1024,
  DEFAULT_MAX_MB: 200,
} as const

export const ROUTES = {
  BOOKSHELF: 'bookshelf',
  SEARCH: 'search',
  EXPLORE: 'explore',
  RSS: 'rss',
  SOURCES: 'sources',
  SETTINGS: 'settings',
} as const

export const EVENTS = {
  SOURCE_TEST_RESULT: 'source-test-result',
  SOURCE_TEST_PROGRESS: 'source-test-progress',
  DELETE_FAILED_PROGRESS: 'delete-failed-progress',
  DELETE_FAILED_COMPLETE: 'delete-failed-complete',
  VERIFICATION_COMPLETE: 'verification-complete',
  VERIFICATION_CANCEL: 'verification-cancel',
  STORE_CHANGED: 'store-changed',
  SEARCH_PROGRESS: 'search-progress',
} as const

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  SEPIA: 'sepia',
  SYSTEM: 'system',
} as const

export const THEME_OPTIONS = [
  { label: '深色', value: THEMES.DARK },
  { label: '浅色', value: THEMES.LIGHT },
  { label: '护眼', value: THEMES.SEPIA },
  { label: '跟随系统', value: THEMES.SYSTEM },
] as const

export const READER_THEMES = [
  { label: '深色', value: THEMES.DARK },
  { label: '浅色', value: THEMES.LIGHT },
  { label: '护眼', value: THEMES.SEPIA },
] as const

// ─── 从 ui.ts 重导出 ───

export { Z_INDEX, UI, ANIMATION_DURATION, SPACING } from './ui.js'

// ─── 从 theme.ts 重导出 ───

export { BRAND_COLORS } from './theme.js'

// ─── 从 reader.ts 重导出 ───

export { READER, COMIC, BOOK_INFO, TOC, CHANGE_SOURCE } from './reader.js'
