// ============================================
// useRssArticles — 订阅文章加载（实例级缓存）
// ============================================

import { ref } from 'vue'
import { createAnalyzer } from '@engine/parser/index.js'
import { network } from '@/services/network.js'
import type { RssSource, RssArticle } from '@/types'
import type { EngineBookSource } from '@engine/types.js'

const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 20

function toEngineBookSource(source: RssSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

export function useRssArticles() {
  const articles = ref<RssArticle[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const currentPageUrl = ref('')
  const hasNextPage = ref(false)
  const nextPageUrl = ref('')
  const activeSortName = ref('')

  const articleCache = new Map<string, { articles: RssArticle[]; nextUrl: string; timestamp: number }>()

  async function parseArticles(
    source: RssSource,
    html: string,
    baseUrl: string,
  ): Promise<{ articles: RssArticle[]; nextUrl: string }> {
    const analyzer = createAnalyzer(toEngineBookSource(source))
    analyzer.setContent(html, baseUrl)

    let listRule = source.ruleArticles || ''
    let reverse = false
    if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
    if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

    const elements = await analyzer.getElements(listRule)
    if (!Array.isArray(elements) || elements.length === 0) {
      return { articles: [], nextUrl: '' }
    }

    const titleRule = source.ruleTitle || ''
    const linkRule = source.ruleLink || ''
    const descRule = source.ruleDescription || ''
    const imageRule = source.ruleImage || ''
    const dateRule = source.rulePubDate || ''

    const result: RssArticle[] = []
    for (const item of elements) {
      if (item === null || item === undefined) continue
      const itemAnalyzer = createAnalyzer(toEngineBookSource(source))
      itemAnalyzer.setContent(item, baseUrl)

      const title = (await itemAnalyzer.getString(titleRule)) || ''
      if (!title) continue

      const link = (await itemAnalyzer.getString(linkRule, { isUrl: true } as Record<string, unknown>)) || ''
      const description = descRule ? (await itemAnalyzer.getString(descRule)) || null : null
      const image = imageRule ? (await itemAnalyzer.getString(imageRule)) || null : null
      const pubDate = dateRule ? (await itemAnalyzer.getString(dateRule)) || null : null

      result.push({ title: String(title), link, description, image, pubDate, sort: activeSortName.value, origin: source.sourceUrl })
    }

    if (reverse) result.reverse()

    let nextUrl = ''
    if (source.ruleNextPage) {
      const nextRule = source.ruleNextPage
      if (nextRule.toUpperCase() === 'PAGE') {
        nextUrl = baseUrl
      } else {
        const nextAnalyzer = createAnalyzer(toEngineBookSource(source))
        nextAnalyzer.setContent(html, baseUrl)
        const raw = await nextAnalyzer.getString(nextRule, { isUrl: true } as Record<string, unknown>)
        if (raw) nextUrl = raw
      }
    }

    return { articles: result, nextUrl }
  }

  function setCache(url: string, data: { articles: RssArticle[]; nextUrl: string }): void {
    articleCache.set(url, { ...data, timestamp: Date.now() })
    if (articleCache.size > MAX_CACHE_ENTRIES) {
      const firstKey = articleCache.keys().next().value
      if (firstKey !== undefined) articleCache.delete(firstKey)
    }
  }

  async function fetchArticles(
    source: RssSource,
    url: string,
    useCache = true,
  ): Promise<void> {
    if (!source || !url || loading.value) return

    if (useCache && source.cacheFirst) {
      const cached = articleCache.get(url)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        articles.value = cached.articles
        hasNextPage.value = !!cached.nextUrl && cached.nextUrl !== url
        nextPageUrl.value = cached.nextUrl
        return
      }
    }

    loading.value = true
    try {
      const html = await network.fetch(url, { method: 'GET' })
      const result = await parseArticles(source, typeof html === 'string' ? html : '', url)
      articles.value = result.articles
      hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== url
      nextPageUrl.value = result.nextUrl
      setCache(url, result)
    } catch {
      const cached = articleCache.get(url)
      if (cached) {
        articles.value = cached.articles
        hasNextPage.value = !!cached.nextUrl && cached.nextUrl !== url
        nextPageUrl.value = cached.nextUrl
      }
    } finally {
      loading.value = false
    }
  }

  async function loadNextPage(source: RssSource): Promise<void> {
    if (!nextPageUrl.value || loadingMore.value) return
    loadingMore.value = true
    try {
      const html = await network.fetch(nextPageUrl.value, { method: 'GET' })
      const result = await parseArticles(source, typeof html === 'string' ? html : '', nextPageUrl.value)
      const existingLinks = new Set(articles.value.map((a) => a.link))
      const uniqueNew = result.articles.filter((a) => !existingLinks.has(a.link))
      articles.value = [...articles.value, ...uniqueNew]
      hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== nextPageUrl.value
      nextPageUrl.value = result.nextUrl
    } catch {
      // ignore
    } finally {
      loadingMore.value = false
    }
  }

  return {
    articles, loading, loadingMore, currentPageUrl, hasNextPage, nextPageUrl, activeSortName,
    parseArticles, fetchArticles, loadNextPage,
  }
}
