// ============================================
// 规则执行调度器 — @get: 直接从 STORAGE 读取，不执行 JS 收集
// ============================================

import { invoke } from '@tauri-apps/api/core'
import { getString } from '@engine/parser/index.js'
import type { ParseContext } from '@engine/types.js'
import { parseRuleSegments } from './rule-parser.js'
import { executeJsSegment } from './rule-js-executor.js'

export function shouldExecuteInDeno(rule: string): boolean {
  if (!rule) return false
  if (rule.includes('@js:')) return true
  if (rule.includes('@javascript:')) return true
  if (rule.includes('<js>')) return true
  if (rule.includes('JavaImporter')) return true
  if (rule.includes('org.jsoup')) return true
  return false
}

async function getVariableValue(key: string): Promise<string> {
  try {
    const code = `java.get(${JSON.stringify(key)})`
    const response = await invoke('execute_js_rule', {
      code,
      context: {},
      timeoutMs: 3000,
    })
    const obj = response as Record<string, unknown>
    if (obj.success === true) return typeof obj.result === 'string' ? obj.result : ''
    return ''
  } catch {
    return ''
  }
}

export async function evaluateRule(
  rule: string,
  data: unknown,
  context: Record<string, unknown>,
  options?: { forceDeno?: boolean; cacheKey?: string }
): Promise<unknown> {
  if (!rule) return data

  if (rule.includes('@get:')) {
    try {
      const getMatches = rule.match(/@get:\{([^}]+)\}/g)
      if (getMatches) {
        const uniqueKeys = new Set<string>()
        for (const m of getMatches) {
          const keyMatch = /^@get:\{([^}]+)\}$/.exec(m)
          const key = keyMatch && keyMatch[1] !== undefined ? keyMatch[1] : m.substring(6, m.length - 1)
          uniqueKeys.add(key)
        }
        for (const key of uniqueKeys) {
          const val = await getVariableValue(key)
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          rule = rule.replace(new RegExp('@get:\\{' + escapedKey + '\\}', 'g'), String(val))
        }
      }
    } catch {
      // ignore
    }
  }

  const needDeno = options?.forceDeno ?? shouldExecuteInDeno(rule)

  if (!needDeno) {
    if (rule && !rule.includes('@') && !rule.includes('.') && !rule.includes('#') && !rule.includes('[') && !rule.includes(' ') && !rule.startsWith('//')) {
      return rule
    }
    return getString(data, rule, context as ParseContext)
  }

  const segments = parseRuleSegments(rule)
  if (segments.length === 0) return data

  const ruleTag = typeof context?.source === 'object' && context.source !== null
    ? String((context.source as Record<string, unknown>).bookSourceUrl || rule.substring(0, 100))
    : rule.substring(0, 100)

  if (segments.length === 1) {
    const seg = segments[0]
    if (seg !== undefined) {
      if (seg.type === 'pure') return getString(data, seg.rule, context as ParseContext)
      if (seg.type === 'js') return executeJsSegment(seg.code, data, context, ruleTag)
    }
    return data
  }

  let prevResult: unknown = data

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg === undefined) continue
    if (seg.type === 'pure') {
      const input = i === 0 ? data : prevResult
      prevResult = await getString(input, seg.rule, context as ParseContext)
    } else if (seg.type === 'js') {
      prevResult = await executeJsSegment(seg.code, prevResult, context, ruleTag)
    }
  }

  return prevResult
}
