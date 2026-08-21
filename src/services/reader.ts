// ============================================
// 阅读器 API
// ============================================

import { invoke } from '@tauri-apps/api/core'

export interface ImportResult {
  name: string
  author: string
  book_url: string
  chapter_count: number
}

export interface ChapterInfo {
  id: number
  title: string
  content: string
  index: number
}

export const reader = {
  importTxt: (name: string, content: string): Promise<ImportResult> =>
    invoke('import_txt', { name, content }),

  getLocalBookChapters: (bookId: string): Promise<ChapterInfo[]> =>
    invoke('get_local_book_chapters', { bookId }),

  getLocalChapterContent: (bookId: string, chapterId: number): Promise<string> =>
    invoke('get_local_chapter_content', { bookId, chapterId }),
}
