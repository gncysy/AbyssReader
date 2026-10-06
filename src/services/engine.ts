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

// 标记已注入 getVariable/getKey/getTag 的 source 对象，
// 避免每次 executeJs 调用都重新赋值。
const INJECTED_SOURCE_FLAG = '__abyss_injected__'

function ensureSourceMethods(source: Record<string, unknown>): void {
  if (source[INJECTED_SOURCE_FLAG] === true) return

  if (!source.getVariable) {
    source.getVariable = function (this: Record<string, unknown>, key: string) {
      return String(this[key] || '')
    }
  }
  if (!source.getKey) {
    source.getKey = function (this: Record<string, unknown>) {
      return String(this.bookSourceUrl || this.sourceUrl || '')
    }
  }
  if (!source.getTag) {
    source.getTag = function (this: Record<string, unknown>) {
      return String(this.bookSourceName || this.sourceName || '')
    }
  }
  try {
    Object.defineProperty(source, INJECTED_SOURCE_FLAG, {
      value: true,
      enumerable: false,
      configurable: true,
      writable: true,
    })
  } catch {
    // 冻结对象，无法标记，但已注入方法，下次仍会重试（幂等）
  }
}

// 递归清理 context，处理三类问题：
// 1. Vue 响应式 Proxy → JSON 拷贝脱掉
// 2. DomNode（有 tag + querySelectorAll）→ 循环引用，转成字符串
// 3. 函数 → IPC 不能序列化，跳过
function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 5) return null
  if (val === null || val === undefined) return val
  const t = typeof val
  if (t === 'string' || t === 'number' || t === 'boolean') return val
  if (t === 'function') return undefined
  if (Array.isArray(val)) {
    return val.map((v) => sanitizeValue(v, depth + 1)).filter((v) => v !== undefined)
  }
  if (t === 'object') {
    const obj = val as Record<string, unknown>
    // DomNode 检测：有 tag 字段 + querySelectorAll 函数 → 循环引用，转字符串
    if (typeof obj.tag === 'string' && typeof obj.querySelectorAll === 'function') {
      const tc = obj.textContent
      return typeof tc === 'string' ? tc : String(obj.outerHTML || '')
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = sanitizeValue(v, depth + 1)
      if (cleaned !== undefined) out[k] = cleaned
    }
    return out
  }
  return null
}

// 深拷贝脱掉 Vue 响应式 Proxy + 清理 DomNode 循环引用。
// 失败时回退原对象（宁可序列化失败，也不要丢数据）。
function toPlainContext(context: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(sanitizeValue(context))) as Record<string, unknown>
  } catch {
    return context
  }
}

/**
 * 严格版：JS 执行失败时抛异常，不吞掉错误。
 *
 * 用于需要区分"正常返回空"和"执行失败"的场景（如替换规则）。
 * Rust 侧 execute_js_rule 已识别 wrap_user_code 返回的错误 JSON，
 * 返回 success: false。此处将 error 转为异常抛出。
 */
async function executeJsStrict(code: unknown, context: Record<string, unknown>, timeoutMs = JS_TIMEOUT_DEFAULT): Promise<string> {
  const codeStr = typeof code === 'string' ? code : String(code || '')
  if (!codeStr) return ''

  const safeContext = toPlainContext(context)
  if (safeContext.source && typeof safeContext.source === 'object') {
    ensureSourceMethods(safeContext.source as Record<string, unknown>)
  }

  const response = await invoke('execute_js_rule', {
    code: codeStr,
    context: safeContext,
    timeoutMs,
  })

  if (isJsRuleResponse(response)) {
    if (response.success) {
      return response.result || ''
    }
    throw new Error(response.error || 'JS 执行失败')
  }
  throw new Error('无效响应')
}

/**
 * 宽松版：JS 执行失败时返回空字符串。
 *
 * 用于"失败就跳过"的场景（如目录规则、发现规则）。
 */
async function executeJs(code: unknown, context: Record<string, unknown>): Promise<string> {
  try {
    return await executeJsStrict(code, context)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[executeJs] error:', msg)
    return ''
  }
}

export async function executeJsRule(
  code: string,
  context: Record<string, unknown>,
  timeoutMs = JS_TIMEOUT_DEFAULT,
): Promise<string> {
  try {
    return await executeJsStrict(code, context, timeoutMs)
  } catch {
    return ''
  }
}

const tauriJsRuntime: JsRuntime = {
  execute: executeJs,
}

let initialized = false

export function initEngineJsRuntime(): void {
  if (initialized) return
  initialized = true
  setJsRuntime(tauriJsRuntime)
}

export function resetEngineJsRuntime(): void {
  initialized = false
}

export const engine = {
  executeJs,
  executeJsStrict,
  executeJsRule,

  getExploreBooks: async (source: unknown, categoryUrl: string, page = 1): Promise<unknown[]> => {
    const { getExploreBooks } = await import('@engine/business/explore/index.js')
    const { getGlobalHttpClient } = await import('@engine/network/client.js')
    const { getJsRuntime } = await import('@engine/parser/js-executor.js')
    return getExploreBooks(
      source as Parameters<typeof getExploreBooks>[0],
      categoryUrl,
      page,
      getGlobalHttpClient(),
      getJsRuntime(),
    )
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
