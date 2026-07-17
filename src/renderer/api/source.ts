import { ipcInvoke } from '@/utils/ipc'

export const source = {
  add: (jsonStr: string): Promise<string> => ipcInvoke('add-book-source', jsonStr),
  importFromUrl: (url: string): Promise<string> => ipcInvoke('import-sources-from-url', url),
  test: (index: number): Promise<string> => ipcInvoke('test-source', index),
  testAll: (): Promise<any> => ipcInvoke('test-all-sources'),
  deleteSource: (index: number): Promise<any> => ipcInvoke('delete-source', index),
  toggleSource: (index: number): Promise<any> => ipcInvoke('toggle-source', index),
  deleteFailed: (): Promise<number> => ipcInvoke('delete-failed-sources'),
  getExploreCategories: (index: number): Promise<any> => ipcInvoke('get-explore-categories', index),
}
