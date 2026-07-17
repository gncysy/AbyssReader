import { ipcInvoke } from '@/utils/ipc'

export const engine = {
  search: (source: any, keyword: string, page?: number) =>
    ipcInvoke('engine-search', source, keyword, page),
  batchSearch: (sources: any[], keyword: string, page?: number) =>
    ipcInvoke('engine-batch-search', sources, keyword, page),
  getToc: (source: any, tocUrl: string) =>
    ipcInvoke('engine-get-toc', source, tocUrl),
  getContent: (source: any, chapterUrl: string) =>
    ipcInvoke('engine-get-content', source, chapterUrl),
  getBookInfo: (source: any, bookUrl: string) =>
    ipcInvoke('engine-get-book-info', source, bookUrl),
  getExploreCategories: (source: any) =>
    ipcInvoke('engine-get-explore-categories', source),
  getExploreBooks: (source: any, categoryUrl: string, page: number) => {
    const cleanSource = {
      bookSourceName: source.bookSourceName || source.name || '',
      bookSourceUrl: source.bookSourceUrl || source.url || '',
      url: source.url || '',
      searchUrl: source.searchUrl || '',
      ruleSearch: source.ruleSearch || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleExplore: source.ruleExplore || {},
      exploreUrl: source.exploreUrl || '',
      enabled: source.enabled !== undefined ? source.enabled : true,
      group: source.group || null,
      comment: source.comment || null,
      weight: source.weight || 0,
      header: typeof source.header === 'string' ? source.header : null,
      enabledCookieJar: source.enabledCookieJar || false,
      jsLib: source.jsLib || null,
      loginUrl: source.loginUrl || null,
      loginUi: source.loginUi || null,
      respondTime: source.respondTime || 0,
      lastUpdateTime: source.lastUpdateTime || Date.now(),
      bookUrlPattern: source.bookUrlPattern || null,
      code: source.code || null,
      _legado: !!source.code,
      _desktop: true,
    }
    return ipcInvoke('engine-get-explore-books', cleanSource, categoryUrl, page)
  },
}
