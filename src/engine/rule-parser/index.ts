import { executeCss, parseCss } from './css.js'
import { executeXPath } from './xpath.js'
import { executeJsonPath } from './jsonpath.js'
import { executeJs } from './js.js'
import { putContext, getContext } from '../context/shared.js'

export type RuleMode = 'css' | 'json' | 'xpath' | 'js' | 'regex'

export interface SourceRule {
  mode: RuleMode
  rule: string
  replaceRegex?: string
  replacement?: string
  replaceFirst?: boolean
  putMap?: Record<string, string>
}

export interface RuleContext {
  source?: any
  book?: any
  chapter?: any
  result?: any
  baseUrl?: string
  nextChapterUrl?: string
  page?: number
  key?: string
  isUrl?: boolean
  coroutineContext?: any
  [key: string]: any
}

const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:\s*([^\s,{]+)/gi

function isJsonContent(content: any): boolean {
  if (content && typeof content === 'object' && content.type === 'tag') return false
  if (typeof content === 'object' && content !== null) return true
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  }
  return false
}

/**
 * 分离 @put:{} 规则，返回清理后的规则和 putMap
 */
function extractPutRule(ruleStr: string): { cleanedRule: string; putMap: Record<string, string> } {
  const putMap: Record<string, string> = {}
  let cleanedRule = ruleStr
  const putPattern = /@put:\s*\{([^}]+)\}/gi

  cleanedRule = cleanedRule.replace(putPattern, (_m: string, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr)
      Object.assign(putMap, parsed)
    } catch {
      // 兼容单引号和非标准格式
      const pairs = jsonStr.replace(/'/g, '"').split(',').map(s => s.trim())
      for (const pair of pairs) {
        const colonIdx = pair.indexOf(':')
        if (colonIdx > 0) {
          const k = pair.substring(0, colonIdx).trim().replace(/["']/g, '')
          let v = pair.substring(colonIdx + 1).trim().replace(/["']/g, '')
          // 去掉可能的尾部逗号
          v = v.replace(/,$/, '')
          putMap[k] = v
        }
      }
    }
    return ''
  })

  return { cleanedRule, putMap }
}

const ruleCache = new Map<string, SourceRule[]>()
const STRING_RULE_CACHE_MAX = 64

/**
 * 拆分为规则列表（对应 legado splitSourceRule）
 * 按 @js: 和 <js></js> 分段，每段可能包含 ##替换规则
 */
export function parseRule(ruleStr: string, isJson: boolean = false): SourceRule[] {
  if (!ruleStr) return []

  const rules: SourceRule[] = []

  // 先提取所有 @put
  const { cleanedRule, putMap } = extractPutRule(ruleStr)
  let remaining = cleanedRule.trim()
  if (!remaining) return rules

  // 判断默认模式
  let defaultMode: RuleMode = isJson ? 'json' : 'css'

  // 检查规则字符串级别的前缀
  if (remaining.startsWith('$.')) { defaultMode = 'json' }
  else if (remaining.startsWith('/')) { defaultMode = 'xpath' }
  else if (remaining.toLowerCase().startsWith('@xpath:')) { defaultMode = 'xpath'; remaining = remaining.substring(7) }
  else if (remaining.toLowerCase().startsWith('@json:')) { defaultMode = 'json'; remaining = remaining.substring(6) }
  else if (remaining.toLowerCase().startsWith('@css:')) { defaultMode = 'css'; remaining = remaining.substring(5) }
  else if (remaining.startsWith('@@')) { defaultMode = 'css'; remaining = remaining.substring(2) }

  // 按 @js: 和 <js> 分段
  let start = 0
  let mode: RuleMode = defaultMode
  const jsRe = new RegExp(JS_PATTERN.source, 'gi')
  let jsMatch: RegExpExecArray | null

  while ((jsMatch = jsRe.exec(remaining)) !== null) {
    if (jsMatch.index > start) {
      let tmp = remaining.substring(start, jsMatch.index).trim()
      if (tmp) {
        const subRules = splitRuleByHash(tmp, mode, putMap)
        rules.push(...subRules)
      }
    }
    const jsCode = jsMatch[2] || jsMatch[1]
    rules.push({
      mode: 'js',
      rule: jsCode.trim(),
      putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined,
    })
    start = jsRe.lastIndex
  }

  if (remaining.length > start) {
    let tmp = remaining.substring(start).trim()
    if (tmp) {
      const subRules = splitRuleByHash(tmp, mode, putMap)
      rules.push(...subRules)
    }
  }

  if (rules.length === 0 && Object.keys(putMap).length > 0) {
    // 只有 putMap 没有规则
    rules.push({ mode: defaultMode, rule: '', putMap: { ...putMap } })
  }

  return rules
}

/**
 * 拆分 ##替换规则
 */
function splitRuleByHash(
  ruleFragment: string,
  mode: RuleMode,
  putMap: Record<string, string>
): SourceRule[] {
  const rules: SourceRule[] = []

  if (!ruleFragment.includes('##')) {
    rules.push({
      mode,
      rule: ruleFragment.trim(),
      putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined,
    })
    return rules
  }

  const parts = ruleFragment.split('##')
  const mainRule = parts[0].trim()
  let replaceRegex = ''
  let replacement = ''
  let replaceFirst = false

  if (parts.length > 1) replaceRegex = parts[1]
  if (parts.length > 2) replacement = parts[2]
  if (parts.length > 3) replaceFirst = true

  rules.push({
    mode,
    rule: mainRule,
    replaceRegex: replaceRegex || undefined,
    replacement: replacement || undefined,
    replaceFirst: replaceFirst || undefined,
    putMap: Object.keys(putMap).length > 0 ? { ...putMap } : undefined,
  })

  return rules
}

/**
 * 获取缓存的规则列表（对应 legado splitSourceRuleCacheString）
 */
function getCachedRules(ruleStr: string, isJson: boolean): SourceRule[] {
  let rules = ruleCache.get(ruleStr)
  if (!rules) {
    rules = parseRule(ruleStr, isJson)
    if (ruleCache.size >= STRING_RULE_CACHE_MAX) {
      // 简单淘汰：删第一个
      const firstKey = ruleCache.keys().next().value
      if (firstKey) ruleCache.delete(firstKey)
    }
    ruleCache.set(ruleStr, rules)
  }
  return rules
}

/**
 * 执行 putMap，将变量存入上下文
 */
function executePut(putMap: Record<string, string> | undefined, context: RuleContext, data: any): void {
  if (!putMap) return
  const sourceKey = context.source?.bookSourceUrl || context.source?.url || 'default'
  for (const [key, value] of Object.entries(putMap)) {
    // 值本身可能是规则，需要解析
    const resolvedValue = resolveValue(value, context, data)
    putContext(sourceKey, key, resolvedValue)
  }
}

/**
 * 解析值中的 {{}} 和 @get:{} 引用
 */
function resolveValue(value: string, context: RuleContext, lastResult: any): string {
  if (typeof value !== 'string') return String(value)

  let result = value

  // @get:{key}
  result = result.replace(/@get:\{([^}]+)\}/gi, (_m: string, key: string) => {
    const k = key.trim()
    const sourceKey = context.source?.bookSourceUrl || context.source?.url || 'default'
    return getContext(sourceKey, k) || ''
  })

  // {{expression}}
  result = result.replace(/\{\{([^}]+)\}\}/g, (_m: string, expr: string) => {
    const trimmed = expr.trim()
    // 捕获组引用 $1 $2
    if (/^\$\d+$/.test(trimmed) && Array.isArray(lastResult)) {
      const idx = parseInt(trimmed.substring(1), 10)
      if (idx < lastResult.length) return String(lastResult[idx] || '')
    }
    // 变量名
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      const k = trimmed
      if (lastResult !== null && lastResult !== undefined && typeof lastResult === 'object' && !Array.isArray(lastResult) && k in lastResult) {
        return String(lastResult[k])
      }
      if (context[k] !== undefined) return String(context[k])
      if (context.source?.[k] !== undefined) return String(context.source[k])
      if (context.book?.[k] !== undefined) return String(context.book[k])
      if (context.chapter?.[k] !== undefined) return String(context.chapter[k])
      const sourceKey = context.source?.bookSourceUrl || context.source?.url || 'default'
      const cached = getContext(sourceKey, k)
      if (cached) return String(cached)
      return ''
    }
    // JS 表达式
    try {
      const fn = new Function(
        'result', 'src', 'book', 'source', 'chapter', 'baseUrl', 'page', 'key',
        `return (${trimmed})`
      )
      const val = fn(lastResult, context.src, context.book, context.source, context.chapter, context.baseUrl, context.page, context.key)
      if (val === undefined || val === null) return ''
      return String(val)
    } catch { return '' }
  })

  return result
}

