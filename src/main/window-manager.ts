import { BrowserWindow, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export function createWindow(): BrowserWindow {
  if (mainWindow) {
    mainWindow.focus();
    return mainWindow;
  }

  const indexPath = path.join(__dirname, '..', 'index.html');
  const fileUrl = `file://${indexPath.replace(/\\/g, '/')}`;
  console.log('[Window] 加载:', fileUrl);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    title: '墨阅',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d0d',
      symbolColor: '#e8e8e8',
      height: 36,
    },
    backgroundColor: '#0d0d0d',
    show: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      devTools: true,
      webSecurity: true,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(fileUrl).catch((err) => {
    console.error('[Window] 加载失败:', err);
  });

  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('before-input-event', (_event: any, input: any) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
    if (input.key === 'I' && input.control && input.shift) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.setTitle('墨阅');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] 页面加载完成');
  });

  mainWindow.webContents.on('render-process-gone', (_event: any, details: any) => {
    console.error('[Renderer] 进程崩溃:', details.reason);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
