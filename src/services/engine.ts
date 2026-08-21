// ============================================
// 引擎 API — 封装 Tauri invoke + engine 动态导入
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { setJsRuntime } from '@engine/parser/js-executor.js'
import type { JsRuntime } from '@engine/types.js'

const JS_TIMEOUT_DEFAULT = 30000

interface JsRuleResponse {
  success: boolean
  result?: string
  error?: string | null
}

function isJsRuleResponse(value: unknown): value is JsRuleResponse {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.success === 'boolean'
}

async function executeJs(code: unknown, context: Record<string, unknown>): Promise<string> {
  const codeStr = typeof code === 'string' ? code : String(code || '')
  if (!codeStr) return ''

  if (context.source && typeof context.source === 'object') {
    const src = context.source as Record<string, unknown>
    if (!src.getVariable) src.getVariable = function (this: Record<string, unknown>, key: string) { return String(this[key] || '') }
    if (!src.getKey) src.getKey = function (this: Record<string, unknown>) { return String(this.bookSourceUrl || this.sourceUrl || '') }
    if (!src.getTag) src.getTag = function (this: Record<string, unknown>) { return String(this.bookSourceName || this.sourceName || '') }
  }

  try {
    const response = await invoke('execute_js_rule', {
      code: codeStr,
      context,
      timeoutMs: JS_TIMEOUT_DEFAULT,
    })
    if (isJsRuleResponse(response)) {
      if (response.success) return response.result || ''
      if (response.error) {
        console.warn('[executeJs] error:', response.error)
      }
    }
    return ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[executeJs] invoke failed:', msg)
    return ''
  }
}

export async function executeJsRule(
  code: string,
  context: Record<string, unknown>,
  timeoutMs = JS_TIMEOUT_DEFAULT,
): Promise<string> {
  if (!code) return ''
  try {
    const response = await invoke('execute_js_rule', {
      code,
      context,
      timeoutMs,
    })
    if (isJsRuleResponse(response)) {
      if (response.success) return response.result || ''
    }
    return ''
  } catch {
    return ''
  }
}

const tauriJsRuntime: JsRuntime = {
  execute: executeJs,
}

setJsRuntime(tauriJsRuntime)

export const engine = {
  executeJs,
  executeJsRule,

  getExploreBooks: async (source: unknown, categoryUrl: string, page = 1): Promise<unknown[]> => {
    const { getExploreBooks } = await import('@engine/business/explore/index.js')
    return getExploreBooks(source as Parameters<typeof getExploreBooks>[0], categoryUrl, page)
  },

  getExploreCategories: async (sourceIndex: number): Promise<unknown[]> => {
    try {
      const result = await invoke('get_explore_categories', { sourceIndex })
      if (Array.isArray(result) && result.length > 0) return result as unknown[]
    } catch {
      // 降级到前端解析
    }

    const { store } = await import('./store.js')
    const sources = await store.get('bookSource')
    const source = Array.isArray(sources) ? sources[sourceIndex] : null
    if (!source) return []

    const { getExploreCategories } = await import('@engine/business/explore/index.js')
    return getExploreCategories(source as Parameters<typeof getExploreCategories>[0])
  },
}
