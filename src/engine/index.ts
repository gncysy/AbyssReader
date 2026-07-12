// ============================================
// 引擎入口 - 统一导出
// ============================================

// ===== 规则解析器 =====
export { parseRule, executeRule, parseAndExecute, parseFallbackRule, splitRule } from './rule-parser/index.js'
export type { ParsedRule, RuleContext } from './rule-parser/index.js'

// ===== 变量系统 =====
export { variableStore, parsePutRule, parseGetRule, parseInlineJs, processVariables, executeInitRule } from './rule-parser/variable.js'

// ===== 上下文管理 =====
export { ContextStore, getGlobalStore, resetGlobalStore } from './context/store.js'

// ===== 网络层 =====
export { HttpClient, getGlobalHttpClient, resetGlobalHttpClient, createHttpClientForSource } from './network/client.js'
export { CookieManager, createCookieManager } from './network/cookie.js'
export { RequestInterceptor, createRequestInterceptor, createDefaultInterceptors } from './network/interceptor.js'
export type { RequestConfig, ResponseData } from './network/index.js'

// ===== 加密模块 =====
export { base64Encode, base64Decode, base64DecodeToByteArray, md5Encode, aesDecrypt, desEncrypt, sha256Hash, hmacSha256 } from './crypto/index.js'

// ===== DOM 操作 =====
export { getElements, getElement, extractText, extractHtml } from './dom/index.js'

// ===== 平台适配 =====
export { AndroidApi, getGlobalAndroidApi, resetGlobalAndroidApi } from './platform/android-api.js'

// ===== 搜索 =====
export { search, batchSearch } from './search.js'
export type { SearchOptions } from './search.js'

// ===== 书籍详情 =====
export { getBookInfo } from './book-info.js'

// ===== 目录 =====
export { getToc } from './toc.js'

// ===== 正文 =====
export { getContent, preloadChapters, getCacheStats, cleanExpiredCache } from './content.js'

// ===== 发现 =====
export { explore, parseExploreCategories } from './explore.js'
export type { ExploreOptions } from './explore.js'

// ===== 工具函数 =====
export * from './utils/index.js'

// ============================================
// 引擎主类
// ============================================

import { search, batchSearch } from './search.js'
import { getBookInfo } from './book-info.js'
import { getToc } from './toc.js'
import { getContent, preloadChapters } from './content.js'
import { explore } from './explore.js'
import { getGlobalStore } from './context/store.js'
import { parseAndExecute } from './rule-parser/index.js'
import type { Book, BookSource, Chapter } from '../shared/types.js'

export class RuleEngine {
  private static instance: RuleEngine

  static getInstance(): RuleEngine {
    if (!RuleEngine.instance) {
      RuleEngine.instance = new RuleEngine()
    }
    return RuleEngine.instance
  }

  parseAndExecute(source: any, rule: string, context: Record<string, any> = {}): any {
    return parseAndExecute(source, rule, { source, ...context })
  }

  async search(source: BookSource, keyword: string, page: number = 1): Promise<Book[]> {
    return search(source, keyword, { page })
  }

  async batchSearch(sources: BookSource[], keyword: string, page: number = 1): Promise<Map<string, Book[]>> {
    return batchSearch(sources, keyword, { page })
  }

  async getBookInfo(source: BookSource, bookUrl: string): Promise<Book | null> {
    return getBookInfo(source, bookUrl)
  }

  async getToc(source: BookSource, tocUrl: string): Promise<Chapter[]> {
    return getToc(source, tocUrl)
  }

  async getContent(source: BookSource, chapterUrl: string): Promise<string> {
    return getContent(source, chapterUrl)
  }

  async preloadChapters(source: BookSource, chapters: Chapter[], currentIndex: number): Promise<void> {
    return preloadChapters(source, chapters, currentIndex)
  }

  async explore(source: BookSource, exploreUrl: string, page: number = 1): Promise<Book[]> {
    return explore(source, exploreUrl, { page })
  }

  clearCache(): void {
    const store = getGlobalStore()
    store.clear()
  }
}

export const engine = RuleEngine.getInstance()
