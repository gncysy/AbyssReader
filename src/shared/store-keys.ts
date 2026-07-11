export const StoreKeys = {
  BOOKS: 'books',
  SOURCES: 'sources',
  READING_PROGRESS: 'readingProgress',
  SETTINGS: 'settings',
  READER_SETTINGS: 'readerSettings',
  THEME: 'theme',
} as const

export type StoreKey = typeof StoreKeys[keyof typeof StoreKeys]
