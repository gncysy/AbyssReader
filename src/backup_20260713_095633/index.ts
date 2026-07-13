import { executeCss } from './css.js'
import { executeXPath } from './xpath.js'
import { executeJsonPath } from './jsonpath.js'
import { executeJs } from './js.js'
import { executeRegex } from './regex.js'

export type RuleType = 'css' | 'xpath' | 'json' | 'js' | 'regex' | 'text'

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
  redirectUrl?: string
  variables?: Record<string, any>
  [key: string]: any
}

// ============================================
// 变量存储（@put / @get）
// ============================================

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

// ============================================
// 规则解析
// ============================================

export function parseRule(rule: string): ParsedRule | null {
  if (!rule || typeof rule !== 'string') return null

  let trimmed = rule.trim()
  let cleanPattern: string | null = null
  let cleanReplacement: string | null = null

  // 分离清理规则 ##
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

  // @put: 规则（存储变量）
  if (trimmed.match(/^@put:/i)) {
    const match = trimmed.match(/^@put:\s*\{([^}]+)\}/i)
    if (match) {
      try {
        const pairs = match[1].split(',').map(p => p.trim().split(':'))
        for (const [key, value] of pairs) {
          if (key && value) {
            const parsedValue = parseRule(value.trim())
            if (parsedValue) {
              // 暂存为特殊类型，执行时再取值
              parsed = {
                type: 'text',
                expression: `@put:${key}:${value.trim()}`,
                attribute: null,
                cleanPattern: null,
                cleanReplacement: null,
                flags: null,
                original: rule,
              }
            }
          }
        }
      } catch {}
    }
  }

  // @get: 规则（读取变量）
  if (trimmed.match(/^@get:/i)) {
    const key = trimmed.replace(/^@get:\s*\{?([^}]+)\}?/i, '$1').trim()
    parsed = {
      type: 'text',
      expression: `@get:${key}`,
      attribute: null,
      cleanPattern: null,
      cleanReplacement: null,
      flags: null,
      original: rule,
    }
  }

  // 其他规则类型
  if (!parsed) {
    if (trimmed.startsWith('$')) {
      parsed = { type: 'json', expression: trimmed, attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else if (trimmed.match(/^@xpath:/i)) {
      parsed = { type: 'xpath', expression: trimmed.replace(/^@xpath:/i, ''), attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else if (trimmed.match(/^@json:/i)) {
      parsed = { type: 'json', expression: trimmed.replace(/^@json:/i, ''), attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else if (trimmed.match(/^@js:/i)) {
      parsed = { type: 'js', expression: trimmed.replace(/^@js:/i, ''), attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else if (trimmed.match(/^@regex:/i)) {
      parsed = { type: 'regex', expression: trimmed.replace(/^@regex:/i, ''), attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else if (trimmed.match(/^@text:/i)) {
      let text = trimmed.replace(/^@text:/i, '').trim()
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1)
      }
      parsed = { type: 'text', expression: text, attribute: null, cleanPattern, cleanReplacement, flags: null, original: rule }
    } else {
      // CSS 选择器
      let expression = trimmed
      let attribute: string | null = null
      const attrMatch = expression.match(/^(.+)@([a-zA-Z-]+)$/)
      if (attrMatch) {
        expression = attrMatch[1]
        attribute = attrMatch[2]
      }
      parsed = { type: 'css', expression, attribute, cleanPattern, cleanReplacement, flags: null, original: rule }
    }
  }

  if (parsed) {
    parsed.cleanPattern = cleanPattern || null
    parsed.cleanReplacement = cleanReplacement || null
    parsed.original = rule
  }

  return parsed
}

// ============================================
// 规则执行
// ============================================

export function executeRule(
  source: any,
  parsedRule: ParsedRule,
  context: RuleContext = { source }
): any {
  if (!source || !parsedRule) return null

  const { type, expression, attribute, cleanPattern, cleanReplacement } = parsedRule

  // 处理 @put:
  if (type === 'text' && expression.startsWith('@put:')) {
    const match = expression.match(/^@put:([^:]+):(.+)$/)
    if (match) {
      const key = match[1].trim()
      const ruleStr = match[2].trim()
      const parsed = parseRule(ruleStr)
      if (parsed) {
        const value = executeRule(source, parsed, context)
        putVariable(key, value)
        return value
      }
    }
    return null
  }

  // 处理 @get:
  if (type === 'text' && expression.startsWith('@get:')) {
    const key = expression.replace(/^@get:/, '').trim()
    return getVariable(key)
  }

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
    case 'js':
      result = executeJs(source, expression, context)
      break
    case 'regex':
      result = executeRegex(source, expression)
      break
    case 'text':
      result = expression
      break
    default:
      result = null
  }

  // 应用清理规则
  if (result !== null && result !== undefined && cleanPattern) {
    const regex = new RegExp(cleanPattern, 'g')
    const replacement = cleanReplacement || ''
    if (typeof result === 'string') {
      result = result.replace(regex, replacement)
    } else if (Array.isArray(result)) {
      result = result.map(item => typeof item === 'string' ? item.replace(regex, replacement) : item)
    }
  }

  return result
}

// ============================================
// 管道执行（支持 ||、&&、%% 组合）
// ============================================

export function parseAndExecute(
  source: any,
  rule: string,
  context: RuleContext = { source }
): any {
  if (!source || !rule) return null

  // 拆分组合规则：||、&&、%%
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

  if (parts.length === 1) {
    // 单规则
    const parsed = parseRule(parts[0])
    if (parsed) {
      return executeRule(source, parsed, context)
    }
    return null
  }

  // 多规则组合执行
  const results: any[] = []
  for (const part of parts) {
    const parsed = parseRule(part)
    if (parsed) {
      const result = executeRule(source, parsed, context)
      results.push(result)
    } else {
      results.push(null)
    }
  }

  const validResults = results.filter(r => r !== null && r !== undefined && r !== '')

  switch (usedCombinator) {
    case '||':
      // 或：返回第一个有效结果
      return validResults.length > 0 ? validResults[0] : null

    case '&&':
      // 与：合并所有结果
      if (validResults.length === 0) return null
      if (validResults.length === 1) return validResults[0]
      // 合并为字符串数组
      const merged: string[] = []
      for (const r of validResults) {
        if (typeof r === 'string') {
          merged.push(r)
        } else if (Array.isArray(r)) {
          merged.push(...r.map(item => String(item)))
        } else {
          merged.push(String(r))
        }
      }
      return merged

    case '%%':
      // 矩阵合并：按索引对齐
      if (validResults.length === 0) return null
      const matrixResults = validResults.map(r => Array.isArray(r) ? r : [r])
      const maxLen = Math.max(...matrixResults.map(arr => arr.length))
      const matrixMerged: string[] = []
      for (let i = 0; i < maxLen; i++) {
        for (const arr of matrixResults) {
          if (i < arr.length) {
            matrixMerged.push(String(arr[i]))
          }
        }
      }
      return matrixMerged

    default:
      return validResults.length > 0 ? validResults[0] : null
  }
}

// 兼容旧接口
export function parseFallbackRule(rule: string): string[] {
  return rule.split(/\s*\|\|\s*/).filter(s => s.trim())
}
