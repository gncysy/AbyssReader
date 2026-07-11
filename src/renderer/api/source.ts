import { ipcInvoke } from '@/utils/ipc'

export const source = {
  add: (jsonStr: string): Promise<string> => ipcInvoke('add-book-source', jsonStr),
  importFromUrl: (url: string): Promise<string> => ipcInvoke('import-sources-from-url', url),
  test: (sourceId: string): Promise<string> => ipcInvoke('test-source', sourceId),
  testAll: (): Promise<any> => ipcInvoke('test-all-sources'),
  deleteFailed: (): Promise<number> => ipcInvoke('delete-failed-sources'),
  getExploreCategories: (sourceId: string): Promise<any> => ipcInvoke('get-explore-categories', sourceId),
}
