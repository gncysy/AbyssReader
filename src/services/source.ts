// ============================================
// 书源 API — 封装 Tauri invoke + 事件监听
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

interface SourceTestResult {
  index: number
  name: string
  status: string
  time_ms: number
  size_kb: number
  error: string
}

let testResultUnlisten: UnlistenFn | null = null

export const source = {
  add: (jsonStr: string): Promise<string> => invoke('add_book_source', { sourceJson: jsonStr }),
  importFromUrl: (url: string): Promise<string> => invoke('import_sources_from_url', { url }),
  test: (index: number): Promise<string> => invoke('test_book_source', { sourceIndex: index }),
  testAll: (): Promise<SourceTestResult[]> => invoke('test_all_sources'),
  toggle: (index: number, enabled: boolean): Promise<boolean> =>
    invoke('toggle_book_source', { sourceIndex: index, enabled }),
  delete: (index: number): Promise<boolean> => invoke('delete_book_source', { sourceIndex: index }),
  deleteFailed: (): Promise<number> => invoke('delete_failed_sources'),

  listenTestResult: async (handler: (result: SourceTestResult) => void): Promise<UnlistenFn> => {
    // 去重：移除旧监听
    if (testResultUnlisten) {
      try { testResultUnlisten() } catch { /* ignore */ }
      testResultUnlisten = null
    }
    testResultUnlisten = await listen('source-test-result', (event: unknown) => {
      const payload = (event as { payload: SourceTestResult }).payload
      handler(payload)
    })
    return testResultUnlisten
  },
}
