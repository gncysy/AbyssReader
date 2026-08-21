// ============================================
// XPath 解析器 — 通过 DomProvider 的 evaluateXPath
// ============================================

import { getDomProvider, type DomNode } from './provider.js'
import { RuleAnalyzer } from '../rule-analyzer.js'

function wrapIncompleteHtml(html: string): string {
  let result = html
  if (result.trimEnd().endsWith('</td>')) {
    result = '<tr>' + result + '</tr>'
  }
  if (result.trimEnd().endsWith('</tr>') || result.trimEnd().endsWith('</tbody>')) {
    result = '<table>' + result + '</table>'
  }
  return result
}

export class AnalyzeByXPath {
  private root: DomNode

  constructor(content: unknown) {
    const provider = getDomProvider()
    if (content && typeof content === 'object' && 'tag' in content && typeof (content as DomNode).querySelectorAll === 'function') {
      this.root = content as DomNode
    } else {
      const html = typeof content === 'string' ? content : String(content)
      const wrapped = wrapIncompleteHtml(html)
      if (wrapped.trimStart().startsWith('<?xml')) {
        const doc = provider.parseXML(wrapped)
        this.root = doc.documentElement || doc.body || doc as unknown as DomNode
      } else {
        const doc = provider.parseHTML(wrapped)
        this.root = doc.body || doc.documentElement || doc as unknown as DomNode
      }
    }
  }

  getElements(rule: string): DomNode[] {
    if (!rule) return []
    try {
      const ruleAnalyzer = new RuleAnalyzer(rule)
      const rules = ruleAnalyzer.splitRule('&&', '||', '%%')

      if (rules.length === 1) {
        const r0 = rules[0]
        if (r0 === undefined) return []
        return this.root.evaluateXPath(r0) || []
      }

      const results: DomNode[][] = []
      for (const rl of rules) {
        if (rl === undefined) continue
        const temp = this.getElements(rl)
        if (temp.length > 0) {
          results.push(temp)
          if (ruleAnalyzer.elementsType === '||') break
        }
      }

      if (results.length === 0) return []
      if (ruleAnalyzer.elementsType === '%%') {
        const merged: DomNode[] = []
        const first = results[0]
        if (!first) return []
        const baseLen = first.length
        for (let i = 0; i < baseLen; i++) {
          for (const r of results) {
            const el = r[i]
            if (i < r.length && el) merged.push(el)
          }
        }
        return merged
      }
      return ([] as DomNode[]).concat(...results)
    } catch {
      return []
    }
  }

  getString(rule: string): string {
    if (!rule) return ''
    const nodes = this.getElements(rule)
    if (nodes.length === 0) return ''
    return nodes.map((n) => n.textContent || '').join('\n')
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    const nodes = this.getElements(rule)
    return nodes.map((n) => n.textContent || '')
  }
}
