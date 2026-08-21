// ============================================
// RuleExecutor — 规则执行核心逻辑（对齐 Legado AnalyzeRule）
// ============================================

import { getResultList, getElementsRecursive } from './dom/css.js'
import { SourceRule } from './source-rule.js'
import { RuleAnalyzer } from './rule-analyzer.js'
import { getJsRuntime } from './js-executor.js'
import { RuleCache } from './rule-cache.js'
import { RuleParser } from './rule-parser.js'
import { toDomNode } from './dom/to-dom-node.js'
import type { ParseContext, EngineBookSource } from '../types.js'

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&ensp;': '\u2002', '&emsp;': '\u2003',
  '&thinsp;': '\u2009', '&zwnj;': '\u200C', '&zwj;': '\u200D',
}

function unescapeHtmlEntities(str: string): string {
  let result = str
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char)
  }
  result = result.replace(/&#(\d+);/g, (_, code) => {
    try { return String.fromCodePoint(parseInt(code, 10)) } catch { return _ }
  })
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    try { return String.fromCodePoint(parseInt(code, 16)) } catch { return _ }
  })
  return result
}

type WebJsExecutor = (html: string, jsCode: string, baseUrl: string) => Promise<string>

export class RuleExecutor {
  private cache: RuleCache
  private parser: RuleParser
  private content: unknown
  private baseUrl: string | null = null
  private redirectUrl: string | null = null
  private source: EngineBookSource | null = null
  private lastContext: ParseContext | null = null
  private variableProvider: (key: string) => string
  private variableSetter: (key: string, value: string) => void
  private webJsExecutor: WebJsExecutor | null = null

  constructor(source?: EngineBookSource | null, cache?: RuleCache) {
    this.source = source || null
    this.cache = cache || new RuleCache()
    this.parser = new RuleParser()
    this.variableProvider = (key: string) => this.cache.getVariable(key)
    this.variableSetter = (key: string, value: string) => this.cache.putVariable(key, value)
  }

  setWebJsExecutor(executor: WebJsExecutor): void {
    this.webJsExecutor = executor
  }

  setContent(content: unknown, baseUrl?: string): void {
    this.content = content
    if (baseUrl) this.baseUrl = baseUrl

    let isJSON = false
    if (typeof content === 'string') {
      isJSON = this.parser.isJsonString(content)
    }
    this.parser.isJSON = isJSON
    this.cache.clearAll()
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  setRedirectUrl(url: string): void {
    this.redirectUrl = url
  }

  setVariableProvider(provider: (key: string) => string): void {
    this.variableProvider = provider
  }

  setVariableSetter(setter: (key: string, value: string) => void): void {
    this.variableSetter = setter
  }

  async getString(ruleStr: string | null, context?: ParseContext): Promise<string> {
    if (!ruleStr) return ''
    this.lastContext = context || null
    const ruleList = this.parser.splitSourceRuleCacheString(ruleStr, this.cache.getRuleCache())
    return this.getStringInternal(ruleList, context, context?.isUrl === true)
  }

  async getStringList(ruleStr: string | null, context?: ParseContext): Promise<string[]> {
    if (!ruleStr) return []
    this.lastContext = context || null
    const ruleList = this.parser.splitSourceRuleCacheString(ruleStr, this.cache.getRuleCache())
    return (await this.getStringListInternal(ruleList, context)) || []
  }

  async getElements(ruleStr: string | null, context?: ParseContext): Promise<unknown[]> {
    if (!ruleStr) return []
    this.lastContext = context || null
    const ruleList = this.parser.splitSourceRule(ruleStr, true)
    return this.getElementsInternal(ruleList, context)
  }

  async getElement(ruleStr: string | null, context?: ParseContext): Promise<unknown | null> {
    const list = await this.getElements(ruleStr, context)
    return list.length > 0 ? list[0] : null
  }

  private async getStringInternal(
    ruleList: SourceRule[],
    context?: ParseContext,
    isUrl = false,
  ): Promise<string> {
    let result: unknown = context?.result ?? this.content

    for (const sr of ruleList) {
      this.putRuleMap(sr.putMap)
      await sr.makeUpRule(
        result,
        (js, res) => this.evalJS(js, res, context),
        (k) => this.variableProvider(k),
        (r) => this.getString(r, context),
      )
      if (result === null || result === undefined) continue
      if (sr.rule || sr.replaceRegex) {
        result = await this.executeRuleForString(sr.rule, result, sr.mode, context, isUrl)
      }
      if (result !== null && sr.replaceRegex) {
        result = this.replaceRegex(String(result), sr)
      }
    }
    if (result === null || result === undefined) return ''
    let str = String(result)
    if (str.indexOf('&') > -1) str = unescapeHtmlEntities(str)
    if (isUrl) return str ? this.resolveUrl(str) : (this.baseUrl || '')
    return str
  }

  private putRuleMap(map: Record<string, string>): void {
    for (const [key, value] of Object.entries(map)) {
      this.variableSetter(key, value)
    }
  }

  private async executeRuleForString(
    rule: string,
    input: unknown,
    mode: string,
    context?: ParseContext,
    isUrl = false,
  ): Promise<unknown> {
    if (!rule) return input
    switch (mode) {
      case 'webjs':
        return this.getWebJsResultAsync(rule)
      case 'js':
        return this.evalJS(rule, input, context)
      case 'json':
        return this.cache.getJSONPathAnalyzer(input).getString(rule)
      case 'xpath':
        return this.cache.getXPathAnalyzer(input).getString(rule)
      case 'regex':
        return rule
      default:
        return this.executeDefaultForString(rule, input, isUrl)
    }
  }

  private executeDefaultForString(rule: string, input: unknown, isUrl = false): string {
    const root = toDomNode(input)
    if (!root) return ''

    const isCss = rule.toLowerCase().startsWith('@css:')
    const elementsRule = isCss ? rule.substring(5).trim() : rule
    if (!elementsRule) return root.textContent || ''

    const ruleAnalyzer = new RuleAnalyzer(elementsRule)
    const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')
    const results: string[][] = []

    for (const rs of ruleStrS) {
      if (!rs || !rs.trim()) continue
      let temp: string[] | null
      if (isCss) {
        temp = this.executeCssString(root, rs)
      } else {
        temp = getResultList(root, rs)
      }
      if (temp && temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      } else {
        results.push([])
      }
    }
    if (results.length === 0) return ''

    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []
      const baseLen = Math.max(...results.map((r) => r.length), 0)
      for (let i = 0; i < baseLen; i++) {
        for (const r of results) {
          const val = r[i]
          merged.push(val !== undefined ? val : '')
        }
      }
      return isUrl ? (merged[0] || '') : merged.join('\n')
    }
    const merged = ([] as string[]).concat(...results)
    if (isUrl) return merged.length > 0 ? (merged[0] || '') : ''
    if (merged.length === 1) return merged[0] || ''
    return merged.join('\n')
  }

