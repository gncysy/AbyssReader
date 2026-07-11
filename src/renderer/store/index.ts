import { createPinia } from 'pinia'

export const pinia = createPinia()

export { useBookshelfStore } from './bookshelf'
export { useReadingStore } from './reading'
export { useSourceStore } from './source'
