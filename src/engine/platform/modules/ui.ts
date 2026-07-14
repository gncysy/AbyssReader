/**
 * ui.ts - 渲染进程 UI 模块
 * 通过 IPC 调用主进程的 UI 功能，不直接依赖 electron
 */

export const ui = {
  toast(message: string): void {
    // 通过 IPC 调用主进程显示通知
    const api = (window as any).electronAPI
    if (api && typeof api.invoke === 'function') {
      api.invoke('ui:toast', message).catch(() => {})
    }
    console.log('[Toast]', message)
  },

  longToast(message: string): void {
    const api = (window as any).electronAPI
    if (api && typeof api.invoke === 'function') {
      api.invoke('ui:longToast', message).catch(() => {})
    }
    console.log('[LongToast]', message)
  },

  async startBrowserAwait(url: string, title: string = '登录验证'): Promise<string> {
    const api = (window as any).electronAPI
    if (api && typeof api.invoke === 'function') {
      return await api.invoke('ui:startBrowserAwait', url, title)
    }
    console.warn('[UI] electronAPI 不可用，使用降级方案')
    return ''
  },
}
