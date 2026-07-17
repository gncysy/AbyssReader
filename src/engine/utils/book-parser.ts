import { getString } from '../rule-parser/index.js'
import { resolveUrl, cleanIntro } from './url.js'
import type { Book, BookSource } from '../../shared/types.js'

export function parseBookItem(
  item: any,
  source: BookSource,
  rule: any,
  extraContext: any = {}
): Book | null {
  try {
    const baseContext = { ...extraContext, source, baseUrl: source.url }

    const name = getString(item, rule.name || '', baseContext)
    if (!name) return null

    const author = getString(item, rule.author || '', baseContext) || '未知作者'
    const coverUrl = getString(item, rule.coverUrl || rule.cover || '', baseContext)
    const intro = getString(item, rule.intro || '', baseContext)
    let bookUrl = getString(item, rule.bookUrl || '', baseContext)
    const lastChapter = getString(item, rule.lastChapter || '', baseContext)
    const kind = getString(item, rule.kind || '', baseContext)

    if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
      bookUrl = item.id || item.bookUrl || `book_${Date.now()}_${String(name).slice(0, 10)}`
    }

    const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), source.url)

    return {
      id: resolvedBookUrl || `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: intro ? cleanIntro(String(intro)) : null,
      kind: kind ? String(kind).trim() : null,
      lastChapter: lastChapter ? String(lastChapter).trim() : null,
      bookUrl: resolvedBookUrl,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.warn('[parseBookItem] 失败:', error)
    return null
  }
}
