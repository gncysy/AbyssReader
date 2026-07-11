// ============================================
// 书源工具函数 - 统一规范化逻辑
// ============================================

import type { BookSource } from '@shared/types'

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

export function parseSourcesFromJson(jsonStr: string): any[] {
  const data = JSON.parse(jsonStr)
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