  private executeCssString(root: unknown, rs: string): string[] | null {
    const cssAnalyzer = this.cache.getCSSAnalyzer(root)
    const lastIndex = rs.lastIndexOf('@')
    if (lastIndex > 0) {
      const list = cssAnalyzer.getStringList(rs)
      // 修复：@属性提取只取第一个结果（避免多个匹配元素导致多行）
      if (list && list.length > 0) {
        const first = list[0]
        return first !== undefined ? [first] : null
      }
      return null
    }
    return [cssAnalyzer.getString(rs)]
  }

  private async getStringListInternal(
    ruleList: SourceRule[],
    context?: ParseContext,
    isUrl = false,
  ): Promise<string[] | null> {
    let result: unknown = context?.result ?? this.content
    for (const sr of ruleList) {
      this.putRuleMap(sr.putMap)
      await sr.makeUpRule(
        result,
        (js, res) => this.evalJS(js, res, context),
        (k) => this.variableProvider(k),
        (r) => this.getString(r, context),
      )
      if (result === null || result === undefined) continue
      result = await this.executeRuleForStringList(result, sr, context)
      if (result !== null && sr.replaceRegex) {
        if (Array.isArray(result)) {
          result = result.map((v: unknown) => this.replaceRegex(String(v), sr))
        } else {
          result = this.replaceRegex(String(result), sr)
        }
      }
    }
    if (result === null || result === undefined) return null
    if (typeof result === 'string') return result.split('\n').filter(Boolean)
    if (Array.isArray(result)) {
      if (isUrl) {
        const urlList: string[] = []
        for (const u of result) {
          const abs = this.resolveUrl(String(u))
          if (abs && !urlList.includes(abs)) urlList.push(abs)
        }
        return urlList
      }
      return result.map((v) => String(v)).filter(Boolean)
    }
    return [String(result)]
  }

  private async executeRuleForStringList(input: unknown, sr: SourceRule, context?: ParseContext): Promise<unknown> {
    if (!sr.rule) return input
    switch (sr.mode) {
      case 'webjs': return this.getWebJsResultAsync(sr.rule)
      case 'js': return this.evalJS(sr.rule, input, context)
      case 'json': return this.cache.getJSONPathAnalyzer(input).getStringList(sr.rule)
      case 'xpath': return this.cache.getXPathAnalyzer(input).getStringList(sr.rule)
      case 'regex': return [sr.rule]
      default: return this.executeDefaultForStringList(sr.rule, input)
    }
  }

