// ============================================
// EPUB 服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export interface EpubMetadata {
  title: string
  author: string
  publisher: string | null
  language: string | null
  description: string | null
  identifier: string | null
}

export interface EpubChapterInfo {
  index: number
  title: string
  href: string
  cachedPath: string
}

export interface EpubParseResult {
  bookId: string
  metadata: EpubMetadata
  chapters: EpubChapterInfo[]
  coverDataUrl: string | null
  chapterCount: number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      resolve(btoa(binary))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

export const epub = {
  parse: (path: string): Promise<EpubParseResult> =>
    invoke('parse_epub', { path }),

  parseFile: async (file: File): Promise<EpubParseResult> => {
    const dataBase64 = await fileToBase64(file)
    return invoke('parse_epub_bytes', { name: file.name, dataBase64 })
  },

  getChapters: (bookId: string): Promise<EpubChapterInfo[]> =>
    invoke('get_epub_chapters', { bookId }),

  /**
   * 读取单章 XHTML。图片路径在 Rust 侧已重写为 data URL。
   */
  getChapter: (bookId: string, chapterIndex: number): Promise<string> =>
    invoke('get_epub_chapter', { bookId, chapterIndex }),

  /**
   * 读取单章 CSS。url() 已在 Rust 侧重写为 data URL（图片 + 字体）。
   */
  getChapterCss: (bookId: string, chapterIndex: number): Promise<string> =>
    invoke('get_epub_chapter_css', { bookId, chapterIndex }),

  clearCache: (bookId: string): Promise<number> =>
    invoke('clear_epub_cache', { bookId }),
}
