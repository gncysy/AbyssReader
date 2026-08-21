<template>
  <div class="rss-articles-page">
    <header class="subpage-header">
      <BackButton />
      <h2>{{ source?.sourceName || '订阅源' }}</h2>
    </header>
    <template>
      <div v-if="sortTabs.length > 1" class="sort-tabs">
        <button v-for="tab in sortTabs" :key="tab.name" class="sort-tab" :class="{ active: activeSortName === tab.name }" @click="switchSort(tab)">{{ tab.name }}</button>
      </div>
      <div v-if="!loading && articles.length > 0" :class="articleListClass">
        <div v-for="item in articles" :key="item.link" class="article-item" :class="articleItemClass" @click="openArticle(item)">
          <img v-if="item.image && articleStyle !== 0" :src="item.image" class="article-image" @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
          <div class="article-content"><h4 class="article-title">{{ item.title }}</h4><p v-if="item.description" class="article-desc">{{ item.description }}</p><p v-if="item.pubDate" class="article-date">{{ item.pubDate }}</p></div>
        </div>
      </div>
      <div v-if="hasNextPage && !loading" style="text-align:center;padding:16px"><button class="btn-secondary" :disabled="loadingMore" @click="loadNextPage">{{ loadingMore ? '加载中...' : '加载更多' }}</button></div>
      <div v-if="loading" style="display:flex;justify-content:center;padding:60px"><LoadingSpinner /></div>
      <EmptyState v-if="!loading && articles.length === 0" title="暂无文章" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { network, store } from '@/services'
import { createAnalyzer } from '@engine/parser/index.js'
import { asArray } from '@/services/store.js'
import BackButton from '@/components/common/BackButton.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { RssSource, RssArticle } from '@/types'
import type { EngineBookSource } from '@engine/types.js'
import { CACHE } from '@/constants/index.js'

const route = useRoute()
const router = useRouter()
const msg = useMessage()

