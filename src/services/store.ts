// ============================================
// 本地存储 API — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export const store = {
  get: async (key: string): Promise<unknown> => {
    const raw = await invoke('store_get', { key })
    if (typeof raw === 'string') {
      if (raw === 'undefined') return undefined
      if (raw === 'null') return null
      try { return JSON.parse(raw) as unknown } catch { return raw }
    }
    return raw
  },
  set: (key: string, value: unknown): Promise<void> =>
    invoke('store_set', { key, value: typeof value === 'string' ? value : JSON.stringify(value) }),
  delete: (key: string): Promise<void> => invoke('store_delete', { key }),
  getAll: (): Promise<Record<string, unknown>> => invoke('store_get_all'),
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
