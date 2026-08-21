// ============================================
// JSONPath 解析器 — 对齐 Legado AnalyzeByJSonPath
// 使用自实现的 SimpleJSONPath，零外部依赖
// ============================================

import { SimpleJSONPath } from './simple-jsonpath.js'
import { RuleAnalyzer } from '../rule-analyzer.js'

export class AnalyzeByJSONPath {
  private data: unknown
  private queryEngine: SimpleJSONPath

  constructor(content: unknown) {
    if (typeof content === 'string') {
      const trimmed = content.trim()
      if (!trimmed) {
        this.data = {}
        this.queryEngine = new SimpleJSONPath(this.data)
        return
      }
      const noBom = trimmed.replace(/^\uFEFF/, '')
      try {
        this.data = JSON.parse(noBom)
      } catch {
        // 非 JSON 字符串，包装为 { result: content }
        this.data = { result: content }
      }
    } else if (content === null || content === undefined) {
      this.data = {}
    } else {
      this.data = content
    }
    this.queryEngine = new SimpleJSONPath(this.data)
  }

  getString(rule: string, _resolver?: (inner: string) => string): string | null {
    if (!rule) return null

    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||')

    if (rules.length === 1) {
      const r0 = rules[0]
      if (r0 === undefined) return null
      const results = this.queryEngine.query(r0)
      if (results.length === 0) return null
      return results.map((v) => String(v)).join('\n')
    }

    const textList: string[] = []
    for (const rl of rules) {
      if (rl === undefined) continue
      const temp = this.getString(rl, _resolver)
      if (temp) {
        textList.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      }
    }
    return textList.join('\n') || null
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')

    if (rules.length === 1) {
      const r0 = rules[0]
      if (r0 === undefined) return []
      const results = this.queryEngine.query(r0)
      return results.map((v) => String(v))
    }

    const results: string[][] = []
    for (const rl of rules) {
      if (rl === undefined) continue
      const temp = this.getStringList(rl)
      if (temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      } else {
        results.push([])
      }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: string[] = []
      const maxLen = Math.max(...results.map((r) => r.length), 0)
      for (let i = 0; i < maxLen; i++) {
        for (const r of results) {
          const val = r[i]
          if (i < r.length && val !== undefined) merged.push(val)
        }
      }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  getObject(rule: string): unknown {
    const results = this.queryEngine.query(rule)
    return results.length > 0 ? results[0] : null
  }

  getList(rule: string): unknown[] {
    if (!rule) return []
    const ruleAnalyzer = new RuleAnalyzer(rule, true)
    const rules = ruleAnalyzer.splitRule('&&', '||', '%%')

    if (rules.length === 1) {
      const r0 = rules[0]
      if (r0 === undefined) return []
      return this.queryEngine.query(r0)
    }

    const results: unknown[][] = []
    for (const rl of rules) {
      if (rl === undefined) continue
      const temp = this.getList(rl)
      if (temp.length > 0) {
        results.push(temp)
        if (ruleAnalyzer.elementsType === '||') break
      }
    }
    if (results.length === 0) return []
    if (ruleAnalyzer.elementsType === '%%') {
      const merged: unknown[] = []
      const maxLen = Math.max(...results.map((r) => r.length), 0)
      for (let i = 0; i < maxLen; i++) {
        for (const r of results) {
          const val = r[i]
          if (i < r.length && val !== null && val !== undefined) merged.push(val)
        }
      }
      return merged
    }
    return ([] as unknown[]).concat(...results)
  }
}
