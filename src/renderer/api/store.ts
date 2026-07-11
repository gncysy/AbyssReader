import { ipcInvoke } from '@/utils/ipc'

export const store = {
  get: <T = any>(key: string): Promise<T> => ipcInvoke('store-get', key),
  set: (key: string, value: any): Promise<void> => ipcInvoke('store-set', key, value),
  delete: (key: string): Promise<void> => ipcInvoke('store-delete', key),
  getAll: (): Promise<Record<string, any>> => ipcInvoke('store-get-all'),
}
