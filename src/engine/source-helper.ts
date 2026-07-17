import type { BookSource } from '@shared/types'
import { parseAndExecute } from './rule-parser/index.js'

export function normalizeSource(source: any): BookSource {
  const now = Date.now()
  const nameValue = source.bookSourceName || source.name || '未命名书源'
  const urlValue = source.bookSourceUrl || source.url || ''

  return {
    id: urlValue || nameValue,
    name: nameValue,
    bookSourceName: nameValue,
    bookSourceUrl: urlValue,
    url: source.url || urlValue,
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
    code: source.code || null,
    _legado: !!(source.code || source.jsCode || source.sourceCode),
    _desktop: true,
  }
}

export function parseHeader(header: string | null | undefined, context: any = {}): Record<string, string> | null {
  if (!header) return null
  if (typeof header !== 'string') return header as any

  if (header.trim().startsWith('@js:')) {
    try {
      const result = parseAndExecute({}, header, { source: context.source || {}, ...context })
      if (result && typeof result === 'object') return result
      if (result && typeof result === 'string') {
        try { return JSON.parse(result) } catch { return null }
      }
      return null
    } catch (e) { return null }
  }

  try { return JSON.parse(header) } catch { return null }
}

export function parseSourcesFromJson(jsonStr: any): any[] {
  let data = jsonStr
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    data = jsonStr
  } else if (typeof jsonStr === 'string') {
    if (jsonStr === '[object Object]') return []
    try { data = JSON.parse(jsonStr) } catch { return [] }
  } else {
    return []
  }

  let sourceList: any[] = []
  if (data.sources && Array.isArray(data.sources)) sourceList = data.sources
  else if (Array.isArray(data)) sourceList = data
  else if (data.bookSourceUrl || data.bookSourceName || data.ruleSearch) sourceList = [data]
  return sourceList
}

export function validateSource(source: any): boolean {
  return !!(source && typeof source === 'object' && (source.name || source.bookSourceName) && (source.url || source.bookSourceUrl || source.searchUrl))
}
