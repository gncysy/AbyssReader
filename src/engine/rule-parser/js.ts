import vm from 'node:vm'
import { buildJavaAPI } from '../platform/java-bridge.js'
import type { ParsedRule, RuleContext } from './index.js'

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

function isDangerous(code: string): boolean {
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) return true
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

  const sandbox: Record<string, any> = {
    source: context.source || source,
    result: context.result || source,
    baseUrl: context.baseUrl || '',
    key: context.key || '',
    page: context.page || 1,
    java: buildJavaAPI(),
    Math,
    JSON,
    Date,
    parseInt,
    parseFloat,
    encodeURI: encodeURIComponent,
    decodeURI: decodeURIComponent,
    trim: (s: any) => String(s).trim(),
    replace: (s: any, p: string, r: string) => String(s).replace(new RegExp(p, 'g'), r),
    split: (s: any, p: string) => String(s).split(p),
    join: (arr: any[], sep?: string) => Array.isArray(arr) ? arr.join(sep || '') : String(arr),
    filter: (arr: any[], fn: any) => Array.isArray(arr) ? arr.filter(fn) : [],
    map: (arr: any[], fn: any) => Array.isArray(arr) ? arr.map(fn) : [],
    reduce: (arr: any[], fn: any, init: any) => Array.isArray(arr) ? arr.reduce(fn, init) : init,
    isString: (v: any) => typeof v === 'string',
    isNumber: (v: any) => typeof v === 'number',
    isArray: (v: any) => Array.isArray(v),
    isObject: (v: any) => typeof v === 'object' && v !== null && !Array.isArray(v),
  }

  for (const [key, value] of Object.entries(context)) {
    if (key in sandbox) continue
    if (value === null || value === undefined ||
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sandbox[key] = value
    }
  }

  try {
    const script = new vm.Script(`(() => { return (${expression}) })()`, { timeout: 1000 } as any)
    const result = script.runInNewContext(sandbox, { timeout: 1000, displayErrors: true })
    if (result !== null && result !== undefined) {
      try { return JSON.parse(JSON.stringify(result)) } catch { return result }
    }
    return null
  } catch (error: any) {
    console.error('[RuleParser.js] 执行失败:', error.message)
    return null
  }
}
