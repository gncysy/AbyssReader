// ============================================
// RuleCache — 规则执行缓存管理
// ============================================

import { AnalyzeByCSS } from './dom/css.js'
import { AnalyzeByXPath } from './dom/xpath.js'
import { AnalyzeByJSONPath } from './json/jsonpath.js'
import { SourceRule } from './source-rule.js'

const CACHE_MAX_SIZE = 16

function getContentKey(content: unknown): string {
  if (content === null || content === undefined) return 'null'
  if (typeof content === 'string') {
    return 'str:' + content.substring(0, 500) + ':' + content.length
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if (obj.tag !== undefined && typeof obj.querySelectorAll === 'function') {
      const outerHTML = typeof obj.outerHTML === 'string' ? obj.outerHTML : (typeof obj.tag === 'string' ? obj.tag : 'dom')
      return 'dom:' + outerHTML.substring(0, 300)
    }
    try {
      const jsonStr = JSON.stringify(content)
      return 'json:' + jsonStr.substring(0, 300) + ':' + jsonStr.length
    } catch {
      return 'obj:' + Object.prototype.toString.call(content)
    }
  }
  return String(content)
}

export class RuleCache {
  private cssCache = new Map<string, AnalyzeByCSS>()
  private xpathCache = new Map<string, AnalyzeByXPath>()
  private jsonpathCache = new Map<string, AnalyzeByJSONPath>()
  private ruleCache = new Map<string, SourceRule[]>()
  private regexCache = new Map<string, RegExp | null>()
  private variableStore = new Map<string, string>()

  getCSSAnalyzer(content: unknown): AnalyzeByCSS {
    const k = getContentKey(content)
    const cached = this.cssCache.get(k)
    if (cached) return cached

    if (this.cssCache.size >= CACHE_MAX_SIZE) {
      const firstKey = this.cssCache.keys().next().value
      if (firstKey !== undefined) this.cssCache.delete(firstKey)
    }
    const analyzer = new AnalyzeByCSS(content)
    this.cssCache.set(k, analyzer)
    return analyzer
  }

  getXPathAnalyzer(content: unknown): AnalyzeByXPath {
    const k = getContentKey(content)
    const cached = this.xpathCache.get(k)
    if (cached) return cached

    if (this.xpathCache.size >= CACHE_MAX_SIZE) {
      const firstKey = this.xpathCache.keys().next().value
      if (firstKey !== undefined) this.xpathCache.delete(firstKey)
    }
    const analyzer = new AnalyzeByXPath(content)
    this.xpathCache.set(k, analyzer)
    return analyzer
  }

  getJSONPathAnalyzer(content: unknown): AnalyzeByJSONPath {
    const k = getContentKey(content)
    const cached = this.jsonpathCache.get(k)
    if (cached) return cached

    if (this.jsonpathCache.size >= CACHE_MAX_SIZE) {
      const firstKey = this.jsonpathCache.keys().next().value
      if (firstKey !== undefined) this.jsonpathCache.delete(firstKey)
    }
    const analyzer = new AnalyzeByJSONPath(content)
    this.jsonpathCache.set(k, analyzer)
    return analyzer
  }

  getRuleCache(): Map<string, SourceRule[]> {
    return this.ruleCache
  }

  getRegexCache(): Map<string, RegExp | null> {
    return this.regexCache
  }

  putVariable(key: string, value: string): void {
    this.variableStore.set(key, value)
  }

  getVariable(key: string): string {
    return this.variableStore.get(key) || ''
  }

  clearAll(): void {
    this.cssCache.clear()
    this.xpathCache.clear()
    this.jsonpathCache.clear()
    this.ruleCache.clear()
    this.regexCache.clear()
    this.variableStore.clear()
  }
}
