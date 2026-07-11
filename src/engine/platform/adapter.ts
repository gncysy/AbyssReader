// ============================================
// 平台适配器接口 - 解耦引擎与 Electron
// ============================================

export interface IPlatformAdapter {
  // 系统通知
  showNotification(title: string, body?: string): void
  
  // 打开外部浏览器
  openBrowser(url: string): void
  
  // 创建内置浏览器窗口（用于登录/验证）
  // 返回 Promise，resolve 最终跳转的 URL
  createWebViewWindow(url: string, title: string): Promise<string>
  
  // 获取当前时间戳
  getTimestamp(): number
  
  // 复制到剪贴板
  copyToClipboard(text: string): void
  
  // 获取平台信息
  getPlatform(): string
  getVersion(): string
}

let adapterInstance: IPlatformAdapter | null = null

export function setPlatformAdapter(adapter: IPlatformAdapter): void {
  adapterInstance = adapter
}

export function getPlatformAdapter(): IPlatformAdapter {
  if (!adapterInstance) {
    throw new Error('[Engine] Platform adapter not initialized. Please call setPlatformAdapter in main process.')
  }
  return adapterInstance
}

export function hasPlatformAdapter(): boolean {
  return adapterInstance !== null
}
