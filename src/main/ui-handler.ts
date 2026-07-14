import { ipcMain, Notification, BrowserWindow } from 'electron'
import { getMainWindow } from './window-manager.js'

export function setupUIHandlers() {
  ipcMain.handle('ui:toast', (_event, message: string) => {
    if (Notification.isSupported()) {
      new Notification({
        title: '墨阅',
        body: message,
        silent: true,
      }).show()
    }
    return null
  })

  ipcMain.handle('ui:longToast', (_event, message: string) => {
    if (Notification.isSupported()) {
      new Notification({
        title: '墨阅',
        body: message,
        silent: false,
      }).show()
    }
    return null
  })

  ipcMain.handle('ui:startBrowserAwait', async (_event, url: string, title: string) => {
    return new Promise<string>((resolve) => {
      const parentWin = BrowserWindow.getFocusedWindow() || getMainWindow()
      const win = new BrowserWindow({
        width: 850,
        height: 650,
        parent: parentWin || undefined,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          sandbox: true,
          webviewTag: true,
        },
        title: title || '登录验证',
        show: false,
      })

      win.loadURL(url)
      win.once('ready-to-show', () => win.show())

      const checkUrl = (newUrl: string) => {
        if (
          newUrl.includes('success') ||
          newUrl.includes('callback') ||
          newUrl.includes('code=') ||
          newUrl.includes('oauth')
        ) {
          resolve(newUrl)
          win.close()
        }
      }

      win.webContents.on('will-navigate', (_event: any, newUrl: string) => {
        checkUrl(newUrl)
      })

      win.webContents.on('did-navigate-in-page', (_event: any, newUrl: string) => {
        checkUrl(newUrl)
      })

      win.on('closed', () => {
        resolve('')
      })
    })
  })
}
