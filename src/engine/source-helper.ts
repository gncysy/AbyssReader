import type { BookSource } from '@shared/types'
import { parseAndExecute } from './rule-parser/index.js'

export function normalizeSource(source: any): BookSource {
  const now = Date.now()
  return {
    id: source.id || source.bookSourceUrl || `source_${now}_${Math.random().toString(36).slice(2, 6)}`,
    name: source.name || source.bookSourceName || '未命名书源',
    url: source.url || source.bookSourceUrl || '',
    searchUrl: source.searchUrl || '',
    ruleSearch: source.ruleSearch || {},
    ruleBookInfo: source.ruleBookInfo || {},
    ruleToc: source.ruleToc || {},
    ruleContent: source.ruleContent || {},
    ruleExplore: source.ruleExplore || {},
    exploreUrl: source.exploreUrl || '',
    enabled: source.enabled !== undefined ? source.enabled : true,
    group: source.group || source.bookSourceGroup || null,
    comment: source.comment || source.bookSourceComment || null,
    weight: source.weight || 0,
    header: source.header || null,
    enabledCookieJar: source.enabledCookieJar || false,
    jsLib: source.jsLib || null,
    loginUrl: source.loginUrl || null,
    loginUi: source.loginUi || null,
    respondTime: source.respondTime || 0,
    lastUpdateTime: source.lastUpdateTime || now,
    bookUrlPattern: source.bookUrlPattern || null,
    code: source.code || source.jsCode || source.sourceCode || null,
    _legado: !!(source.code || source.jsCode || source.sourceCode),
    _desktop: true,
  }
}

/**
 * 解析 header 字段，支持 @js: 动态生成
 */
export function parseHeader(header: string | null | undefined, context: any = {}): Record<string, string> | null {
  if (!header) return null
  if (typeof header !== 'string') return header as any

  // 如果 header 是 @js: 开头，执行 JS
  if (header.trim().startsWith('@js:')) {
    try {
      const result = parseAndExecute({}, header, { source: context.source || {}, ...context })
      if (result && typeof result === 'object') {
        return result
      }
      if (result && typeof result === 'string') {
        try {
          return JSON.parse(result)
        } catch {
          return null
        }
      }
      return null
    } catch (e) {
      console.warn('[parseHeader] 执行 @js: 失败:', e)
      return null
    }
  }

  // 尝试 JSON 解析
  try {
    return JSON.parse(header)
  } catch {
    return null
  }
}

export function parseSourcesFromJson(jsonStr: any): any[] {
  let data = jsonStr
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    data = jsonStr
  } else if (typeof jsonStr === 'string') {
    if (jsonStr === '[object Object]') return []
    try {
      data = JSON.parse(jsonStr)
    } catch {
      return []
    }
  } else {
    return []
  }

  let sourceList: any[] = []
  if (data.sources && Array.isArray(data.sources)) {
    sourceList = data.sources
  } else if (Array.isArray(data)) {
    sourceList = data
  } else if (data.bookSourceUrl || data.bookSourceName || data.ruleSearch) {
    sourceList = [data]
  }
  return sourceList
}

export function validateSource(source: any): boolean {
  return !!(source &&
    typeof source === 'object' &&
    (source.name || source.bookSourceName) &&
    (source.url || source.bookSourceUrl || source.searchUrl))
}

export function createSourceId(source: any): string {
  if (source.id) return source.id
  if (source.bookSourceUrl) return source.bookSourceUrl
  return `source_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
