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

function isJsAction(str: string): boolean {
  const trimmed = str.trim()
  return trimmed.startsWith('@js:') ||
         trimmed.startsWith('<js>') ||
         (trimmed.startsWith('{{') && trimmed.endsWith('}}'))
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
   * 求值分类的 url 字段。
   * 对齐 Legado：分类的 url 可以是普通 URL，也可以是 @js: / <js> / {{...}}。
   * 后三者需要执行 JS，返回值才是真实 URL。
   *
   * 上下文：
   * - source：书源
   * - page：当前页码（Legado 的 JS 里可以引用 page）
   * - result：原始 url（Legado 的 JS 里 result 初值）
   */
  async function resolveCategoryUrl(
    cat: ExploreKind,
    source: BookSource,
    page: number,
  ): Promise<string> {
    const rawUrl = cat.url || ''
    if (!rawUrl) return ''

    // 不是 JS 动作，直接返回
    if (!isJsAction(rawUrl)) {
      return rawUrl
    }

    const jsCode = stripJsTemplate(rawUrl)
    if (!jsCode) return ''

    logInfo('explore', 'frontend', `[发现页] 求值分类 url: ${jsCode.substring(0, 100)}`)

    try {
      const infoMapStore = useInfoMapStore()
      const sourceUrl = source.bookSourceUrl || ''
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

      if (typeof result === 'string' && result.trim()) {
        return result.trim()
      }
      return ''
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logError('explore', 'frontend', `[发现页] 分类 url 求值失败: ${msg}`)
      return ''
    }
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
      // 修复：先求值分类的 url（可能是 @js: / <js> / {{...}}）
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
      // 替换 {{page}}
      url = url.replace(/\{\{page\}\}/g, String(currentPage.value))

      const infoMapStore = useInfoMapStore()
      const sourceUrl = source.bookSourceUrl || ''
      // 替换 {{infoMap[...]}}
      url = url.replace(/\{\{infoMap\[['"]([^'"]+)['"]\]\}\}/g, (_: string, key: string) => {
        return infoMapStore.get(sourceUrl, key) || ''
      })

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
