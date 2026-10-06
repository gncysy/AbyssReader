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

function unwrapStringArray(arr: unknown[]): unknown[] {
  let needsUnwrap = false
  for (const item of arr) {
    if (typeof item === 'string' && item.trim().startsWith('{')) {
      needsUnwrap = true
      break
    }
  }
  if (!needsUnwrap) return arr

  const result: unknown[] = []
  for (const item of arr) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          result.push(JSON.parse(trimmed))
          continue
        } catch {
          // parse 失败，保留原值
        }
      }
    }
    result.push(item)
  }
  return result
}

function parseLegacyStringArray(trimmed: string): unknown[] | null {
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  if (!trimmed.includes('},{')) {
    try {
      const obj = JSON.parse(trimmed) as unknown
      return [obj]
    } catch {
      return null
    }
  }
  try {
    const wrapped = '[' + trimmed + ']'
    const arr = JSON.parse(wrapped) as unknown
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
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

        // 修复：wrap_user_code 捕获异常时返回 {"__error":true,...}，
        // 原实现检查 "error":true（少了下划线），永远不命中。
        // 现在检查 "__error":true，正确识别错误 JSON，返回空字符串。
        if (trimmed.startsWith('{') && trimmed.includes('"__error":true')) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>
            const errorMsg = typeof parsed.__message === 'string'
              ? parsed.__message
              : (typeof parsed.message === 'string' ? parsed.message : '未知 JS 错误')
            logError('engine', 'frontend', `[规则] JS 执行错误: ${errorMsg}`, ruleTag)
            return ''
          } catch {
            // 不是合法 JSON，继续走下面的处理
          }
        }
        if (trimmed === 'undefined' || trimmed === 'null') {
          return ''
        }

        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsed = JSON.parse(trimmed) as unknown
            if (Array.isArray(parsed)) {
              return unwrapStringArray(parsed)
            }
            return parsed
          } catch {
            const legacyArr = parseLegacyStringArray(trimmed)
            if (legacyArr !== null) {
              return unwrapStringArray(legacyArr)
            }
            return raw
          }
        }

        return raw
      }

      if (Array.isArray(raw)) {
        return unwrapStringArray(raw)
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
