import { BrowserWindow, ipcMain } from 'electron'
import { getGlobalHttpClient } from '../engine/network/client.js'

// ============================================================
// 主进程 WebView 处理器
// 渲染进程通过 IPC 调用，不直接访问 electron
// ============================================================

export function setupWebViewHandlers() {
  ipcMain.handle('webview:open', async (event, url: string, headers?: Record<string, string>, js?: string) => {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:webview-' + Date.now(),
        },
      })

      // 注入 headers
      if (headers && typeof headers === 'object') {
        win.webContents.session.webRequest.onBeforeSendHeaders(
          { urls: ['*://*/*'] },
          (details, callback) => {
            for (const [key, value] of Object.entries(headers)) {
              details.requestHeaders[key] = value as string
            }
            callback({ requestHeaders: details.requestHeaders })
          }
        )
      }

      win.loadURL(url)

      win.webContents.on('did-finish-load', async () => {
        let content = ''
        try {
          if (js) {
            content = await win.webContents.executeJavaScript(js)
          } else {
            content = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
          }

          // 同步 Cookie 到引擎
          const cookies = await win.webContents.session.cookies.get({ url })
          if (cookies.length > 0) {
            const jar = getGlobalHttpClient().getCookieJar()
            const urlObj = new URL(url)
            for (const cookie of cookies) {
              const cookieStr = `${cookie.name}=${cookie.value}; Domain=${urlObj.hostname}; Path=${cookie.path || '/'}`
              try {
                await jar.setCookie(cookieStr, url)
              } catch (e) {
                console.warn('[WebView] 设置 Cookie 失败:', cookie.name, e)
              }
            }
            console.log('[WebView] 已同步', cookies.length, '个Cookie到引擎')
          }
          win.close()
          resolve(content)
        } catch (err) {
          win.close()
          reject(err)
        }
      })

      win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        win.close()
        reject(new Error(`WebView加载失败: ${errorDescription}`))
      })

      setTimeout(() => {
        win.close()
        reject(new Error('WebView加载超时(30s)'))
      }, 30000)

      // 不显示窗口，静默加载
      // win.show() 已移除
    })
  })

  ipcMain.handle('webview:init', () => {
    console.log('[WebView] initUrl 已调用')
    return null
  })

  ipcMain.handle('webview:refresh', () => {
    console.log('[WebView] refreshBookUrl 已调用')
    return null
  })
}
