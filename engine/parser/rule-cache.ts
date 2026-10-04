// ============================================
// RuleCache — 规则执行缓存管理
// ============================================

import { AnalyzeByCSS } from './dom/css.js'
import { AnalyzeByXPath } from './dom/xpath.js'
import { AnalyzeByJSONPath } from './json/jsonpath.js'
import { SourceRule } from './source-rule.js'

const CACHE_MAX_SIZE = 16
const KEY_PREFIX_LENGTH = 64
const KEY_FNV_OFFSET = 2166136261
const KEY_FNV_PRIME = 16777619

/**
 * 计算字符串的 FNV-1a 哈希（32 位）。
 * 修复：原实现用 `outerHTML.substring(0, 300)` 做 DOM key，
 * 长文档前缀相同会撞 key。改为完整内容 + 哈希。
 */
function fnv1aHash(str: string): string {
  let hash = KEY_FNV_OFFSET
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, KEY_FNV_PRIME)
    hash = hash >>> 0
  }
  return hash.toString(36)
}

function getContentKey(content: unknown): string {
  if (content === null || content === undefined) return 'null'
  if (typeof content === 'string') {
    // 小字符串直接用原文，大字符串用 前缀 + 哈希 + 长度
    if (content.length <= KEY_PREFIX_LENGTH) return 'str:' + content
    return 'str:' + content.substring(0, KEY_PREFIX_LENGTH) + ':' + fnv1aHash(content) + ':' + content.length
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if (obj.tag !== undefined && typeof obj.querySelectorAll === 'function') {
      const outerHTML = typeof obj.outerHTML === 'string' ? obj.outerHTML : ''
      if (outerHTML.length === 0) {
        // 无 outerHTML，用 tag + textContent 做 key
        const tag = typeof obj.tag === 'string' ? obj.tag : 'dom'
        const text = typeof obj.textContent === 'string' ? obj.textContent : ''
        return 'dom:' + tag + ':' + fnv1aHash(text) + ':' + text.length
      }
      // 修复：完整内容做哈希，不再截断
      return 'dom:' + fnv1aHash(outerHTML) + ':' + outerHTML.length
    }
    try {
      const jsonStr = JSON.stringify(content)
      if (jsonStr.length <= KEY_PREFIX_LENGTH) return 'json:' + jsonStr
      return 'json:' + fnv1aHash(jsonStr) + ':' + jsonStr.length
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
