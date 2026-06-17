import { invoke } from '@tauri-apps/api/core'

// ========== 通用 HTTP 请求 ==========
export async function fetchUrl(
  url: string,
  method?: string,
  body?: string,
  headers?: Record<string, string>,
  charset?: string
): Promise<string> {
  return await invoke('fetch_url', { url, method, body, headers, charset })
}

// ========== 类型定义 ==========
export interface Book {
  id?: number
  sourceId: string
  sourceName: string
  name: string
  author: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  bookUrl: string
  tocUrl?: string
  created_at?: string
  updated_at?: string
}

export interface BookSource {
  id: string
  name: string
  url: string
  searchUrl: string
  enabled: boolean
  group?: string
  comment?: string
  weight: number
  header?: string
  enabledCookieJar?: boolean
  jsLib?: string
  loginUrl?: string
  loginUi?: string
  respondTime?: number
  lastUpdateTime?: number
  bookUrlPattern?: string
  ruleSearch?: any
  ruleBookInfo?: any
  ruleToc?: any
  ruleContent?: any
  exploreUrl?: string
  ruleExplore?: any
}

export interface ReadingProgress {
  bookId: number
  chapterId: number
  chapterTitle: string
  scrollPosition: number
}

// ========== 书架相关 ==========
export async function getBookshelf(): Promise<Book[]> {
  return await invoke('get_bookshelf')
}

export async function addToBookshelf(book: Book): Promise<void> {
  return await invoke('add_to_bookshelf', { book })
}

export async function removeFromBookshelf(bookId: number): Promise<void> {
  return await invoke('remove_from_bookshelf', { bookId })
}

export async function updateReadingProgress(
  bookId: number,
  chapterId: number,
  chapterTitle: string,
  scrollPosition: number
): Promise<void> {
  return await invoke('update_reading_progress', { bookId, chapterId, chapterTitle, scrollPosition })
}

export async function getReadingProgress(bookId: number): Promise<ReadingProgress | null> {
  return await invoke('get_reading_progress', { bookId })
}

// ========== 书源管理 ==========
export async function getBookSources(): Promise<BookSource[]> {
  return await invoke('get_book_sources')
}

export async function addBookSource(sourceJson: string): Promise<string> {
  return await invoke('add_book_source', { sourceJson })
}

export async function importSourcesFromUrl(url: string): Promise<string> {
  return await invoke('import_sources_from_url', { url })
}

export async function uploadLocalSource(filePath: string): Promise<string> {
  return await invoke('upload_local_source', { filePath })
}

export async function deleteBookSource(sourceId: string): Promise<void> {
  return await invoke('delete_book_source', { sourceId })
}

export async function deleteBookSources(sourceIds: string[]): Promise<number> {
  return await invoke('delete_book_sources', { sourceIds })
}

export async function toggleBookSource(sourceId: string, enabled: boolean): Promise<void> {
  return await invoke('toggle_book_source', { sourceId, enabled })
}

export async function testBookSource(sourceId: string): Promise<string> {
  return await invoke('test_book_source', { sourceId })
}

export async function testAllSources(): Promise<any[]> {
  return await invoke('test_all_sources')
}

export async function deleteFailedSources(): Promise<number> {
  return await invoke('delete_failed_sources')
}

export async function getExploreCategories(sourceId: string): Promise<any[]> {
  return await invoke('get_explore_categories', { sourceId })
}

// ========== 本地 TXT ==========
export async function addLocalTxtContent(name: string, content: string): Promise<Book> {
  return await invoke('add_local_txt_content', { name, content })
}

export async function readLocalFile(filePath: string): Promise<string> {
  return await invoke('read_local_file', { filePath })
}
