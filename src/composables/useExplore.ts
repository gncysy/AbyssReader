// ============================================
// useExplore — 发现页逻辑（完整对齐 Legado）
// ============================================

import { ref, nextTick } from 'vue'
import { explore } from '@/services/explore.js'
import { engine } from '@/services/engine.js'
import { logError, logInfo } from '@engine/log/index.js'
import type { ExploreKind } from '@engine/business/explore/index.js'
import type { Book, BookSource } from '@/types'
import { useInfoMapStore } from '@/stores/info-map.js'

function toBook(engineBook: Record<string, unknown>): Book {
  return engineBook as unknown as Book
}

const LOAD_MORE_THRESHOLD = 10

function stripJsTemplate(action: string): string {
  const trimmed = action.trim()
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed.substring(2, trimmed.length - 2).trim()
  }
  return trimmed.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
}

/**
 * 判断是否需要走 JS 求值。
 *
 * 三种情况：
 * 1. 整个字符串是 @js: / <js> / {{...}}
 * 2. URL 里嵌了 {{...}}（新增）
 */
function isJsAction(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) return true
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) return true
  // 新增：URL 里嵌 {{...}} 也要走 JS 求值
  if (trimmed.includes('{{') && trimmed.includes('}}')) return true
  return false
}

/** 判断是否是"整个字符串就是 {{...}}"的形态。 */
function isWholeJsTemplate(str: string): boolean {
  const trimmed = str.trim()
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) return false
  // 检查 {{ 和 }} 是否是配对的（避免 "{{a}} b {{c}}" 这种被误判）
  const inner = trimmed.substring(2, trimmed.length - 2)
  return !inner.includes('{{') && !inner.includes('}}')
}

