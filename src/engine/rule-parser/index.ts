/**
 * 规则解析引擎 - 对标 Legado AnalyzeRule.kt
 * 支持：@XPath、@Json、@CSS、@Js、@Regex、@put、@get、{{}}、##、||、&&、%%
 */

import { executeCss } from './css.js'
import { executeXPath } from './xpath.js'
import { executeJsonPath } from './jsonpath.js'
import { executeJs } from './js.js'
import { executeRegex } from './regex.js'

export type RuleMode = 'xpath' | 'json' | 'css' | 'js' | 'regex' | 'text'

export interface ParsedRule {
  type: RuleMode
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

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
  baseUrl?: string
  redirectUrl?: string
  book?: any
  chapter?: any
  result?: any
  src?: any
  key?: string
  page?: number
  nextChapterUrl?: string
  variables?: Record<string, any>
  [key: string]: any
}

const variableStore = new Map<string, any>()

export function putVariable(key: string, value: any): void {
  variableStore.set(key, value)
}

export function getVariable(key: string): any {
  return variableStore.get(key)
}

export function clearVariables(): void {
  variableStore.clear()
}

const PUT_PATTERN = /@put:\s*\{([^}]+?)\}/gi
const GET_PATTERN = /@get:\s*\{([^}]+?)\}/gi

export function parseRule(ruleStr: string, context: RuleContext = { source: null }): SourceRule[] {
  if (!ruleStr || typeof ruleStr !== 'string') return []
  
  const rules: SourceRule[] = []
  let mode: RuleMode = 'css'
  let start = 0
  const trimmed = ruleStr.trim()
  
  if (trimmed.startsWith('$.')) { mode = 'json' }
  else if (trimmed.match(/^@XPath:/i)) { mode = 'xpath'; start = 7 }
  else if (trimmed.match(/^@Json:/i)) { mode = 'json'; start = 6 }
  else if (trimmed.match(/^@CSS:/i)) { mode = 'css'; start = 5 }
  else if (trimmed.match(/^@Js:/i)) { mode = 'js'; start = 4 }
  else if (trimmed.match(/^@Regex:/i)) { mode = 'regex'; start = 7 }
  else if (trimmed.match(/^@text:/i)) { mode = 'text'; start = 6 }
  
  let rule = start > 0 ? ruleStr.substring(start).trim() : ruleStr
  const putMap: Record<string, string> = {}
  
  rule = rule.replace(PUT_PATTERN, (match, content) => {
    try {
      const pairs = content.split(',').map((p: string) => p.trim().split(':'))
      for (const [key, value] of pairs) {
        if (key && value) { putMap[key.trim()] = value.trim(); putVariable(key.trim(), value.trim()) }
      }
    } catch (e) {}
    return ''
  })
  
  rule = rule.replace(GET_PATTERN, (match, key) => {
    const value = getVariable(key.trim())
    return value !== undefined && value !== null ? String(value) : ''
  })
  
  let replaceRegex = '', replacement = '', replaceFirst = false
  const cleanParts = rule.split('##')
  if (cleanParts.length >= 2) {
    rule = cleanParts[0].trim()
    replaceRegex = cleanParts[1].trim()
    if (cleanParts.length >= 3) replacement = cleanParts[2] || ''
    if (cleanParts.length >= 4) replaceFirst = true
  }
  
  // 处理 {{}} 模板
  const evalMatches = rule.match(/\{\{[\s\S]*?\}\}/g)
  if (evalMatches) {
    for (const match of evalMatches) {
      const jsContent = match.match(/\{\{([\s\S]*?)\}\}/)
      if (jsContent) {
        try {
          const result = executeJs(context.source || {}, jsContent[1].trim(), context)
          rule = rule.replace(match, result !== null && result !== undefined ? String(result) : '')
        } catch (e) { rule = rule.replace(match, '') }
      }
    }
  }
  
  rule = rule.replace(/@js:\s*([\s\S]*?)(?=\s*(?:@\w+:|$))/gi, (match, code) => {
    try {
      const result = executeJs(context.source || {}, code.trim(), context)
      return result !== null && result !== undefined ? String(result) : ''
    } catch (e) { return '' }
  })
  
  rules.push({ mode, rule: rule.trim() || rule, replaceRegex, replacement, replaceFirst, putMap: Object.keys(putMap).length > 0 ? putMap : undefined })
  return rules
}

