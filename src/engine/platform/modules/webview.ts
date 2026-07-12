import { getPlatformAdapter } from "../adapter.js";

export const webview = {
  async webView(headers: any, url: string, js?: string): Promise<string> {
    const adapter = getPlatformAdapter();
    // 使用平台适配器的 webview 功能
    return adapter.createWebViewWindow(url, "WebView");
  },

  initUrl(): void {
    console.warn("[WebView] initUrl 已调用，当前无实际效果");
  },

  refreshBookUrl(): void {
    const adapter = getPlatformAdapter();
    console.warn("[WebView] refreshBookUrl 已调用");
  },
};
