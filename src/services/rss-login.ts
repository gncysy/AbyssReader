// ============================================
// RSS 登录服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'

export interface RssLoginSource {
  sourceUrl: string
  loginUrl?: string | null
  loginUi?: string | null
  loginCheckJs?: string | null
  [key: string]: unknown
}

export interface RssLoginResult {
  success: boolean
  result: string
  error?: string | undefined
}

export interface RssLoginExtraContext {
  result?: string
  formData?: Record<string, string>
  timeoutMs?: number
}

interface JsExecutionResponse {
  success: boolean
  result: string
  error: string | null
}

function isJsExecutionResponse(value: unknown): value is JsExecutionResponse {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.success === 'boolean'
}

export async function executeRssLoginJs(
  code: string,
  source: RssLoginSource,
  extraContext: RssLoginExtraContext = {},
): Promise<RssLoginResult> {
  const context = {
    source,
    result: extraContext.result ?? '',
    baseUrl: source.sourceUrl || '',
    formData: extraContext.formData || {},
  }
  const response = await invoke('execute_js_rule', {
    code,
    context,
    timeoutMs: extraContext.timeoutMs || 15000,
  })

  if (isJsExecutionResponse(response)) {
    const result: RssLoginResult = {
      success: response.success,
      result: response.result || '',
    }
    if (response.error !== null && response.error !== undefined) {
      result.error = response.error
    }
    return result
  }

  return { success: false, result: '' }
}