/**
 * 执行正则替换
 */
function applyReplaceRegex(result: string, pattern: string, replacement: string, replaceFirst?: boolean): string {
  if (!pattern || typeof result !== 'string') return result
  try {
    if (replaceFirst) {
      return result.replace(new RegExp(pattern), replacement)
    }
    return result.replace(new RegExp(pattern, 'g'), replacement)
  } catch { return result }
}

/**
 * 执行单条规则
 */
function executeSingleRule(
  data: any,
  sourceRule: SourceRule,
  context: RuleContext,
  lastResult: any
): any {
  const { mode, rule: rawRule, replaceRegex, replacement, replaceFirst, putMap } = sourceRule

  // 执行 putMap
  executePut(putMap, context, lastResult)

  // 解析规则中的变量引用
  const resolvedRule = rawRule ? resolveValue(rawRule, context, lastResult) : ''

  // 空规则 → 返回上次结果
  if (!resolvedRule) {
    if (replaceRegex !== undefined && lastResult !== null && lastResult !== undefined) {
      if (typeof lastResult === 'string') {
        return applyReplaceRegex(lastResult, replaceRegex, replacement || '', replaceFirst)
      }
    }
    return lastResult
  }

  // 处理 || 备选规则
  if (resolvedRule.includes('||')) {
    const options = resolvedRule.split('||').map(s => s.trim())
    for (const option of options) {
      const val = executeSingleRule(data, { mode, rule: option, replaceRegex, replacement, replaceFirst }, context, lastResult)
      if (val !== null && val !== undefined && val !== '' &&
        !(Array.isArray(val) && val.length === 0)) {
        return val
      }
    }
    return null
  }

  // 处理 && 合并规则
  if (resolvedRule.includes('&&') && !resolvedRule.startsWith('@CSS:')) {
    const parts = resolvedRule.split('&&').map(s => s.trim())
    const results: string[] = []
    for (const part of parts) {
      const val = executeSingleRule(data, { mode, rule: part }, context, lastResult)
      if (val !== null && val !== undefined && val !== '') {
        if (Array.isArray(val)) results.push(...val.map(v => String(v)))
        else results.push(String(val))
      }
    }
    let finalResult: any = results.length > 0 ? results.join(',') : null
    if (replaceRegex !== undefined && finalResult !== null) {
      finalResult = applyReplaceRegex(String(finalResult), replaceRegex, replacement || '', replaceFirst)
    }
    return finalResult
  }

  const input = lastResult !== undefined ? lastResult : data
  let stepResult: any

  switch (mode) {
    case 'js':
      stepResult = executeJs(input, resolvedRule, {
        ...context,
        result: input,
        src: data,
        nextChapterUrl: context.nextChapterUrl || undefined,
      })
      break
    case 'json':
      stepResult = executeJsonPath(input, resolvedRule)
      break
    case 'xpath':
      stepResult = executeXPath(input, resolvedRule)
      break
    case 'css':
    default: {
      const cssRule = parseCss(resolvedRule)
      stepResult = executeCss(input, cssRule.expression, cssRule.attribute || undefined)
      break
    }
  }

  // 应用替换
  if (replaceRegex !== undefined && stepResult !== null && stepResult !== undefined) {
    if (typeof stepResult === 'string') {
      stepResult = applyReplaceRegex(stepResult, replaceRegex, replacement || '', replaceFirst)
    } else if (Array.isArray(stepResult)) {
      stepResult = stepResult.map((item: any) =>
        typeof item === 'string'
          ? applyReplaceRegex(item, replaceRegex, replacement || '', replaceFirst)
          : item !== null && item !== undefined
            ? applyReplaceRegex(String(item), replaceRegex, replacement || '', replaceFirst)
            : item
      )
    } else if (stepResult !== null && stepResult !== undefined) {
      stepResult = applyReplaceRegex(String(stepResult), replaceRegex, replacement || '', replaceFirst)
    }
  }

  return stepResult
}

