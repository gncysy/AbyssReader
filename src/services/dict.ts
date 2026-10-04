// ============================================
// 字典查询服务 — 封装 Tauri invoke
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { shouldExecuteInDeno } from './rule-evaluator.js'

export interface DictQueryResult {
  content: string
}

interface DictQueryResponse {
  success?: boolean
  result?: string
  error?: string | null
}

interface FetchUrlResponse {
  status: number
  body: string
  headers: Record<string, string>
  url: string
}

function isDictQueryResponse(value: unknown): value is DictQueryResponse {
  return value !== null && typeof value === 'object'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFetchUrlResponse(value: unknown): value is FetchUrlResponse {
  if (!isRecord(value)) return false
  return typeof value.status === 'number' && typeof value.body === 'string'
}

export async function queryDict(
  urlRule: string,
  showRule: string,
  key: string,
  timeoutSecs = 20,
): Promise<string> {
  const needDeno = shouldExecuteInDeno(urlRule) || shouldExecuteInDeno(showRule)

  if (needDeno) {
    const response: unknown = await invoke('dict_query', {
      urlRule,
      showRule,
      key,
      timeoutSecs: timeoutSecs || 20,
    })
    if (isDictQueryResponse(response) && typeof response.result === 'string') {
      return response.result
    }
    return '<p>查询失败</p>'
  }

  try {
    const replacedUrl = urlRule.replace(/\{\{key\}\}/g, encodeURIComponent(key))
    const response: unknown = await invoke('fetch_url', {
      url: replacedUrl,
      method: 'GET',
      body: null,
      headers: {},
      charset: null,
      useWebview: false,
      webJs: null,
      timeoutSecs: timeoutSecs || 20,
      sourceType: 0,
      preserveStyle: false,
    })

    // 修复：解析结构化结果
    let html = ''
    if (isFetchUrlResponse(response)) {
      if (response.status < 200 || response.status >= 300) {
        return '<p>获取页面内容失败</p>'
      }
      html = response.body
    } else if (typeof response === 'string') {
      html = response
    } else {
      html = JSON.stringify(response)
    }

    if (!html || html.length < 10) return '<p>获取页面内容失败</p>'

    const { getString } = await import('@engine/parser/index.js')
    const result = await getString(html, showRule, {})
    if (!result || result.length === 0) return '<p>未匹配到内容</p>'
    return result
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return '<p>查询失败: ' + msg + '</p>'
  }
}
