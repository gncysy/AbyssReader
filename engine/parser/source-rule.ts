// ============================================
// SourceRule — 单个规则对象（对齐 Legado）
// ============================================

import type { RuleMode } from '../types.js'

const EVAL_PATTERN = /@get:\{[^}]+\}|\{\{[\w\W]*?\}\}/gi
const REGEX_PATTERN = /\$\d{1,2}/g

// 对齐 Legado AppPattern.JS_PATTERN
const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi

const GET_RULE_TYPE = -2
const JS_RULE_TYPE = -1
const DEFAULT_RULE_TYPE = 0

type PutMap = Record<string, string>

export class SourceRule {
  rule: string
  mode: RuleMode
  replaceRegex = ''
  replacement = ''
  replaceFirst = false
  putMap: PutMap = {}

  private ruleParam: string[] = []
  private ruleType: number[] = []
  private jsCode: string | null = null
  private prefixRule: string | null = null

  constructor(ruleStr: string, mode: RuleMode = 'default', isJSON = false) {
    const jsMatcher = new RegExp(JS_PATTERN.source, 'i')
    const jsMatch = jsMatcher.exec(ruleStr)
    if (jsMatch && (mode === 'default' || mode === 'js')) {
      this.jsCode = (jsMatch[2] || jsMatch[1] || '').trim()
      const jsIndex = ruleStr.search(/@js:|<js>/i)
      if (jsIndex > 0) {
        this.prefixRule = ruleStr.substring(0, jsIndex).trim()
        // 修复：从原始 ruleStr 中去掉 @js: 部分，
        // 让 CSS 前缀只保留选择器部分
        // 例如：@css:.cover-box .bg img@src@js:result + '...'
        // prefixRule = '@css:.cover-box .bg img@src'
        // rule 应该只保留 CSS 部分，JS 由 jsCode 处理
        ruleStr = this.prefixRule
      }
      if (this.jsCode) {
        mode = 'js'
      }
    }

    if (mode === 'js' || mode === 'regex') {
      this.rule = ruleStr
    } else if (ruleStr.toLowerCase().startsWith('@css:')) {
      mode = 'default'
      this.rule = ruleStr
    } else if (ruleStr.startsWith('@@')) {
      mode = 'default'
      this.rule = ruleStr.substring(2)
    } else if (ruleStr.toLowerCase().startsWith('@xpath:')) {
      mode = 'xpath'
      this.rule = ruleStr.substring(7)
    } else if (ruleStr.toLowerCase().startsWith('@json:')) {
      mode = 'json'
      this.rule = ruleStr.substring(6)
    } else if (isJSON || ruleStr.startsWith('$.') || ruleStr.startsWith('$[')) {
      mode = 'json'
      this.rule = ruleStr
    } else if (ruleStr.startsWith('/')) {
      mode = 'xpath'
      this.rule = ruleStr
    } else {
      this.rule = ruleStr
    }

    this.mode = mode
    this.rule = this.splitPutRule(this.rule, this.putMap)

    let start = 0
    const evalMatcher = new RegExp(EVAL_PATTERN.source, 'gi')

    if (evalMatcher.test(this.rule)) {
      evalMatcher.lastIndex = 0
      const tmp = this.rule.substring(0, this.rule.search(EVAL_PATTERN))
      if (mode !== 'js' && mode !== 'regex' &&
          (evalMatcher.lastIndex === 0 || !tmp.includes('##'))) {
        mode = 'regex'
        this.mode = mode
      }
      let evalMatch: RegExpExecArray | null
      while ((evalMatch = evalMatcher.exec(this.rule)) !== null) {
        if (evalMatch.index > start) {
          this.splitRegex(this.rule.substring(start, evalMatch.index))
        }
        const matched = evalMatch[0]
        if (matched.toLowerCase().startsWith('@get:')) {
          this.ruleType.push(GET_RULE_TYPE)
          const keyMatch = /^@get:\{([^}]+)\}$/i.exec(matched)
          const key = keyMatch && keyMatch[1] !== undefined ? keyMatch[1] : matched.substring(6)
          this.ruleParam.push(key)
        } else if (matched.startsWith('{{')) {
          this.ruleType.push(JS_RULE_TYPE)
          this.ruleParam.push(matched.substring(2, matched.length - 2))
        } else {
          this.splitRegex(matched)
        }
        start = evalMatch.index + evalMatch[0].length
      }
    }

