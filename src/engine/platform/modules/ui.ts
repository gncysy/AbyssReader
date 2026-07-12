import { getPlatformAdapter } from "../adapter.js";

export const ui = {
  toast(message: string): void {
    const adapter = getPlatformAdapter();
    adapter.showNotification("墨阅", message);
  },

  longToast(message: string): void {
    const adapter = getPlatformAdapter();
    adapter.showNotification("墨阅", message);
  },

  async startBrowserAwait(url: string, title: string = "登录验证"): Promise<string> {
    const adapter = getPlatformAdapter();
    return adapter.createWebViewWindow(url, title);
  },
};
