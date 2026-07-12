import { parseCss, executeCss, splitRule } from './css.js'
import { parseXPath, executeXPath } from './xpath.js'
import { parseJsonPath, executeJsonPath } from './jsonpath.js'
import { parseJs, executeJs } from './js.js'
import { parseRegex, executeRegex, applyClean } from './regex.js'

export type RuleType = 'css' | 'xpath' | 'json' | 'js' | 'text' | 'regex'

export interface ParsedRule {
  type: RuleType
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

export interface RuleContext {
  source: any
  baseUrl?: string
  variables?: Record<string, any>
  [key: string]: any
}

export function parseRule(rule: string): ParsedRule | null {
  if (!rule || typeof rule !== 'string') return null

  let trimmed = rule.trim()
  let cleanPattern: string | null = null
  let cleanReplacement: string | null = null

  const cleanParts = trimmed.split('##')
  if (cleanParts.length >= 3) {
    const selectorPart = cleanParts.slice(0, cleanParts.length - 2).join('##')
    cleanPattern = cleanParts[cleanParts.length - 2]
    cleanReplacement = cleanParts[cleanParts.length - 1] || ''
    trimmed = selectorPart
  } else if (cleanParts.length === 2) {
    trimmed = cleanParts[0]
    cleanPattern = cleanParts[1]
    cleanReplacement = ''
  }

  let parsed: ParsedRule | null = null

  if (trimmed.startsWith('$')) {
    parsed = parseJsonPath(trimmed)
  } else if (trimmed.startsWith('@xpath:') || trimmed.startsWith('@XPath:')) {
    parsed = parseXPath(trimmed)
  } else if (trimmed.startsWith('@json:')) {
    parsed = parseJsonPath(trimmed.substring(6))
  } else if (trimmed.startsWith('@regex:')) {
    parsed = parseRegex(trimmed)
  } else if (trimmed.startsWith('@js:')) {
    parsed = parseJs(trimmed)
  } else if (trimmed.startsWith('@text:')) {
    let text = trimmed.substring(6)
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1)
    }
    parsed = {
      type: 'text',
      expression: text,
      attribute: null,
      cleanPattern: null,
      cleanReplacement: null,
      flags: null,
      original: rule,
    }
  } else {
    parsed = parseCss(trimmed)
  }

  if (parsed) {
    parsed.cleanPattern = cleanPattern || null
    parsed.cleanReplacement = cleanReplacement || null
    parsed.original = rule
  }

  return parsed
}

export function executeRule(
  source: any,
  parsedRule: ParsedRule,
  context: RuleContext = { source }
): any {
  if (!source || !parsedRule) return null

  const { type, expression, attribute, cleanPattern, cleanReplacement, flags } = parsedRule
  let result: any = null

  switch (type) {
    case 'css':
      result = executeCss(source, expression, attribute || undefined)
      break
    case 'xpath':
      result = executeXPath(source, expression, attribute || undefined)
      break
    case 'json':
      result = executeJsonPath(source, expression)
      break
    case 'regex':
      result = executeRegex(source, expression, flags || undefined)
      break
    case 'js':
      result = executeJs(source, expression, context)
      break
    case 'text':
      result = expression
      break
    default:
      result = null
  }

  if (result !== null && result !== undefined && cleanPattern) {
    result = applyClean(result, cleanPattern, cleanReplacement || '')
  }

  return result
}

/**
 * 解析并执行规则（支持 && / || / %% 分割）
 * 自动跳过引号和括号内的内容
 */
export function parseAndExecute(
  source: any,
  rule: string,
  context: RuleContext = { source }
): any {
  if (!source || !rule) return null

  // 先尝试直接解析
  const parsed = parseRule(rule)
  if (parsed) {
    return executeRule(source, parsed, context)
  }

  // 尝试分割规则（支持 && / || / %%）
  const parts = splitRule(rule, ['&&', '||', '%%'])
  if (parts.length > 1) {
    const results: any[] = []
    for (const part of parts) {
      const p = parseRule(part)
      if (p) {
        const result = executeRule(source, p, context)
        if (result !== null && result !== undefined && result !== '') {
          results.push(result)
        }
      }
    }
    if (results.length === 0) return null
    return results.length === 1 ? results[0] : results
  }

  // 回退到 || 分割
  const fallbackParts = parseFallbackRule(rule)
  for (const part of fallbackParts) {
    const p = parseRule(part)
    if (p) {
      const result = executeRule(source, p, context)
      if (result !== null && result !== undefined && result !== '') {
        return result
      }
    }
  }

  return null
}

export function parseFallbackRule(rule: string): string[] {
  const parts: string[] = []
  let current = ''
  let inString = false
  let stringChar = ''
  let i = 0

  while (i < rule.length) {
    const char = rule[i]
    if (!inString && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
      current += char
    } else if (inString && char === stringChar) {
      inString = false
      stringChar = ''
      current += char
    } else if (!inString && char === '|' && rule[i + 1] === '|') {
      if (current.trim()) {
        parts.push(current.trim())
        current = ''
      }
      i += 2
      continue
    } else {
      current += char
    }
    i++
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

export { splitRule } from './css.js'
