// ============================================
// 发现页编排服务 — view → engine 的桥梁
// ============================================

import { getGlobalHttpClient } from '@engine/network/client.js'
import { getJsRuntime } from '@engine/parser/js-executor.js'
import {
  getExploreCategoriesAsync,
  getExploreBooks,
} from '@engine/business/explore/index.js'
import type { ExploreKind } from '@engine/business/explore/index.js'
import type { EngineBook, EngineBookSource } from '@engine/types.js'
import { fetchWithWebviewFallback } from './fetch.js'
import { logWarn } from '@engine/log/index.js'
import type { BookSource } from '@/types'

const EXPLORE_FETCH_TIMEOUT = 30000
// 修复：不再用固定 1000 字符判定失败，改为多条件
const MIN_HTML_INDICATOR_LENGTH = 200
const MIN_HTML_LENGTH_FOR_PARSING = 500

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

/**
 * 判断 HTML 是否可能包含有效内容。
 * 修复：原实现用 `html.length <= 1000` 判定失败，
 * 短页面（如单页 JSON 接口返回）会被误判。
 * 改为：长度 < 200 直接失败；200~500 之间要求含标签。
 */
function isLikelyValidHtml(html: string): boolean {
  if (!html) return false
  if (html.length < MIN_HTML_INDICATOR_LENGTH) return false
  if (html.length >= MIN_HTML_LENGTH_FOR_PARSING) return true
  // 200~500 长度，要求包含 HTML 标签
  return /<[a-z][\s\S]*>/i.test(html)
}

export const explore = {
  async getCategories(source: BookSource): Promise<ExploreKind[]> {
    const runtime = getJsRuntime()
    return getExploreCategoriesAsync(toEngineBookSource(source), runtime)
  },

  async getBooks(
    source: BookSource,
    categoryUrlOrHtml: string,
    page = 1,
    isHtml = false,
  ): Promise<EngineBook[]> {
    const httpClient = getGlobalHttpClient()
    const runtime = getJsRuntime()
    return getExploreBooks(
      toEngineBookSource(source),
      categoryUrlOrHtml,
      page,
      httpClient,
      runtime,
      isHtml,
    )
  },

  async getBooksWithFallback(
    source: BookSource,
    absoluteUrl: string,
    page = 1,
  ): Promise<EngineBook[]> {
    const html = await fetchWithWebviewFallback(absoluteUrl, {
      source,
      timeout: EXPLORE_FETCH_TIMEOUT,
    })
    if (!html || typeof html !== 'string') {
      return []
    }
    if (!isLikelyValidHtml(html)) {
      logWarn('explore', 'frontend', `[发现页] WebView 降级返回内容无效: ${html.length} 字符`)
      return []
    }
    return explore.getBooks(source, html, page, true)
  },
}