/**
 * 获取单个字符串结果（对应 legado getString）
 */
export function getString(data: any, rule: string, context: RuleContext = {}): string {
  if (!rule || rule === 'null' || rule === 'undefined') return ''

  const isJson = isJsonContent(data)
  const parsedData = isJson && typeof data === 'string'
    ? (() => { try { return JSON.parse(data) } catch { return data } })()
    : data

  const rules = getCachedRules(rule, isJson)
  if (rules.length === 0) return ''

  let result: any = parsedData

  // 如果数据是 NativeObject（JS 执行结果），特殊处理
  if (result && typeof result === 'object' && !Array.isArray(result) && rules.length === 1) {
    const sourceRule = rules[0]
    executePut(sourceRule.putMap, context, result)
    const resolvedRule = sourceRule.rule ? resolveValue(sourceRule.rule, context, result) : ''
    if (resolvedRule && resolvedRule in result) {
      result = result[resolvedRule]
      if (sourceRule.replaceRegex !== undefined && typeof result === 'string') {
        result = applyReplaceRegex(result, sourceRule.replaceRegex, sourceRule.replacement || '', sourceRule.replaceFirst)
      }
      return result !== null && result !== undefined ? String(result) : ''
    }
  }

  for (const sourceRule of rules) {
    const stepResult = executeSingleRule(parsedData, sourceRule, context, result)
    if (stepResult === null || stepResult === undefined) return ''
    result = stepResult
  }

  let finalResult: string
  if (typeof result === 'string') finalResult = result
  else if (Array.isArray(result) && result.length > 0) finalResult = String(result[0])
  else if (result !== null && result !== undefined) finalResult = String(result)
  else return ''

  // HTML 实体解码
  if (finalResult.indexOf('&') > -1) {
    finalResult = finalResult
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  }

  // URL 处理
  if (context.isUrl && finalResult) {
    const base = context.baseUrl || context.source?.url || ''
    if (base && !finalResult.startsWith('http')) {
      if (finalResult.startsWith('/')) {
        try { const u = new URL(base); finalResult = u.origin + finalResult } catch {}
      } else {
        finalResult = base.replace(/\/+$/, '') + '/' + finalResult.replace(/^\/+/, '')
      }
    }
  }

  return finalResult
}

