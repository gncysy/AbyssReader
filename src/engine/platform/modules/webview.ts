import { BrowserWindow } from "electron";
import { getPlatformAdapter } from "../adapter.js";

export const webview = {
  async webView(headers: any, url: string, js?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: "persist:webview-" + Date.now(),
        },
      });

      win.loadURL(url);

      win.webContents.on("did-finish-load", async () => {
        let content = "";
        try {
          if (js) {
            content = await win.webContents.executeJavaScript(js);
          } else {
            content = await win.webContents.executeJavaScript("document.documentElement.outerHTML");
          }
          win.close();
          resolve(content);
        } catch (err) {
          win.close();
          reject(err);
        }
      });

      win.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
        win.close();
        reject(new Error(`WebView加载失败: ${errorDescription}`));
      });

      setTimeout(() => {
        win.close();
        reject(new Error("WebView加载超时(30s)"));
      }, 30000);

      win.show();
    });
  },

  initUrl(): void {
    console.warn("[WebView] initUrl 已调用，当前无实际效果");
  },

  refreshBookUrl(): void {
    const adapter = getPlatformAdapter();
    console.warn("[WebView] refreshBookUrl 已调用");
  },
};