    if (this.rule.length > start) {
      this.splitRegex(this.rule.substring(start))
    }
  }

  cloneForExecution(): SourceRule {
    const clone = Object.create(SourceRule.prototype) as SourceRule
    clone.rule = this.rule
    clone.mode = this.mode
    clone.replaceRegex = this.replaceRegex
    clone.replacement = this.replacement
    clone.replaceFirst = this.replaceFirst
    clone.putMap = this.putMap ? { ...this.putMap } : {}
    ;(clone as unknown as { ruleParam: string[] }).ruleParam = [...this.ruleParam]
    ;(clone as unknown as { ruleType: number[] }).ruleType = [...this.ruleType]
    clone.jsCode = this.jsCode
    clone.prefixRule = this.prefixRule
    return clone
  }

  getJsCode(): string | null {
    return this.jsCode
  }

  getPrefixRule(): string | null {
    return this.prefixRule
  }

  getParamSize(): number {
    return this.ruleParam.length
  }

  private splitPutRule(ruleStr: string, putMap: PutMap): string {
    let result = ruleStr
    const putMatcher = /@put:(\{[^}]+\})/gi
    putMatcher.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = putMatcher.exec(result)) !== null) {
      const matchedText = match[0]
      const matchIndex = match.index
      const jsonStr = match[1]

      result = result.substring(0, matchIndex) + result.substring(matchIndex + matchedText.length)

      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as Record<string, unknown>
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined) {
              putMap[key] = String(value)
            }
          }
        } catch {
          try {
            const parsed = JSON.parse(jsonStr.replace(/'/g, '"')) as Record<string, unknown>
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== null && value !== undefined) {
                putMap[key] = String(value)
              }
            }
          } catch {
            // 非标准 JSON，忽略
          }
        }
      }

      putMatcher.lastIndex = matchIndex
      if (putMatcher.lastIndex === matchIndex) {
        putMatcher.lastIndex++
      }
    }
    return result
  }

  private splitRegex(ruleStr: string): void {
    if (!ruleStr) return
    let start = 0
    const parts = ruleStr.split('##')
    const regexMatcher = new RegExp(REGEX_PATTERN.source, 'g')

    const part0 = parts[0]
    if (part0 !== undefined && regexMatcher.test(part0)) {
      regexMatcher.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regexMatcher.exec(part0)) !== null) {
        if (match.index > start) {
          this.ruleType.push(DEFAULT_RULE_TYPE)
          this.ruleParam.push(part0.substring(start, match.index))
        }
        this.ruleType.push(parseInt(match[0].substring(1)))
        this.ruleParam.push(match[0])
        start = match.index + match[0].length
      }
    }
    if (part0 !== undefined && part0.length > start) {
      this.ruleType.push(DEFAULT_RULE_TYPE)
      this.ruleParam.push(part0.substring(start))
    }
    const part1 = parts[1]
    if (part1 !== undefined) this.replaceRegex = part1
    const part2 = parts[2]
    if (part2 !== undefined) this.replacement = part2
    if (parts.length > 3) this.replaceFirst = true
  }

  async makeUpRule(
    result: unknown,
    evalJS: (js: string, res: unknown) => Promise<unknown>,
    get: (key: string) => string,
    getString: (rule: string) => Promise<string>,
  ): Promise<void> {
    if (this.jsCode && this.prefixRule !== null) {
      try {
        // 修复：this.rule 现在只包含 CSS 部分
        // 执行 JS 后，this.rule = JS 结果
        const jsResult = await evalJS(this.jsCode, result)
        const jsStr = jsResult !== null && jsResult !== undefined ? String(jsResult) : ''
        this.rule = jsStr
        this.mode = 'default'
        return
      } catch {
        this.mode = 'default'
      }
    }

    if (this.ruleParam.length === 0) return

    const infoVal: string[] = []
    let index = this.ruleParam.length
    while (index-- > 0) {
      const regType = this.ruleType[index]
      const param = this.ruleParam[index]
      if (regType === undefined || param === undefined) continue

      if (regType > DEFAULT_RULE_TYPE) {
        if (Array.isArray(result) && result.length > regType) {
          const val = result[regType]
          infoVal.unshift(val !== undefined ? String(val) : '')
        } else {
          infoVal.unshift(param)
        }
      } else if (regType === JS_RULE_TYPE) {
        if (this.isRule(param)) {
          infoVal.unshift(await getString(param))
        } else {
          const jsEval: unknown = await evalJS(param, result)
          if (jsEval !== null && jsEval !== undefined) {
            infoVal.unshift(String(jsEval))
          }
        }
      } else if (regType === GET_RULE_TYPE) {
        infoVal.unshift(get(param))
      } else {
        infoVal.unshift(param)
      }
    }
    this.rule = infoVal.join('')

    const ruleStrS = this.rule.split('##')
    const rule0 = ruleStrS[0]
    if (rule0 !== undefined) this.rule = rule0.trim()
    const rule1 = ruleStrS[1]
    if (rule1 !== undefined) this.replaceRegex = rule1
    const rule2 = ruleStrS[2]
    if (rule2 !== undefined) this.replacement = rule2
    if (ruleStrS.length > 3) this.replaceFirst = true
  }

  private isRule(ruleStr: string): boolean {
    return ruleStr.startsWith('@') ||
      ruleStr.startsWith('$.') ||
      ruleStr.startsWith('$[') ||
      ruleStr.startsWith('//')
  }
}
