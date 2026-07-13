import type { BookSource, SearchRule, BookInfoRule, TocRule, ContentRule, ExploreRule } from '../shared/types.js'

function cleanString(str: any): string {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function cleanObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[cleanString(key)] = value;
  }
  return result;
}

export function normalizeSource(source: any): BookSource {
  const now = Date.now()

  // 清理所有字符串字段
  const id = cleanString(source.id || source.bookSourceUrl || `source_${now}_${Math.random().toString(36).slice(2, 6)}`);
  const name = cleanString(source.name || source.bookSourceName || '未命名书源');
  const url = cleanString(source.url || source.bookSourceUrl || '');
  const searchUrl = cleanString(source.searchUrl || '');
  const exploreUrl = cleanString(source.exploreUrl || '');
  const group = source.group || source.bookSourceGroup ? cleanString(source.group || source.bookSourceGroup) : null;
  const comment = source.comment || source.bookSourceComment ? cleanString(source.comment || source.bookSourceComment) : null;
  const header = source.header ? (typeof source.header === 'string' ? cleanString(source.header) : source.header) : null;
  const jsLib = source.jsLib ? cleanString(source.jsLib) : null;
  const loginUrl = source.loginUrl ? cleanString(source.loginUrl) : null;
  const loginUi = source.loginUi ? cleanString(source.loginUi) : null;
  const loginCheckJs = source.loginCheckJs ? cleanString(source.loginCheckJs) : null;
  const bookUrlPattern = source.bookUrlPattern ? cleanString(source.bookUrlPattern) : null;
  const code = source.code || source.jsCode || source.sourceCode ? cleanString(source.code || source.jsCode || source.sourceCode) : null;

  // 清理规则对象
  const ruleSearch = cleanObject(source.ruleSearch || {}) as SearchRule;
  const ruleBookInfo = cleanObject(source.ruleBookInfo || {}) as BookInfoRule;
  const ruleToc = cleanObject(source.ruleToc || {}) as TocRule;
  const ruleContent = cleanObject(source.ruleContent || {}) as ContentRule;
  const ruleExplore = source.ruleExplore ? cleanObject(source.ruleExplore) as ExploreRule : null;

  return {
    id,
    name,
    url,
    searchUrl,
    ruleSearch,
    ruleBookInfo,
    ruleToc,
    ruleContent,
    ruleExplore,
    exploreUrl,
    enabled: source.enabled !== undefined ? source.enabled : true,
    group,
    comment,
    weight: source.weight || 0,
    header,
    enabledCookieJar: source.enabledCookieJar || false,
    jsLib,
    loginUrl,
    loginUi,
    loginCheckJs,
    respondTime: source.respondTime || 0,
    lastUpdateTime: source.lastUpdateTime || now,
    bookUrlPattern,
    code,
    concurrentRate: source.concurrentRate || 0,
    enabledExplore: source.enabledExplore !== undefined ? source.enabledExplore : true,
    customOrder: source.customOrder || 0,
    bookSourceType: source.bookSourceType || 0,
    _legado: !!(source.code || source.jsCode || source.sourceCode),
    _desktop: true,
  }
}

export function parseSourcesFromJson(jsonStr: any): any[] {
  console.log('[SourceHelper] parseSourcesFromJson 被调用, 输入类型:', typeof jsonStr);

  let data = jsonStr;
  if (typeof jsonStr === 'object' && jsonStr !== null) {
    console.log('[SourceHelper] 输入是对象，直接使用');
    data = jsonStr;
  } else if (typeof jsonStr === 'string') {
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
  if (source.id) return cleanString(source.id)
  if (source.bookSourceUrl) return cleanString(source.bookSourceUrl)
  return `source_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}


