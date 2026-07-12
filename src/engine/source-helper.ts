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

export function parseSourcesFromJson(jsonStr: any): any[] {
  console.log('[SourceHelper] parseSourcesFromJson 被调用, 输入类型:', typeof jsonStr);
  
  // 如果传入的是对象，直接使用
  let data = jsonStr;
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    console.log('[SourceHelper] 输入是对象，直接使用');
    data = jsonStr;
  } else if (typeof jsonStr === 'string') {
    // 如果是 "[object Object]"，说明传入的是被错误序列化的对象
    if (jsonStr === '[object Object]') {
      console.error('[SourceHelper] 收到 "[object Object]" 字符串，无法解析');
      return [];
    }
    try {
      data = JSON.parse(jsonStr);
      console.log('[SourceHelper] JSON 解析成功');
    } catch (e) {
      console.error('[SourceHelper] JSON 解析失败:', e);
      return [];
    }
  } else {
    console.error('[SourceHelper] 不支持的数据类型:', typeof jsonStr);
    return [];
  }
  
  let sourceList: any[] = [];
  if (data.sources && Array.isArray(data.sources)) {
    sourceList = data.sources;
  } else if (Array.isArray(data)) {
    sourceList = data;
  } else if (data.bookSourceUrl || data.bookSourceName || data.ruleSearch) {
    sourceList = [data];
  }
  
  console.log('[SourceHelper] 解析到书源数量:', sourceList.length);
  return sourceList;
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
