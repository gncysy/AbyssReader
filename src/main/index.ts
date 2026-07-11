// ============================================================
// File/Blob/FormData polyfill - 必须在所有 import 之前！
// ============================================================
(function installPolyfills() {
  try {
    if (typeof File === "undefined") {
      (global as any).File = class File {
        name: string;
        size: number;
        type: string;
        lastModified: number;
        constructor(bits: any[], name: string, opts?: any) {
          this.name = name || "";
          this.size = bits?.length || 0;
          this.type = opts?.type || "";
          this.lastModified = Date.now();
        }
      };
      console.log("[Polyfill] File global added");
    }
    if (typeof Blob === "undefined") {
      (global as any).Blob = class Blob {
        size: number;
        type: string;
        constructor(parts?: any[], opts?: any) {
          this.size = parts?.length || 0;
          this.type = opts?.type || "";
        }
      };
      console.log("[Polyfill] Blob global added");
    }
    if (typeof FormData === "undefined") {
      (global as any).FormData = class FormData {
        private _data = new Map();
        append(key: string, value: any) { this._data.set(key, value); }
        get(key: string) { return this._data.get(key); }
      };
      console.log("[Polyfill] FormData global added");
    }
  } catch (e) {
    console.warn("[Polyfill] 安装失败:", e);
  }
})();
// ============================================================

import { app, BrowserWindow, shell } from 'electron';
import { Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWindow } from './window-manager.js';
import { setupIpcHandlers } from './ipc-handlers.js';
import { setPlatformAdapter } from '../engine/platform/adapter.js';

console.log('[Main] 主进程启动');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== 错误处理 =====
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught Exception:', error);
  if (error.stack) {
    console.error('[Fatal] Stack:', error.stack);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled Rejection:', reason);
});

// ===== 命令行开关 =====
app.commandLine.appendSwitch('disable-features', 'NetworkServiceInProcess');
app.commandLine.appendSwitch('disable-background-networking');

console.log('[Main] 命令行开关已设置');

// ===== 单例锁 =====
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[App] Another instance is running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ===== 初始化 IPC =====
setupIpcHandlers();
console.log('[Main] IPC 处理器已注册');

// ===== Windows 任务栏 =====
if (process.platform === 'win32') {
  app.setAppUserModelId('com.gncysy.abyss-reader');
}

// ===== 设置平台适配器 =====
setPlatformAdapter({
  showNotification(title: string, body?: string) {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  },
  openBrowser(url: string) {
    shell.openExternal(url);
  },
  createWebViewWindow(url: string, title: string): Promise<string> {
    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 850,
        height: 650,
        title,
        webPreferences: {
          nodeIntegration: false,
          sandbox: false,
          webviewTag: true,
        },
        show: false,
      });

      win.loadURL(url);
      win.once('ready-to-show', () => win.show());

      const checkUrl = (newUrl: string) => {
        if (
          newUrl.includes('success') ||
          newUrl.includes('callback') ||
          newUrl.includes('code=') ||
          newUrl.includes('oauth')
        ) {
          resolve(newUrl);
          win.close();
        }
      };

      win.webContents.on('will-navigate', (_event: any, newUrl: string) => {
        checkUrl(newUrl);
      });

      win.webContents.on('did-navigate-in-page', (_event: any, newUrl: string) => {
        checkUrl(newUrl);
      });

      win.on('closed', () => {
        resolve('');
      });
    });
  },
  getTimestamp() {
    return Date.now();
  },
  copyToClipboard(text: string) {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  },
  getPlatform() {
    return process.platform;
  },
  getVersion() {
    return app.getVersion();
  },
});

console.log('[Main] 平台适配器已设置');

// ===== 应用生命周期 =====
app.whenReady().then(() => {
  console.log('[Main] app.whenReady() 触发');
  createWindow();
  console.log('[Main] 窗口已创建');

  app.on('activate', () => {
    console.log('[Main] activate 事件触发');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('[Main] 所有窗口已关闭');
  import('../engine/network/client.js')
    .then(({ resetGlobalHttpClient }) => resetGlobalHttpClient())
    .catch(() => {});
  import('../engine/platform/android-api.js')
    .then(({ resetGlobalAndroidApi }) => resetGlobalAndroidApi())
    .catch(() => {});
  import('../engine/context/store.js')
    .then(({ resetGlobalStore }) => resetGlobalStore())
    .catch(() => {});

  if (process.platform !== 'darwin') app.quit();
});

console.log('[Main] 启动完成，等待 app.whenReady()');