export function useExplore() {
  const categories = ref<ExploreKind[]>([])
  const loadingCategories = ref(false)
  const currentCategory = ref<ExploreKind | null>(null)
  const books = ref<Book[]>([])
  const loadingBooks = ref(false)
  const currentPage = ref(1)
  const hasMore = ref(true)
  const booksGridRef = ref<HTMLElement | null>(null)

  let loadMoreObserver: IntersectionObserver | null = null
  let currentSentinel: HTMLElement | null = null

  function cleanupObserver(): void {
    if (loadMoreObserver) { loadMoreObserver.disconnect(); loadMoreObserver = null }
    if (currentSentinel) {
      if (currentSentinel.parentNode) {
        currentSentinel.parentNode.removeChild(currentSentinel)
      }
      currentSentinel = null
    }
  }

  function setupObserver(source: BookSource): void {
    cleanupObserver()
    nextTick(() => {
      const grid = booksGridRef.value
      if (!grid) return
      const sentinel = document.createElement('div')
      sentinel.style.cssText = 'height:1px;width:100%;visibility:hidden'
      grid.parentNode?.appendChild(sentinel)
      currentSentinel = sentinel
      loadMoreObserver = new IntersectionObserver((entries) => {
        const first = entries[0]
        if (first !== undefined && first.isIntersecting && !loadingBooks.value && hasMore.value && currentCategory.value) {
          loadBooks(source)
        }
      }, { rootMargin: '0px 0px 200px 0px' })
      loadMoreObserver.observe(sentinel)
    })
  }

  async function loadCategories(source: BookSource): Promise<void> {
    categories.value = []
    loadingCategories.value = true
    books.value = []
    currentCategory.value = null
    currentPage.value = 1
    hasMore.value = true

    try {
      const raw = source.exploreUrl || ''
      logInfo('explore', 'frontend', `[发现页] exploreUrl 长度=${raw.length}`)

      const result = await explore.getCategories(source)
      if (Array.isArray(result)) {
        categories.value = result
        logInfo('explore', 'frontend', `[发现页] 解析出 ${result.length} 个分类`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('explore', 'frontend', `[发现页] 加载分类失败: ${msg}`)
    } finally {
      loadingCategories.value = false
    }
  }

  async function executeCategoryAction(
    action: string,
    source: BookSource,
  ): Promise<void> {
    try {
      const jsCode = stripJsTemplate(action)
      if (!jsCode) return

      logInfo('explore', 'frontend', `[发现页] 执行分类动作: ${jsCode.substring(0, 100)}`)

      const infoMapStore = useInfoMapStore()
      const sourceUrl = source.bookSourceUrl || ''
      const processed = jsCode.replace(/Map\(['"]([^'"]+)['"]\)/g, (_, key: string) => {
        return JSON.stringify(infoMapStore.get(sourceUrl, key) || '')
      })

      await engine.executeJs(processed, {
        source,
        baseUrl: sourceUrl,
        result: '',
        book: {},
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('explore', 'frontend', `[发现页] 分类动作执行失败: ${msg}`)
    }
  }

  /**
   * 对 URL 里的所有 {{...}} 做求值替换。
   *
   * 处理顺序：
   * 1. {{infoMap[key]}} — 本地 store 读取，不走 JS
   * 2. 其他 {{...}} — 走 JS 执行
   *
   * 求值失败保留原文（避免破坏 URL 结构）。
   */
  async function evaluateJsTemplates(
    url: string,
    source: BookSource,
    page: number,
  ): Promise<string> {
    if (!url || !url.includes('{{') || !url.includes('}}')) return url

    const sourceUrl = source.bookSourceUrl || ''
    const infoMapStore = useInfoMapStore()
    let processed = url

    // 1. {{infoMap[...]}} 本地替换
    processed = processed.replace(/\{\{infoMap\[['"]([^'"]+)['"]\]\}\}/g, (_: string, key: string) => {
      return infoMapStore.get(sourceUrl, key) || ''
    })

    // 2. 其他 {{...}} 走 JS
    const templateRegex = /\{\{([\s\S]*?)\}\}/g
    let match: RegExpExecArray | null
    while ((match = templateRegex.exec(processed)) !== null) {
      const jsCode = match[1]
      if (!jsCode || !jsCode.trim()) continue
      try {
        const result = await engine.executeJs(jsCode.trim(), {
          source,
          baseUrl: sourceUrl,
          result: url,
          book: {},
          page,
          key: '',
        })
        let replacement = ''
        if (result === null || result === undefined) {
          replacement = ''
        } else if (typeof result === 'string') {
          replacement = result
        } else if (typeof result === 'number' && Number.isInteger(result)) {
          replacement = String(result)
        } else if (typeof result === 'boolean') {
          replacement = String(result)
        } else if (typeof result === 'object') {
          try { replacement = JSON.stringify(result) } catch { replacement = '' }
        } else {
          replacement = String(result)
        }
        processed = processed.substring(0, match.index) + replacement + processed.substring(match.index + match[0].length)
        templateRegex.lastIndex = match.index + replacement.length
      } catch {
        // 求值失败保留原文
      }
    }

    return processed
  }

  /**
   * 求值分类的 url 字段。
   * 对齐 Legado：分类的 url 可以是普通 URL，也可以是 @js: / <js> / {{...}}。
   *
   * 修复：URL 里嵌 {{...}} 时也要走 JS 求值，并返回求值后的 URL，
   * 让上游的 fallback 路径（getBooksWithFallback）也能拿到正确 URL。
   */
  async function resolveCategoryUrl(
    cat: ExploreKind,
    source: BookSource,
    page: number,
  ): Promise<string> {
    const rawUrl = cat.url || ''
    if (!rawUrl) return ''

    if (!isJsAction(rawUrl)) {
      return rawUrl
    }

    const sourceUrl = source.bookSourceUrl || ''

    // 形态 1：整个字符串是 @js: / <js>
    if (rawUrl.trim().startsWith('@js:') || rawUrl.trim().startsWith('<js>')) {
      const jsCode = stripJsTemplate(rawUrl)
      if (!jsCode) return ''
      logInfo('explore', 'frontend', `[发现页] 求值分类 url (@js): ${jsCode.substring(0, 100)}`)
      try {
        const infoMapStore = useInfoMapStore()
        const processed = jsCode.replace(/Map\(['"]([^'"]+)['"]\)/g, (_, key: string) => {
          return JSON.stringify(infoMapStore.get(sourceUrl, key) || '')
        })
        const result = await engine.executeJs(processed, {
          source,
          baseUrl: sourceUrl,
          result: rawUrl,
          book: {},
          page,
          key: '',
        })
        if (typeof result === 'string' && result.trim()) return result.trim()
        return ''
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('explore', 'frontend', `[发现页] 分类 url 求值失败: ${msg}`)
        return ''
      }
    }

    // 形态 2：整个字符串是 {{...}}
    if (isWholeJsTemplate(rawUrl)) {
      logInfo('explore', 'frontend', `[发现页] 求值分类 url ({{...}}): ${rawUrl.substring(0, 100)}`)
      const evaluated = await evaluateJsTemplates(rawUrl, source, page)
      return evaluated.trim()
    }

    // 形态 3：URL 里嵌 {{...}}
    logInfo('explore', 'frontend', `[发现页] 求值分类 url (嵌模板): ${rawUrl.substring(0, 100)}`)
    const evaluated = await evaluateJsTemplates(rawUrl, source, page)
    return evaluated
  }

  async function exploreCategory(source: BookSource, cat: ExploreKind): Promise<void> {
    if (!cat) return

    if (cat.type === 'button') {
      if (cat.action) {
        await executeCategoryAction(cat.action, source)
      }
      return
    }

    if (!cat.url) return
    currentCategory.value = cat
    currentPage.value = 1
    books.value = []
    hasMore.value = true
    await loadBooks(source)
    setupObserver(source)
  }

  async function loadBooks(source: BookSource): Promise<void> {
    if (!currentCategory.value) return
    if (!hasMore.value) return
    if (loadingBooks.value) return
    if (currentCategory.value.type === 'text' && !currentCategory.value.url) return

    loadingBooks.value = true
    try {
      // 修复：resolveCategoryUrl 现在会处理"URL 里嵌 {{...}}" 的情况，
      // 返回的 URL 不再带 {{...}}。这样下游的 fallback（getBooksWithFallback）
      // 也能拿到正确 URL，不会 404。
      const resolvedUrl = await resolveCategoryUrl(
        currentCategory.value,
        source,
        currentPage.value,
      )

      if (!resolvedUrl) {
        logError('explore', 'frontend', '[发现页] 分类 url 求值为空')
        hasMore.value = false
        loadingBooks.value = false
        return
      }

      let url = resolvedUrl
      // 替换 {{page}}（字面量，兜底）
      url = url.replace(/\{\{page\}\}/g, String(currentPage.value))

      let result: Book[] = []
      try {
        const engineBooks = await explore.getBooks(source, url, currentPage.value)
        result = engineBooks.map((b) => toBook(b as unknown as Record<string, unknown>))
      } catch {
        result = []
      }

      if (result.length === 0) {
        const absoluteUrl = url.startsWith('http')
          ? url
          : (source.bookSourceUrl ? source.bookSourceUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '') : url)
        const htmlBooks = await explore.getBooksWithFallback(source, absoluteUrl, currentPage.value)
        if (htmlBooks.length > 0) {
          result = htmlBooks.map((b) => toBook(b as unknown as Record<string, unknown>))
        }
      }

      const newBooks = Array.isArray(result) ? result : []

      if (newBooks.length === 0) {
        hasMore.value = false
      } else {
        const existingUrls = new Set(books.value.map((b) => b.bookUrl))
        for (const b of newBooks) {
          if (!existingUrls.has(b.bookUrl)) {
            existingUrls.add(b.bookUrl)
            books.value.push(b)
          }
        }
        currentPage.value++
        if (newBooks.length < LOAD_MORE_THRESHOLD) hasMore.value = false
      }
    } catch {
      hasMore.value = false
    } finally {
      loadingBooks.value = false
    }
  }

  function reset(): void {
    categories.value = []
    currentCategory.value = null
    books.value = []
    currentPage.value = 1
    hasMore.value = true
  }

  return {
    categories, loadingCategories, currentCategory,
    books, loadingBooks, currentPage, hasMore, booksGridRef,
    loadCategories, exploreCategory, executeCategoryAction, resolveCategoryUrl, loadBooks, reset, cleanupObserver,
  }
}
