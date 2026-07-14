import jsonpath from 'jsonpath'
import type { ParsedRule } from './index.js'

export function parseJsonPath(rule: string): ParsedRule {
  let expression = rule
  if (expression.startsWith('@json:')) expression = expression.substring(6)
  return { type: 'json', expression: expression.trim(), attribute: null, cleanPattern: null, cleanReplacement: null, flags: null, original: rule }
}

export function executeJsonPath(source: any, expression: string): any {
  if (!source) return null
  
  // 如果 source 是字符串，尝试解析为 JSON
  let data = source
  if (typeof source === 'string') {
    try { data = JSON.parse(source) } catch { return null }
  }
  
  if (typeof data !== 'object' || data === null) return null
  
  try {
    // 处理 $..rows[*] 这样的表达式
    let expr = expression.trim()
    // 如果表达式以 $ 开头，直接用 jsonpath
    if (expr.startsWith('$')) {
      const result = jsonpath.query(data, expr)
      if (!result || result.length === 0) return null
      return result.length === 1 ? result[0] : result
    }
    // 如果表达式是简单的属性名，直接访问
    if (!expr.includes('[') && !expr.includes('..') && !expr.includes('*')) {
      const result = data[expr]
      return result !== undefined ? result : null
    }
    // 其他情况尝试用 jsonpath 加上 $
    const result = jsonpath.query(data, `$.${expr}`)
    if (!result || result.length === 0) return null
    return result.length === 1 ? result[0] : result
  } catch (err: any) {
    console.warn('[JSONPath] 执行失败:', err.message, expression)
    return null
  }
}
