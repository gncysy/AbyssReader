import { getGlobalHttpClient } from './network/client.js'
import { parseAndExecute } from './rule-parser/index.js'
import { resolveUrl } from './utils/url.js'
import type { Book, BookSource } from '../shared/types.js'

export interface Category {
  title: string
  url: string
  style?: {
    layout_flexGrow?: number
    layout_flexBasisPercent?: number
  }
}

/**
 * 解析发现分类列表
 * 支持三种格式：
 * 1. JSON 数组
 * 2. 换行分隔（title::url）
 * 3. <js> 标签执行
 */
export function getExploreCategories(source: BookSource): Category[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  // 1. JSON 数组
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          title: item.title || '未命名',
          url: item.url || '',
          style: item.style || undefined,
        }))
      }
    } catch {
      console.warn('[Explore] JSON 解析失败:', trimmed)
    }
  }

  // 2. 换行分隔（title::url）
  if (trimmed.includes('\n') && trimmed.includes('::')) {
    return trimmed.split('\n')
      .filter(line => line.includes('::'))
      .map(line => {
        const [title, url] = line.split('::').map(s => s.trim())
        return { title, url }
      })
  }

  // 3. <js> 标签执行
  if (trimmed.includes('<js>')) {
    try {
      // 提取 JS 代码
      const jsMatch = trimmed.match(/<js>([\s\S]*?)<\/js>/)
      if (jsMatch) {
        const jsCode = jsMatch[1].trim()
        // 使用引擎的 JS 执行器（需要传入 source 作为上下文）
        const result = parseAndExecute(source, `@js:${jsCode}`, { source })
        if (Array.isArray(result)) {
          return result.map(item => ({
            title: item.title || '未命名',
            url: item.url || '',
            style: item.style || undefined,
          }))
        }
      }
    } catch (e) {
      console.warn('[Explore] <js> 执行失败:', e)
    }
  }

  return []
}

/**
 * 获取分类下的书籍列表
 * 复用搜索解析逻辑，规则来源优先 ruleExplore，回退 ruleSearch
 */
export async function getExploreBooks(
  source: BookSource,
  categoryUrl: string,
  page: number = 1
): Promise<Book[]> {
  const httpClient = getGlobalHttpClient()

  // 替换 {{page}} 占位符
  let url = categoryUrl.replace(/\{\{page\}\}/g, String(page))

  // 如果 URL 还是包含占位符，说明格式不对，返回空
  if (url.includes('{{')) {
    console.warn('[Explore] URL 仍有未替换的占位符:', url)
    return []
  }

  // 处理相对路径
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const base = source.url.replace(/\/+$/, '')
    url = url.startsWith('/') ? base + url : base + '/' + url
  }

  // 请求
  const response = await httpClient.request({
    url,
    method: 'GET',
    headers: source.header ? JSON.parse(source.header) : {},
    timeout: 30000,
  })

  if (response.status < 200 || response.status >= 300) {
    console.warn('[Explore] 请求失败:', response.status)
    return []
  }

  const html = response.data

  // 选择规则：优先 ruleExplore，回退 ruleSearch
  const rule = source.ruleExplore || source.ruleSearch
  if (!rule || !rule.bookList) {
    console.warn('[Explore] 没有可用的规则 (ruleExplore 或 ruleSearch)')
    return []
  }

  // 复用搜索解析逻辑（从 search.ts 中提取的 parseBookItem 逻辑）
  return parseExploreBooks(html, rule, source)
}

/**
 * 解析书籍列表（从搜索模块复制的逻辑）
 */
function parseExploreBooks(
  html: string,
  rule: any,
  source: BookSource
): Book[] {
  const context = { source, baseUrl: source.url }

  // 获取书籍列表
  let bookList = parseAndExecute(html, rule.bookList, context)
  if (!bookList || !Array.isArray(bookList)) {
    return []
  }

  const books: Book[] = []

  for (const item of bookList) {
    const itemContext = { ...context, result: item }

    const name = parseAndExecute(item, rule.name || '', itemContext)
    if (!name) continue

    const author = parseAndExecute(item, rule.author || '', itemContext) || '未知作者'
    const coverUrl = parseAndExecute(item, rule.coverUrl || '', itemContext)
    const intro = parseAndExecute(item, rule.intro || '', itemContext)
    const bookUrl = parseAndExecute(item, rule.bookUrl || '', itemContext)
    const lastChapter = parseAndExecute(item, rule.lastChapter || '', itemContext)
    const kind = parseAndExecute(item, rule.kind || '', itemContext)

    // 处理 bookUrl
    let resolvedBookUrl = bookUrl || ''
    if (!resolvedBookUrl) {
      const nameSlug = String(name).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
      resolvedBookUrl = `book_${Date.now()}_${nameSlug}`
    }
    resolvedBookUrl = resolveUrl(resolvedBookUrl, source.url)

    books.push({
      id: resolvedBookUrl || `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: source.id,
      sourceName: source.name,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: intro ? String(intro).trim().substring(0, 500) : null,
      kind: kind ? String(kind).trim() : null,
      lastChapter: lastChapter ? String(lastChapter).trim() : null,
      bookUrl: resolvedBookUrl,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  return books
}
