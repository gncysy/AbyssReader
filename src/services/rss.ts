// ============================================
// 订阅 API
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { store } from './store.js'

export interface RssSourceRecord {
  sourceUrl: string
  [key: string]: unknown
}

export const rss = {
  getSources: async (): Promise<RssSourceRecord[]> => {
    const data = await store.get('rssSources')
    return Array.isArray(data) ? (data as RssSourceRecord[]) : []
  },

  saveSources: async (sources: RssSourceRecord[]): Promise<void> => {
    await store.set('rssSources', sources)
  },

  openUrl: (url: string, title: string): Promise<void> =>
    invoke('rss_open_url', { url, title }),
}
