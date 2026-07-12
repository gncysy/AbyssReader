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

/**
 * 变量存储
 */
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

/**
 * 解析 @put:{key:value} 规则
 * @param rule 规则字符串
 * @param context 上下文（用于解析值）
 * @returns 处理后的规则（移除 @put 部分）
 */
export function parsePutRule(rule: string, context: any): string {
  if (!rule || typeof rule !== 'string') return rule

  // 匹配 @put:{...}
  const putPattern = /@put:\s*\{([^}]+)\}/gi
  let result = rule
  let match

  while ((match = putPattern.exec(rule)) !== null) {
    try {
      // 解析 JSON 对象
      const jsonStr = match[1].trim()
      // 处理单引号转双引号
      const cleanJson = jsonStr.replace(/'/g, '"')
      const obj = JSON.parse(`{${cleanJson}}`)

      // 存储每个键值对
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // 如果值是规则，解析它
          const parsedValue = parseAndExecute(context, value, context)
          variableStore.put(key, parsedValue !== null ? parsedValue : value)
        } else {
          variableStore.put(key, value)
        }
      }

      // 从规则中移除 @put 部分
      result = result.replace(match[0], '')
    } catch (e) {
      console.warn('[Variable] 解析 @put 失败:', e)
    }
  }

  return result.trim()
}

/**
 * 解析 @get:{key} 规则
 * @param rule 规则字符串
 * @returns 替换后的字符串
 */
export function parseGetRule(rule: string): string {
  if (!rule || typeof rule !== 'string') return rule

  const getPattern = /@get:\s*\{([^}]+)\}/gi
  let result = rule

  while (true) {
    const match = getPattern.exec(rule)
    if (!match) break

    const key = match[1].trim()
    const value = variableStore.get(key)

    if (value !== undefined && value !== null) {
      result = result.replace(match[0], String(value))
    } else {
      // 如果变量不存在，保留原样
      result = result.replace(match[0], '')
    }
    // 重置正则索引
    getPattern.lastIndex = 0
  }

  return result
}

/**
 * 解析 {{ jsExpression }} 内联 JS
 * @param rule 规则字符串
 * @param context 上下文
 * @param evalJs JS 执行函数
 * @returns 替换后的字符串
 */
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
    // 重置正则索引
    jsPattern.lastIndex = 0
  }

  return result
}

/**
 * 处理规则中的变量（@put / @get / {{}}）
 * @param rule 原始规则
 * @param context 上下文
 * @param evalJs JS 执行函数
 * @returns 处理后的规则
 */
export function processVariables(
  rule: string,
  context: any,
  evalJs: (code: string, ctx: any) => any
): string {
  if (!rule || typeof rule !== 'string') return rule

  // 1. 先处理 @put（存储变量）
  let processed = parsePutRule(rule, context)

  // 2. 处理 {{ }} 内联 JS
  processed = parseInlineJs(processed, context, evalJs)

  // 3. 处理 @get（读取变量）
  processed = parseGetRule(processed)

  return processed
}

/**
 * 在规则中查找并执行 @put 初始化
 * @param initRule 初始化规则（ruleBookInfo.init）
 * @param context 上下文
 * @param evalJs JS 执行函数
 */
export function executeInitRule(
  initRule: string,
  context: any,
  evalJs: (code: string, ctx: any) => any
): void {
  if (!initRule || typeof initRule !== 'string') return

  // 处理 @put 规则
  processVariables(initRule, context, evalJs)
}

export default {
  variableStore,
  parsePutRule,
  parseGetRule,
  parseInlineJs,
  processVariables,
  executeInitRule,
}
