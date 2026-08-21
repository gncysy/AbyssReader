// ============================================
// 书源辅助 — parseHeader 等纯函数
// ============================================

import type { EngineBookSource, EngineBook } from '../../types.js'

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

export async function parseSourceHeader(
  source: EngineBookSource,
  book?: Partial<EngineBook>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (source.header) {
      if (source.header.startsWith('@js:') || source.header.startsWith('<js>')) {
        const { getJsRuntime } = await import('../../parser/js-executor.js')
        const runtime = getJsRuntime()
        if (runtime) {
          const headerResult = await runtime.execute(source.header, {
            source,
            baseUrl: source.bookSourceUrl || '',
            result: '',
            book: book || {},
          })
          try {
            const parsed = JSON.parse(headerResult) as Record<string, unknown>
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== null && value !== undefined) {
                result[key] = String(value)
              }
            }
          } catch {
            try {
              const parsed = JSON.parse(headerResult.replace(/'/g, '"')) as Record<string, unknown>
              for (const [key, value] of Object.entries(parsed)) {
                if (value !== null && value !== undefined) {
                  result[key] = String(value)
                }
              }
            } catch {
              // ignore
            }
          }
        }
      } else {
        try {
          const parsed = JSON.parse(source.header) as Record<string, unknown>
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined) {
              result[key] = String(value)
            }
          }
        } catch {
          try {
            const parsed = JSON.parse((source.header || '{}').replace(/'/g, '"')) as Record<string, unknown>
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== null && value !== undefined) {
                result[key] = String(value)
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return result
}
