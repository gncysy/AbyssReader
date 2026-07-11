export const APP_NAME = 'AbyssReader'
export const APP_VERSION = '0.1.0'
export const APP_ID = 'com.gncysy.abyss-reader'

// ===== 网络配置 =====
export const NETWORK = {
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  MAX_REDIRECTS: 5,
  MAX_RETRIES: 2,
  RETRY_DELAY: 500,
  CONCURRENCY: 5,
} as const

// ===== 缓存配置 =====
export const CACHE = {
  CHAPTER_TTL: 30 * 60 * 1000,
  SEARCH_TTL: 5 * 60 * 1000,
  MAX_CHAPTERS: 100,
  CLEANUP_RATIO: 0.3,
  MIN_CLEANUP: 10,
  PRELOAD_RANGE: 3,
} as const

// ===== 阅读器配置 =====
export const READER = {
  FONT_SIZE_MIN: 12,
  FONT_SIZE_MAX: 32,
  FONT_SIZE_DEFAULT: 18,
  LINE_HEIGHT_MIN: 1.2,
  LINE_HEIGHT_MAX: 2.8,
  LINE_HEIGHT_DEFAULT: 1.8,
} as const

// ===== 主题配置 =====
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

// ===== 路由 =====
export const ROUTES = {
  BOOKSHELF: 'bookshelf',
  SEARCH: 'search',
  EXPLORE: 'explore',
  MARKET: 'market',
  SOURCES: 'sources',
  SETTINGS: 'settings',
} as const

// ===== 存储键 =====
export const STORE_KEYS = {
  BOOKS: 'books',
  SOURCES: 'sources',
  READING_PROGRESS: 'readingProgress',
  SETTINGS: 'settings',
  READER_SETTINGS: 'readerSettings',
} as const

// ===== 文件类型 =====
export const FILE_TYPES = {
  TXT: 'txt',
  JSON: 'json',
  JS: 'js',
} as const

// ===== 事件 =====
export const EVENTS = {
  SOURCE_TEST_RESULT: 'source-test-result',
  SOURCE_TEST_PROGRESS: 'source-test-progress',
  DELETE_FAILED_PROGRESS: 'delete-failed-progress',
  DELETE_FAILED_COMPLETE: 'delete-failed-complete',
  VERIFICATION_COMPLETE: 'verification-complete',
  VERIFICATION_CANCEL: 'verification-cancel',
  STORE_CHANGED: 'store-changed',
} as const
