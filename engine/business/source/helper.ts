// ============================================
// 书源辅助 — parseHeader 等纯函数
// ============================================

import type { EngineBookSource, EngineBook, JsRuntime } from '../../types.js'

export function parseHeader(header: string | null | undefined): Record<string, string> | null {
  if (!header) return null
  if (typeof header !== 'string') return header as unknown as Record<string, string>
  try {
    return JSON.parse(header) as Record<string, string>
  } catch {
    return null
  }
}

export function parseSourcesFromJson(jsonStr: unknown): EngineBookSource[] {
  let data: unknown = jsonStr

  if (typeof jsonStr === 'object' && jsonStr !== null) {
    data = jsonStr
  } else if (typeof jsonStr === 'string') {
    if (jsonStr === '[object Object]') return []
    try {
      data = JSON.parse(jsonStr)
    } catch {
      return []
    }
  } else {
    return []
  }

  if (Array.isArray(data)) return data as EngineBookSource[]

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (obj.bookSourceUrl || obj.bookSourceName || obj.ruleSearch || obj.searchUrl) {
      return [obj as unknown as EngineBookSource]
    }

    const wrapperKeys = ['sources', 'bookSources', 'list', 'items', 'result']
    for (const key of wrapperKeys) {
      const value = obj[key]
      if (Array.isArray(value)) return value as EngineBookSource[]
    }

    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>
      if (!Array.isArray(inner)) {
        for (const key of wrapperKeys) {
          const value = inner[key]
          if (Array.isArray(value)) return value as EngineBookSource[]
        }
      } else {
        return inner as unknown as EngineBookSource[]
      }
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) {
        const first = value[0]
        if (
          typeof first === 'object' &&
          first !== null &&
          ((first as Record<string, unknown>).bookSourceUrl ||
            (first as Record<string, unknown>).bookSourceName ||
            (first as Record<string, unknown>).ruleSearch ||
            (first as Record<string, unknown>).searchUrl)
        ) {
          return value as EngineBookSource[]
        }
      }
    }
  }

  return []
}

/**
 * 将 header 字符串（JSON 或单引号 JSON）解析到 result。
 * 修复：单引号 JSON 修复逻辑只写一份，避免两处重复。
 */
function applyHeaderString(headerStr: string, result: Record<string, string>): void {
  const tryParse = (str: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(str) as Record<string, unknown>
    } catch {
      return null
    }
  }

  let parsed = tryParse(headerStr)
  if (!parsed) {
    parsed = tryParse(headerStr.replace(/'/g, '"'))
  }
  if (!parsed) return

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && value !== undefined) {
      result[key] = String(value)
    }
  }
}

/**
 * 解析书源 header。
 * 当 header 为 @js: / <js> 时，需要注入的 JsRuntime 执行。
 * 未注入 runtime 时，JS 规则直接跳过（返回空 header）。
 */
export async function parseSourceHeader(
  source: EngineBookSource,
  runtime: JsRuntime | null,
  book?: Partial<EngineBook>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (!source.header) return result
    if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
      if (!runtime) return result
      const headerResult = await runtime.execute(source.header, {
        source,
        baseUrl: source.bookSourceUrl || '',
        result: '',
        book: book || {},
      })
      applyHeaderString(headerResult, result)
    } else {
      applyHeaderString(source.header, result)
    }
  } catch {
    // ignore
  }
  return result
}
