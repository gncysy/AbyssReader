import { ipcInvoke } from '@/utils/ipc'

export const network = {
  fetch: (url: string, options?: any): Promise<any> => ipcInvoke('fetch', url, options),
  get: (url: string, headers?: Record<string, string>) =>
    ipcInvoke('fetch', url, { method: 'GET', headers }),
  post: (url: string, body?: any, headers?: Record<string, string>) =>
    ipcInvoke('fetch', url, { method: 'POST', headers, body }),
}
