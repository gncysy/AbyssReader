import { ipcInvoke } from '@/utils/ipc'

export const reader = {
  importTxt: (name: string, content: string): Promise<any> =>
    ipcInvoke('import-txt', name, content),
  getLocalBookChapters: (bookId: string): Promise<any> =>
    ipcInvoke('get-local-book-chapters', bookId),
  getLocalChapterContent: (bookId: string, chapterId: number): Promise<string> =>
    ipcInvoke('get-local-chapter-content', bookId, chapterId),
  executeJs: (code: string, context: any, timeout?: number): Promise<any> =>
    ipcInvoke('execute-js', code, context, timeout),
  openVerification: (url: string, title?: string): Promise<void> =>
    ipcInvoke('open-verification', url, title),
  closeVerification: (): Promise<void> =>
    ipcInvoke('close-verification'),
}