  private executeDefaultForStringList(rule: string, input: unknown): string[] | null {
    const root = toDomNode(input)
    if (!root) return null

    const isCss = rule.toLowerCase().startsWith('@css:')
    const elementsRule = isCss ? rule.substring(5).trim() : rule
    if (!elementsRule) return [root.textContent || '']

    const ruleAnalyzer = new RuleAnalyzer(elementsRule)
    const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')
    const results: string[][] = []

    for (const rs of ruleStrS) {
      if (!rs || !rs.trim()) continue
      let temp: string[] | null
      if (isCss) {
        temp = this.executeCssString(root, rs)
      } else {
        temp = getResultList(root, rs)
      }
      if (temp && temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      } else {
        results.push([])
      }
    }
    if (results.length === 0) return null
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []
      const baseLen = Math.max(...results.map((r) => r.length), 0)
      for (let i = 0; i < baseLen; i++) {
        for (const r of results) {
          const val = r[i]
          merged.push(val !== undefined ? val : '')
        }
      }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  private async getElementsInternal(ruleList: SourceRule[], context?: ParseContext): Promise<unknown[]> {
    let result: unknown = context?.result ?? this.content
    for (const sr of ruleList) {
      this.putRuleMap(sr.putMap)
      await sr.makeUpRule(
        result,
        (js, res) => this.evalJS(js, res, context),
        (k) => this.variableProvider(k),
        (r) => this.getString(r, context),
      )
      if (result === null || result === undefined) continue
      switch (sr.mode) {
        case 'regex':
          result = this.executeRegexElements(String(result), sr.rule.split(/\s+/).filter(Boolean))
          break
        case 'webjs':
          result = JSON.parse((await this.getWebJsResultAsync(sr.rule)) || '[]')
          break
        case 'js':
          result = await this.evalJS(sr.rule, result, context)
          break
        case 'json':
          result = this.cache.getJSONPathAnalyzer(result).getList(sr.rule)
          break
        case 'xpath':
          result = this.cache.getXPathAnalyzer(result).getElements(sr.rule)
          break
        default: {
          const root = toDomNode(result)
          result = getElementsRecursive(root, sr.rule)
        }
      }
    }
    return Array.isArray(result) ? result : result ? [result] : []
  }

  private executeRegexElements(res: string, regs: string[]): string[][] {
    return this.executeRegexGetElements(res, regs, 0)
  }

  private executeRegexGetElements(res: string, regs: string[], index: number): string[][] {
    const reg = regs[index]
    if (!reg) return []
    const pattern = this.compileRegex(reg)
    if (!pattern) return []
    pattern.lastIndex = 0
    const firstMatch = pattern.exec(res)
    if (!firstMatch) return []
    if (index + 1 === regs.length) {
      const books: string[][] = []
      pattern.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = pattern.exec(res)) !== null) {
        const info: string[] = []
        for (let i = 0; i <= m.length; i++) info.push(m[i] || '')
        books.push(info)
        if (pattern.lastIndex === 0) break
      }
      return books
    }
    let combined = ''
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(res)) !== null) {
      combined += m[0]
      if (pattern.lastIndex === 0) break
    }
    return this.executeRegexGetElements(combined, regs, index + 1)
  }

  private replaceRegex(result: string, sr: SourceRule): string {
    if (!sr.replaceRegex) return result
    const regex = this.compileRegex(sr.replaceRegex)
    if (sr.replaceFirst) {
      if (regex) {
        regex.lastIndex = 0
        const m = regex.exec(result)
        if (m) return m[0].replace(regex, sr.replacement)
        return ''
      }
      return sr.replacement
    }
    if (regex) {
      regex.lastIndex = 0
      return result.replace(regex, sr.replacement)
    }
    return result.split(sr.replaceRegex).join(sr.replacement)
  }

  private compileRegex(pattern: string): RegExp | null {
    const regexCache = this.cache.getRegexCache()
    const cached = regexCache.get(pattern)
    if (cached !== undefined) {
      if (cached === null) return null
      return new RegExp(cached.source, cached.flags)
    }
    try {
      const re = new RegExp(pattern, 'g')
      regexCache.set(pattern, re)
      if (regexCache.size > 16) {
        const firstKey = regexCache.keys().next().value
        if (firstKey !== undefined) regexCache.delete(firstKey)
      }
      return re
    } catch {
      regexCache.set(pattern, null)
      return null
    }
  }

  async evalJS(jsStr: string, result: unknown = null, context?: ParseContext): Promise<unknown> {
    const code = jsStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
    try {
      const runtime = getJsRuntime()
      if (runtime) {
        const ctx = context || this.lastContext || {}
        return await runtime.execute(code, {
          result,
          src: this.content,
          source: ctx.source || this.source || {},
          baseUrl: ctx.baseUrl || this.baseUrl || '',
          book: ctx.book || {},
          key: ctx.key || '',
          page: ctx.page || 1,
          chapter: ctx.chapter || {},
          title: ctx.chapter?.title || '',
          nextChapterUrl: ctx.nextChapterUrl || '',
        })
      }
      return ''
    } catch {
      return ''
    }
  }

  private async getWebJsResultAsync(jsStr: string): Promise<string> {
    if (this.webJsExecutor) {
      try {
        const html = typeof this.content === 'string' ? this.content : String(this.content ?? '')
        return await this.webJsExecutor(html, jsStr, this.baseUrl || '')
      } catch {
        return ''
      }
    }
    return ''
  }

  private resolveUrl(url: string): string {
    if (!url || url.startsWith('http')) return url
    const base = this.redirectUrl || this.baseUrl || ''
    if (!base) return url
    try {
      return new URL(url, base).href
    } catch {
      return url
    }
  }
}