/**
 * 获取元素列表（对应 legado getElements）
 */
export function getElements(data: any, rule: string, context: RuleContext = {}): any[] {
  if (!rule) return []

  const isJson = isJsonContent(data)
  const parsedData = isJson && typeof data === 'string'
    ? (() => { try { return JSON.parse(data) } catch { return data } })()
    : data

  const rules = getCachedRules(rule, isJson)
  if (rules.length === 0) return []

  let result: any = parsedData

  for (const sourceRule of rules) {
    const stepResult = executeSingleRule(parsedData, sourceRule, context, result)
    if (stepResult === null || stepResult === undefined) return []
    result = stepResult
  }

  if (Array.isArray(result)) return result
  return [result]
}

/**
 * 获取元素（对应 legado getElement）
 */
export function getElement(data: any, rule: string, context: RuleContext = {}): any {
  const elements = getElements(data, rule, context)
  return elements.length > 0 ? elements[0] : null
}

export function executeRule(data: any, rule: string, context: RuleContext = {}): any {
  return getString(data, rule, context)
}

export function executeRuleList(data: any, rule: string, context: RuleContext = {}): string[] {
  if (!rule) return []
  const result = getElements(data, rule, context)
  return result.map((item: any) => typeof item === 'string' ? item : String(item))
}

export function executeRuleElements(data: any, rule: string, context: RuleContext = {}): any[] {
  return getElements(data, rule, context)
}

export function parseAndExecute(data: any, rule: string, context: RuleContext = {}): any {
  if (data === undefined || !rule) return null
  return getString(data, rule, context)
}

export function parseFallbackRule(data: any, rule: string, fallback: string, context: RuleContext = {}): any {
  const result = parseAndExecute(data, rule, context)
  if (result !== null && result !== undefined && result !== '') return result
  return parseAndExecute(data, fallback, context)
}
