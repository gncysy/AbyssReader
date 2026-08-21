// ============================================
// JS 规则段执行器
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { logError } from '@engine/log/index.js'

const JS_TIMEOUT_DEFAULT = 30000

interface JsExecutionResponse {
  success: boolean
  result: string
  error?: string | null
}

function isJsExecutionResponse(value: unknown): value is JsExecutionResponse {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.success === 'boolean'
}

export async function executeJsSegment(
  code: string,
  data: unknown,
  context: Record<string, unknown>,
  ruleTag?: string,
): Promise<unknown> {
  try {
    const response = await invoke('execute_js_rule', {
      code,
      context: { ...context, result: data },
      timeoutMs: JS_TIMEOUT_DEFAULT,
    })

    if (!isJsExecutionResponse(response)) {
      return ''
    }

    if (response.success && response.result !== undefined && response.result !== null) {
      const raw = response.result

      if (typeof raw === 'string') {
        const trimmed = raw.trim()

        // runtime.rs 中 JS 异常时返回 {"error":true,"message":"...","stack":"..."}
        if (trimmed.startsWith('{') && trimmed.includes('"error":true')) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>
            const errorMsg = typeof parsed.message === 'string' ? parsed.message : '未知 JS 错误'
            logError('engine', 'frontend', `[规则] JS 执行错误: ${errorMsg}`, ruleTag)
            return ''
          } catch {
            // 不是合法 JSON，继续正常处理
          }
        }
        if (trimmed === 'undefined' || trimmed === 'null') {
          return ''
        }
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try { return JSON.parse(trimmed) as unknown } catch { return raw }
        }
        return raw
      }
      return raw
    }
    const errorMsg = response.error || '未知错误'
    logError('engine', 'frontend', `[规则] JS 执行失败: ${errorMsg}`, ruleTag)
    return ''
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('engine', 'frontend', `[规则] JS 执行异常: ${msg}`, ruleTag)
    return ''
  }
}
