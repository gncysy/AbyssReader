// ============================================
// 调试面板服务
// ============================================

import { store } from './store.js'
import { network } from './network.js'
import { getGlobalHttpClient, HttpClient } from '@engine/network/client.js'
import { fetchWithWebviewFallback } from './fetch.js'
import { parseSourceHeader } from '@engine/business/source/helper.js'
import { NETWORK } from '@/constants/index.js'
import type { BookSource } from '@/types'
import type { EngineBookSource } from '@engine/types.js'

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function getHttpClient(): HttpClient {
  const client = getGlobalHttpClient()
  return client
}

export const debug = {
  getBookSource: async (): Promise<BookSource[]> => {
    const raw = await store.get('bookSource')
    return Array.isArray(raw) ? (raw as BookSource[]) : []
  },

  saveBookSource: async (sources: BookSource[]): Promise<void> => {
    await store.set('bookSource', sources)
  },

  fetchWebView: network.fetchWebView,

  fetchUrl: network.fetch,

  search: async (source: BookSource, keyword: string): Promise<unknown[]> => {
    const { search: engineSearch } = await import('./search.js')
    return engineSearch(source, keyword, { page: 1 })
  },

  getBookInfo: async (source: BookSource, bookUrl: string): Promise<unknown> => {
    const { parseBookInfo } = await import('@engine/business/book/index.js')
    const headers = await parseSourceHeader(toEngineBookSource(source))
    const html = await fetchWithWebviewFallback(bookUrl, {
      source,
      headers,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })
    if (!html) return null
    return parseBookInfo(toEngineBookSource(source), html, bookUrl)
  },

  getToc: async (source: BookSource, tocUrl: string): Promise<unknown[]> => {
    const { useToc } = await import('@/composables/useToc.js')
    const toc = useToc()
    return toc.loadToc(source, tocUrl)
  },

  getContent: async (source: BookSource, chapterUrl: string): Promise<string> => {
    const { getContent } = await import('./content.js')
    return getContent(source, chapterUrl, { book: {} })
  },

  executeJs: async (code: string, context: Record<string, unknown>): Promise<string> => {
    const { engine } = await import('./engine.js')
    return engine.executeJs(code, context)
  },

  httpRequest: async (url: string, source?: BookSource): Promise<{ status: number; headers: Record<string, string>; data: string }> => {
    const httpClient = getHttpClient()
    const sourceHeaders = source?.header ? await parseSourceHeader(toEngineBookSource(source)) : {}
    const response = await httpClient.request({
      url,
      method: 'GET',
      headers: sourceHeaders,
      timeout: NETWORK.DEFAULT_TIMEOUT,
    })
    return {
      status: response.status,
      headers: response.headers,
      data: response.data as string,
    }
  },
}
