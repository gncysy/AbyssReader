/**
 * 变量系统
 * 支持 @put:{key:"selector@text"} 和 @get:{key}
 * 支持 {{ jsExpression }} 内联 JS
 * 
 * 使用方式：
 * 1. 在 ruleBookInfo.init 中使用 @put 存储变量
 * 2. 在后续规则中使用 @get 读取变量
 * 3. 在任意规则中使用 {{ js }} 执行 JS 表达式
 */

import { parseAndExecute } from './index.js'

// ===== 按书源隔离的变量存储 =====
const _variableStore = new Map<string, Map<string, any>>()

function getSourceMap(sourceId?: string): Map<string, any> {
  const id = sourceId || 'default'
  if (!_variableStore.has(id)) {
    _variableStore.set(id, new Map())
  }
  return _variableStore.get(id)!
}

export function putVariable(key: string, value: any, sourceId?: string): void {
  const map = getSourceMap(sourceId)
  map.set(key, value)
}

export function getVariable(key: string, sourceId?: string): any {
  const map = getSourceMap(sourceId)
  return map.get(key)
}

export function clearVariables(sourceId?: string): void {
  if (sourceId) {
    _variableStore.delete(sourceId)
  } else {
    _variableStore.clear()
  }
}

export function getAllVariables(sourceId?: string): Record<string, any> {
  const map = getSourceMap(sourceId)
  const result: Record<string, any> = {}
  for (const [key, value] of map) {
    result[key] = value
  }
  return result
}

// ============================================================
// 以下为兼容旧代码的 API
// ============================================================

export class VariableStore {
  private static instance: VariableStore
  private variables: Map<string, any> = new Map()

  static getInstance(): VariableStore {
    if (!VariableStore.instance) {
      VariableStore.instance = new VariableStore()
    }
    return VariableStore.instance
  }

  put(key: string, value: any): void {
    this.variables.set(key, value)
  }

  get(key: string): any {
    return this.variables.get(key)
  }

  has(key: string): boolean {
    return this.variables.has(key)
  }

  delete(key: string): boolean {
    return this.variables.delete(key)
  }

  clear(): void {
    this.variables.clear()
  }

  getAll(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, value] of this.variables) {
      result[key] = value
    }
    return result
  }

  loadFromObject(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      this.variables.set(key, value)
    }
  }
}

export const variableStore = VariableStore.getInstance()

// ============================================================
// 规则解析函数
// ============================================================

export function parsePutRule(rule: string, context: any): string {
  if (!rule || typeof rule !== 'string') return rule

  const putPattern = /@put:\s*\{([^}]+)\}/gi
  let result = rule
  let match

  while ((match = putPattern.exec(rule)) !== null) {
    try {
      const jsonStr = match[1].trim()
      const cleanJson = jsonStr.replace(/'/g, '"')
      const obj = JSON.parse(`{${cleanJson}}`)

      const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          const parsedValue = parseAndExecute(context, value, context)
          putVariable(key, parsedValue !== null ? parsedValue : value, sourceId)
        } else {
          putVariable(key, value, sourceId)
        }
      }

      result = result.replace(match[0], '')
    } catch (e) {
      console.warn('[Variable] 解析 @put 失败:', e)
    }
  }

  return result.trim()
}

export function parseGetRule(rule: string, sourceId?: string): string {
  if (!rule || typeof rule !== 'string') return rule

  const getPattern = /@get:\s*\{([^}]+)\}/gi
  let result = rule

  while (true) {
    const match = getPattern.exec(rule)
    if (!match) break

    const key = match[1].trim()
    const value = getVariable(key, sourceId)

    if (value !== undefined && value !== null) {
      result = result.replace(match[0], String(value))
    } else {
      result = result.replace(match[0], '')
    }
    getPattern.lastIndex = 0
  }

  return result
}

export function parseInlineJs(
  rule: string,
  context: any,
  evalJs: (code: string, ctx: any) => any
): string {
  if (!rule || typeof rule !== 'string') return rule

  const jsPattern = /\{\{([^}]+)\}\}/g
  let result = rule

  while (true) {
    const match = jsPattern.exec(rule)
    if (!match) break

    const code = match[1].trim()
    try {
      const value = evalJs(code, context)
      if (value !== undefined && value !== null) {
        result = result.replace(match[0], String(value))
      } else {
        result = result.replace(match[0], '')
      }
    } catch (e) {
      console.warn('[Variable] 执行内联 JS 失败:', e)
      result = result.replace(match[0], '')
    }
    jsPattern.lastIndex = 0
  }

  return result
}

export function processVariables(
  rule: string,
  context: any,
  evalJs: (code: string, ctx: any) => any
): string {
  if (!rule || typeof rule !== 'string') return rule

  const sourceId = context.source?.bookSourceUrl || context.source?.url || 'default'
  
  let processed = parsePutRule(rule, context)
  processed = parseInlineJs(processed, context, evalJs)
  processed = parseGetRule(processed, sourceId)

  return processed
}

export function executeInitRule(
  initRule: string,
  context: any,
  evalJs: (code: string, ctx: any) => any
): void {
  if (!initRule || typeof initRule !== 'string') return
  processVariables(initRule, context, evalJs)
}

export default {
  putVariable,
  getVariable,
  clearVariables,
  getAllVariables,
  variableStore,
  parsePutRule,
  parseGetRule,
  parseInlineJs,
  processVariables,
  executeInitRule,
}
