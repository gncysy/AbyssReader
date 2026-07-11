import vm from 'node:vm'
import { buildJavaAPI } from '../platform/java-bridge.js'
import type { ParsedRule, RuleContext } from './index.js'

interface SandboxContext {
  source: any
  result: any
  baseUrl: string
  key: string
  page: number
  java: any
  trim: (s: any) => string
  replace: (s: any, p: string, r: string) => string
  split: (s: any, p: string) => string[]
  join: (arr: any[], sep?: string) => string
  filter: <T>(arr: T[], fn: (item: T) => boolean) => T[]
  map: <T, U>(arr: T[], fn: (item: T) => U) => U[]
  reduce: <T, U>(arr: T[], fn: (acc: U, item: T) => U, init: U) => U
  isString: (v: any) => v is string
  isNumber: (v: any) => v is number
  isArray: (v: any) => v is any[]
  isObject: (v: any) => v is Record<string, any>
  Math: typeof Math
  parseInt: typeof parseInt
  parseFloat: typeof parseFloat
  JSON: typeof JSON
  Date: typeof Date
  encodeURI: typeof encodeURIComponent
  decodeURI: typeof decodeURIComponent
  [key: string]: any
}

const dangerousPatterns = [
  /require\s*\(/,
  /import\s*\(/,
  /process\./,
  /global\./,
  /__dirname/,
  /__filename/,
  /eval\s*\(/,
  /Function\s*\(/,
  /new\s+Function/,
  /child_process/,
  /exec\s*\(/,
  /spawn\s*\(/,
  /fork\s*\(/,
  /fs\./,
  /http\./,
  /https\./,
  /net\./,
  /dgram\./,
  /cluster\./,
  /vm\./,
]

export function parseJs(rule: string): ParsedRule {
  return {
    type: 'js',
    expression: rule.substring(4).trim(),
    attribute: null,
    cleanPattern: null,
    cleanReplacement: null,
    flags: null,
    original: rule,
  }
}

function isDangerous(code: string): boolean {
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return true
    }
  }
  return false
}

export function executeJs(
  source: any,
  expression: string,
  context: RuleContext
): any {
  if (!source) return null

  if (isDangerous(expression)) {
    console.error('[RuleParser.js] 拒绝执行包含危险模式的代码')
    return null
  }

  const safeContext: Record<string, any> = {
    source: context.source || source,
    result: context.result || source,
    baseUrl: context.baseUrl || '',
    key: context.key || '',
    page: context.page || 1,
    // 注入 java API
    java: buildJavaAPI(),
    trim: (s: any) => String(s).trim(),
    replace: (s: any, p: string, r: string) => String(s).replace(new RegExp(p, 'g'), r),
    split: (s: any, p: string) => String(s).split(p),
    join: (arr: any[], sep?: string) => Array.isArray(arr) ? arr.join(sep || '') : String(arr),
    filter: <T>(arr: T[], fn: (item: T) => boolean) => Array.isArray(arr) ? arr.filter(fn) : [],
    map: <T, U>(arr: T[], fn: (item: T) => U) => Array.isArray(arr) ? arr.map(fn) : [],
    reduce: <T, U>(arr: T[], fn: (acc: U, item: T) => U, init: U) => Array.isArray(arr) ? arr.reduce(fn, init) : init,
    isString: (v: any): v is string => typeof v === 'string',
    isNumber: (v: any): v is number => typeof v === 'number',
    isArray: (v: any): v is any[] => Array.isArray(v),
    isObject: (v: any): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v),
    Math,
    parseInt,
    parseFloat,
    JSON,
    Date,
    encodeURI: encodeURIComponent,
    decodeURI: decodeURIComponent,
  }

  for (const [key, value] of Object.entries(context)) {
    if (key in safeContext) {
      continue
    }
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safeContext[key] = value
    } else if (Array.isArray(value) && value.every(v => typeof v !== 'function')) {
      safeContext[key] = value
    } else {
      console.warn('[RuleParser.js] 拒绝注入复杂对象:', key, typeof value)
    }
  }

  Object.freeze(safeContext.Math)
  Object.freeze(safeContext.JSON)
  Object.freeze(safeContext.Date)
  Object.freeze(safeContext)

  try {
    const script = new vm.Script(`(() => { return (${expression}) })()`, {
      timeout: 1000,
    } as any)
    const result = script.runInNewContext(safeContext, {
      timeout: 1000,
      displayErrors: true,
      breakOnSigint: true,
    })
    if (result !== null && result !== undefined) {
      try {
        return JSON.parse(JSON.stringify(result))
      } catch {
        return result !== undefined ? result : null
      }
    }
    return null
  } catch (error: any) {
    console.error('[RuleParser.js] 执行失败:', {
      expression: expression.substring(0, 100) + (expression.length > 100 ? '...' : ''),
      error: error.message,
    })
    return null
  }
}

