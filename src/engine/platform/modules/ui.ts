import { Notification, BrowserWindow } from 'electron'
import { getPlatformAdapter } from '../adapter.js'

export const ui = {
  toast(message: string): void {
    // 使用系统通知
    if (Notification.isSupported()) {
      new Notification({
        title: '墨阅',
        body: message,
        silent: true,
      }).show()
    }
    console.log('[Toast]', message)
  },

  longToast(message: string): void {
    // 长提示
    if (Notification.isSupported()) {
      new Notification({
        title: '墨阅',
        body: message,
        silent: false,
      }).show()
    }
    console.log('[LongToast]', message)
  },

  async startBrowserAwait(url: string, title: string = '登录验证'): Promise<string> {
    const adapter = getPlatformAdapter()
    return adapter.createWebViewWindow(url, title)
  },
}
