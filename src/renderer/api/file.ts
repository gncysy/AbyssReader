import { ipcInvoke } from '@/utils/ipc'

export const file = {
  read: (path: string): Promise<string> => ipcInvoke('read-file', path),
  write: (path: string, content: string): Promise<void> => ipcInvoke('write-file', path, content),
  showOpenDialog: (options: any): Promise<any> => ipcInvoke('show-open-dialog', options),
  getAppPath: (): Promise<string> => ipcInvoke('get-app-path'),
}