const source = ref<RssSource | null>(null)
const articles = ref<RssArticle[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const activeSortName = ref('')
const hasNextPage = ref(false)
const nextPageUrl = ref('')
const articleCache = new Map<string, { articles: RssArticle[]; nextUrl: string; timestamp: number }>()
const CACHE_TTL = CACHE.SEARCH_TTL
const MAX_CACHE_ENTRIES = 20

function toEngineBookSource(source: RssSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

const articleStyle = computed(() => source.value?.articleStyle || 0)
const sortTabs = computed(() => {
  if (!source.value?.sortUrl) return []
  return source.value.sortUrl.split('\n').filter((l) => l.includes('::')).map((line) => {
    const idx = line.indexOf('::')
    return { name: line.substring(0, idx), url: line.substring(idx + 2) }
  })
})
const articleListClass = computed(() => {
  switch (articleStyle.value) {
    case 2: return 'article-grid'
    case 1: return 'article-cards'
    case 3: return 'article-waterfall'
    case 4: return 'article-grid-col3'
    default: return 'article-list'
  }
})
const articleItemClass = computed(() => {
  if (articleStyle.value === 1) return 'card-item'
  if (articleStyle.value === 2 || articleStyle.value === 3 || articleStyle.value === 4) return 'grid-item'
  return ''
})

async function loadSource(): Promise<void> {
  try {
    const data = await store.get('rssSources')
    const sources = asArray<RssSource>(data)
    const sourceUrl = route.query.sourceUrl as string
    source.value = sources.find((s) => s.sourceUrl === sourceUrl) || null
    if (!source.value) return

    const tabs = sortTabs.value
    if (tabs.length > 0) {
      const firstTab = tabs[0]
      if (firstTab) activeSortName.value = firstTab.name
    }
    await fetchArticles()
  } catch {
    source.value = null
  }
}

function currentPageUrl(): string {
  const tabs = sortTabs.value
  if (tabs.length > 0) {
    return tabs.find((t) => t.name === activeSortName.value)?.url || source.value?.sourceUrl || ''
  }
  return source.value?.sourceUrl || ''
}

function switchSort(tab: { name: string; url: string }): void {
  activeSortName.value = tab.name
  articles.value = []
  hasNextPage.value = false
  articleCache.clear()
  fetchArticles()
}

async function parseArticles(html: string): Promise<{ articles: RssArticle[]; nextUrl: string }> {
  if (!source.value) return { articles: [], nextUrl: '' }
  const baseUrl = currentPageUrl() || source.value.sourceUrl
  const analyzer = createAnalyzer(toEngineBookSource(source.value))
  analyzer.setContent(html, baseUrl)

  let listRule = source.value.ruleArticles || ''
  let reverse = false
  if (listRule.startsWith('-')) { reverse = true; listRule = listRule.substring(1) }
  if (listRule.startsWith('+')) { listRule = listRule.substring(1) }

  const elements = await analyzer.getElements(listRule)
  if (!Array.isArray(elements) || elements.length === 0) return { articles: [], nextUrl: '' }

  const titleRule = source.value.ruleTitle || ''
  const linkRule = source.value.ruleLink || ''
  const descRule = source.value.ruleDescription || ''
  const imageRule = source.value.ruleImage || ''
  const dateRule = source.value.rulePubDate || ''

  const result: RssArticle[] = []
  for (const item of elements) {
    if (item === null || item === undefined) continue
    const itemAnalyzer = createAnalyzer(toEngineBookSource(source.value))
    itemAnalyzer.setContent(item, baseUrl)

    const title = (await itemAnalyzer.getString(titleRule)) || ''
    if (!title) continue

    const link = (await itemAnalyzer.getString(linkRule, { isUrl: true } as Record<string, unknown>)) || ''
    const description = descRule ? (await itemAnalyzer.getString(descRule)) || null : null
    const image = imageRule ? (await itemAnalyzer.getString(imageRule)) || null : null
    const pubDate = dateRule ? (await itemAnalyzer.getString(dateRule)) || null : null

    result.push({ title: String(title), link, description, image, pubDate, sort: activeSortName.value, origin: source.value!.sourceUrl })
  }

  if (reverse) result.reverse()

  let nextUrl = ''
  if (source.value.ruleNextPage) {
    const nextRule = source.value.ruleNextPage
    if (nextRule.toUpperCase() === 'PAGE') {
      nextUrl = baseUrl
    } else {
      const nextAnalyzer = createAnalyzer(toEngineBookSource(source.value))
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

async function fetchArticles(useCache = true): Promise<void> {
  if (!source.value) return
  const url = currentPageUrl()
  if (!url || loading.value) return

  if (useCache && source.value.cacheFirst) {
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
    const result = await parseArticles(typeof html === 'string' ? html : '')
    articles.value = result.articles
    hasNextPage.value = result.nextUrl !== '' && result.nextUrl !== url
    nextPageUrl.value = result.nextUrl
    setCache(url, result)
  } catch (err: unknown) {
    const e = err as Error
    msg.error('获取文章失败: ' + (e?.message || String(err)))
  } finally {
    loading.value = false
  }
}

async function loadNextPage(): Promise<void> {
  if (!nextPageUrl.value || loadingMore.value || !source.value) return
  loadingMore.value = true
  try {
    const html = await network.fetch(nextPageUrl.value, { method: 'GET' })
    const result = await parseArticles(typeof html === 'string' ? html : '')
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

function openArticle(item: RssArticle): void {
  if (!item.link) return
  router.push({ name: 'rss-read', query: { articleLink: item.link, sourceUrl: source.value?.sourceUrl } })
}

onMounted(async () => { await loadSource() })
</script>

<style scoped>
.rss-articles-page { position: relative; z-index: 1; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-shrink: 0; }
.subpage-header h2 { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sort-tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
.sort-tab { padding: 6px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.18s, border-color 0.18s; }
.sort-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.sort-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.article-list { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.article-cards { display: grid; grid-template-columns: 1fr; gap: 12px; }
.article-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.article-waterfall { column-count: 2; column-gap: 12px; }
.article-waterfall .article-item { break-inside: avoid; margin-bottom: 12px; }
.article-grid-col3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.article-item { display: flex; align-items: center; padding: 14px 18px; background: var(--bg-card); cursor: pointer; transition: background 0.18s; gap: 14px; min-height: 56px; }
.article-item:hover { background: var(--bg-hover); }
.card-item { flex-direction: column; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 16px; }
.grid-item { flex-direction: column; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 12px; }
.article-image { width: 60px; height: 60px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; }
.card-item .article-image, .grid-item .article-image { width: 100%; height: 140px; }
.article-content { flex: 1; min-width: 0; }
.article-title { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.article-desc { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }
.article-date { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }
</style>
