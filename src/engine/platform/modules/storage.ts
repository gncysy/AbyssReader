import { getGlobalStore } from '../../context/store.js'

export const storage = {
  getVariable(key: string): any {
    const store = getGlobalStore()
    return store.get(key)
  },

  setVariable(key: string, value: any): void {
    const store = getGlobalStore()
    store.put(key, value)
  },

  getLoginInfoMap(): Record<string, any> {
    const store = getGlobalStore()
    const all = store.getAll()
    const result: Record<string, any> = {}
    // 只返回登录相关变量
    for (const [key, value] of all) {
      if (key.startsWith('login_') || key === 'loginHeaders') {
        result[key] = value
      }
    }
    return result
  },

  putLoginHeader(headers: Record<string, string>): void {
    const store = getGlobalStore()
    store.put('loginHeaders', headers)
  },

  getLoginHeader(): Record<string, string> | null {
    const store = getGlobalStore()
    return store.get('loginHeaders') || null
  },

  // 新增：清除所有存储
  clear(): void {
    const store = getGlobalStore()
    store.clear()
  },
}
