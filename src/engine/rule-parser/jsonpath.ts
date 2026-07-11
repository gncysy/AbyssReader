import jsonpath from 'jsonpath'
import type { ParsedRule } from './index'

export function parseJsonPath(rule: string): ParsedRule {
  let expression = rule
  if (expression.startsWith('@json:')) {
    expression = expression.substring(6)
  }

  return {
    type: 'json',
    expression: expression.trim(),
    attribute: null,
    cleanPattern: null,
    cleanReplacement: null,
    flags: null,
    original: rule,
  }
}

export function executeJsonPath(source: any, expression: string): any {
  if (!source) return null

  let data = source
  if (typeof source === 'string') {
    try {
      data = JSON.parse(source)
    } catch {
      return null
    }
  }

  if (typeof data !== 'object' || data === null) return null

  try {
    const result = jsonpath.query(data, expression)
    if (!result || result.length === 0) return null
    return result.length === 1 ? result[0] : result
  } catch {
    return null
  }
}
