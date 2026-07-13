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
}