export function executeRule(source: any, rule: string, context: RuleContext = { source: null }): string {
  if (!rule) return ''
  const rules = parseRule(rule, context)
  if (rules.length === 0) return ''
  let result: any = source
  
  for (const sourceRule of rules) {
    if (result === null || result === undefined) break
    const ruleStr = sourceRule.rule
    if (!ruleStr) continue
    
    if (sourceRule.replaceRegex) {
      const regex = new RegExp(sourceRule.replaceRegex, 'g')
      const repl = sourceRule.replacement || ''
      if (typeof result === 'string') {
        result = sourceRule.replaceFirst ? result.replace(regex, repl) : result.replace(regex, repl)
      } else if (Array.isArray(result)) {
        result = result.map(item => typeof item === 'string' ? (sourceRule.replaceFirst ? item.replace(regex, repl) : item.replace(regex, repl)) : item)
      }
      continue
    }
    
    switch (sourceRule.mode) {
      case 'xpath': result = executeXPath(result, ruleStr); break
      case 'json': result = executeJsonPath(result, ruleStr); break
      case 'js': result = executeJs(result, ruleStr, context); break
      case 'regex': result = executeRegex(result, ruleStr); break
      case 'text': result = ruleStr; break
      default: result = executeCss(result, ruleStr); break
    }
  }
  
  if (result === null || result === undefined) return ''
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return result.filter(item => item !== null && item !== undefined).join('\n')
  return String(result)
}

export function executeRuleList(source: any, rule: string, context: RuleContext = { source: null }): string[] {
  if (!rule) return []
  const result = executeRule(source, rule, context)
  if (!result) return []
  if (Array.isArray(result)) return result.map(item => String(item)).filter(s => s)
  if (typeof result === 'string') return result.split('\n').map(s => s.trim()).filter(s => s)
  return [String(result)].filter(s => s)
}

export function executeRuleElements(source: any, rule: string, context: RuleContext = { source: null }): any[] {
  if (!rule) return []
  const result = executeRule(source, rule, context)
  if (!result) return []
  if (Array.isArray(result)) return result
  return [result]
}

export function parseAndExecute(source: any, rule: string, context: RuleContext = { source: null }): any {
  if (!source || !rule) return null
  
  const combinators = ['||', '&&', '%%']
  let usedCombinator: string | null = null
  let parts: string[] = [rule]
  
  for (const comb of combinators) {
    if (rule.includes(comb)) {
      usedCombinator = comb
      parts = rule.split(comb).map(s => s.trim())
      break
    }
  }
  
  if (parts.length === 1) return executeRule(source, parts[0], context)
  
  const results: any[] = []
  for (const part of parts) results.push(executeRule(source, part, context))
  const validResults = results.filter(r => r !== null && r !== undefined && r !== '')
  
  switch (usedCombinator) {
    case '||': return validResults.length > 0 ? validResults[0] : null
    case '&&': {
      if (validResults.length === 0) return null
      if (validResults.length === 1) return validResults[0]
      const merged: string[] = []
      for (const r of validResults) {
        if (Array.isArray(r)) merged.push(...r.map(item => String(item)))
        else merged.push(String(r))
      }
      return merged
    }
    case '%%': {
      if (validResults.length === 0) return null
      const matrixResults = validResults.map(r => Array.isArray(r) ? r : [r])
      const maxLen = Math.max(...matrixResults.map(arr => arr.length))
      const merged: string[] = []
      for (let i = 0; i < maxLen; i++) {
        for (const arr of matrixResults) {
          if (i < arr.length) merged.push(String(arr[i]))
        }
      }
      return merged
    }
    default: return validResults.length > 0 ? validResults[0] : null
  }
}

export function parseFallbackRule(rule: string): string[] {
  return rule.split(/\s*\|\|\s*/).filter(s => s.trim())
}
