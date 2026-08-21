// ============================================
// CSS 选择器引擎 — 对齐 Legado AnalyzeByJSoup
// ============================================

import { RuleAnalyzer } from '../rule-analyzer.js'
import { getDomProvider, type DomNode } from './provider.js'

const RESULT_ATTRS = new Set(['text', 'textNodes', 'ownText', 'html', 'all'])
const MAX_RECURSION_DEPTH = 10

function normalizeCssSelector(expression: string): string {
  return expression
    .replace(/@tag\.(\w[\w-]*)/g, '$1')
    .replace(/@tag\.?/g, '')
    .replace(/@class\.([\w-]+)/g, '.$1')
    .replace(/@id\.([\w-]+)/g, '#$1')
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    .replace(/\btag\.(\w[\w-]*)/g, '$1')
    .replace(/\bid\.([\w-]+)/g, '#$1')
    .replace(/^@+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function safeCharAt(str: string, index: number): string {
  const ch = str[index]
  return ch !== undefined ? ch : ''
}

function elementsSingle(parent: DomNode, rule: string): DomNode[] {
  const rus = rule.trim()
  if (!rus) return []

  let split = '.'
  let beforeRule = ''
  const indexDefault: number[] = []
  const indexes: (number | [number | null, number | null, number])[] = []
  const head = rus.endsWith(']')

  if (head) {
    let len = rus.length - 1
    const curList: (number | null)[] = []
    let l = ''
    let curMinus = false
    let curInt: number | null = null

    while (len-- >= 0) {
      const rl = safeCharAt(rus, len)
      if (rl === ' ') continue
      if (rl >= '0' && rl <= '9') { l = rl + l; continue }
      if (rl === '-') { curMinus = true; continue }

      curInt = l ? (curMinus ? -parseInt(l) : parseInt(l)) : null

      if (rl === ':') {
        curList.push(curInt)
      } else {
        if (curList.length === 0) {
          if (curInt === null) break
          indexes.push(curInt)
        } else {
          const endVal = curList[curList.length - 1]
          const stepVal = curList.length === 2 ? curList[0] : 1
          indexes.push([
            curInt,
            endVal !== undefined ? endVal : null,
            stepVal !== undefined && stepVal !== null ? stepVal : 1,
          ])
          curList.length = 0
        }
        if (rl === '!') {
          split = '!'
          while (len > 0 && rus[len - 1] === ' ') len--
        }
        if (rl === '[') {
          beforeRule = rus.substring(0, len)
          break
        }
        if (rl !== ',') break
      }
      l = ''
      curMinus = false
    }
    if (beforeRule === '') beforeRule = rus.substring(0, Math.max(0, rus.lastIndexOf('[')))
  } else {
    let len = rus.length
    let l = ''
    let curMinus = false

    while (len-- >= 0) {
      const rl = safeCharAt(rus, len)
      if (rl === ' ') continue
      if (rl >= '0' && rl <= '9') { l = rl + l; continue }
      if (rl === '-') { curMinus = true; continue }

      if (rl === '!' || rl === '.' || rl === ':') {
        const idx = curMinus ? -parseInt(l) : parseInt(l)
        if (!isNaN(idx)) {
          indexDefault.push(idx)
          if (rl !== ':') {
            split = rl
            beforeRule = rus.substring(0, len)
            break
          }
        } else {
          if (rl !== ':') {
            split = rl
            beforeRule = rus.substring(0, len)
          }
        }
      } else {
        beforeRule = rus
        break
      }
      l = ''
      curMinus = false
    }
    if (len < 0 && indexDefault.length === 0 && indexes.length === 0) {
      split = ' '
      beforeRule = rus
    }
  }

  return finishSelect(parent, beforeRule, split, indexDefault, indexes)
}

function finishSelect(
  parent: DomNode,
  beforeRule: string,
  split: string,
  indexDefault: number[],
  indexes: (number | [number | null, number | null, number])[],
): DomNode[] {
  let elements: DomNode[]

  if (!beforeRule) {
    elements = parent.children || []
  } else {
    const dotIdx = beforeRule.indexOf('.')
    const firstKey = dotIdx === -1 ? beforeRule : beforeRule.substring(0, dotIdx)
    const rest = dotIdx === -1 ? '' : beforeRule.substring(dotIdx + 1)

    switch (firstKey) {
      case 'children': elements = parent.children || []; break
      case 'class': elements = parent.getElementsByClassName ? parent.getElementsByClassName(rest) : []; break
      case 'tag': elements = parent.getElementsByTagName ? parent.getElementsByTagName(rest) : []; break
      case 'id': {
        const el = parent.querySelector ? parent.querySelector('#' + rest) : null
        elements = el ? [el] : []
        if (elements.length === 0 && parent.querySelectorAll) {
          const all = parent.querySelectorAll('*')
          elements = all.filter((e) => e.getAttribute && e.getAttribute('id') === rest)
        }
        break
      }
      case 'text': {
        const searchText = rest
        const all = parent.querySelectorAll ? parent.querySelectorAll('*') : []
        elements = all.filter((e) => {
          if (!e) return false
          const children = e.children || []
          if (children.length > 0) return false
          const ownText = e.ownText ? e.ownText() : (e.textContent || '')
          return ownText.includes(searchText)
        })
        break
      }
      default:
        try {
          elements = parent.querySelectorAll ? parent.querySelectorAll(normalizeCssSelector(beforeRule)) : []
        } catch {
          elements = []
        }
    }
  }

  const len = elements.length
  if (indexDefault.length === 0 && indexes.length === 0) return elements

  const indexSet = new Set<number>()

  if (indexes.length === 0) {
    for (let ix = indexDefault.length - 1; ix >= 0; ix--) {
      const it = indexDefault[ix]
      if (it === undefined) continue
      if (it >= 0 && it < len) indexSet.add(it)
      else if (it < 0 && len >= -it) indexSet.add(it + len)
    }
  } else {
    for (let ix = indexes.length - 1; ix >= 0; ix--) {
      const item = indexes[ix]
      if (item === undefined) continue
      if (Array.isArray(item)) {
        const [startX, endX, stepX] = item
        let start = startX ?? 0
        if (start < 0) start += len
        let end = endX ?? len - 1
        if (end < 0) end += len
        if ((start < 0 && end < 0) || (start >= len && end >= len)) continue
        if (start >= len) start = len - 1
        else if (start < 0) start = 0
        if (end >= len) end = len - 1
        else if (end < 0) end = 0
        if (start === end || stepX >= len) { indexSet.add(start); continue }
        const step = stepX > 0 ? stepX : -stepX < len ? stepX + len : 1
        if (end > start) for (let i = start; i <= end; i += step) indexSet.add(i)
        else for (let i = start; i >= end; i -= step) indexSet.add(i)
      } else {
        const it = item as number
        if (it >= 0 && it < len) indexSet.add(it)
        else if (it < 0 && len >= -it) indexSet.add(it + len)
      }
    }
  }

  if (split === '!') {
    return elements.filter((_, i) => !indexSet.has(i))
  }

  const result: DomNode[] = []
  for (const i of indexSet) {
    const el = elements[i]
    if (i < len && el) result.push(el)
  }
  return result
}

function getResultLast(elements: DomNode[], lastRule: string): string[] {
  const results: string[] = []
  if (RESULT_ATTRS.has(lastRule)) {
    switch (lastRule) {
      case 'text':
        for (const el of elements) {
          const t = (el.textContent || '').trim()
          if (t) results.push(t)
        }
        break
      case 'textNodes':
        for (const el of elements) {
          const tns = el.textNodes ? el.textNodes() : []
          const filtered = tns.map((t) => t.trim()).filter(Boolean)
          if (filtered.length > 0) results.push(filtered.join('\n'))
        }
        break
      case 'ownText':
        for (const el of elements) {
          const t = el.ownText ? el.ownText() : (el.textContent || '').trim()
          if (t) results.push(t)
        }
        break
      case 'html': {
        const html = elements.map((e) => e.outerHTML || '').join('')
        if (html) results.push(html)
        break
      }
      case 'all':
        results.push(elements.map((e) => e.outerHTML || '').join(''))
        break
    }
  } else {
    for (const el of elements) {
      const val = el.getAttribute ? el.getAttribute(lastRule) || '' : ''
      if (val && !results.includes(val)) results.push(val)
    }
  }
  return results
}

function getResultList(root: DomNode, ruleStr: string): string[] | null {
  if (!ruleStr || !ruleStr.trim()) return null

  const ruleAnalyzer = new RuleAnalyzer(ruleStr)
  ruleAnalyzer.trim()
  const rules = ruleAnalyzer.splitRule('@')

  const validRules = rules.filter((r) => r && r.trim())

  if (validRules.length === 0) return null

  let elements = [root]
  const last = validRules.length - 1

  for (let i = 0; i < last; i++) {
    const nextElements: DomNode[] = []
    for (const elt of elements) {
      const rule = validRules[i]
      if (rule === undefined) continue
      const selected = elementsSingle(elt, rule)
      for (const s of selected) nextElements.push(s)
    }
    elements = nextElements
    if (elements.length === 0) return null
  }

  const lastRule = validRules[last]
  if (lastRule === undefined) return null
  return getResultLast(elements, lastRule)
}

function getElementsRecursive(temp: DomNode, ruleStr: string, depth = 0): DomNode[] {
  if (!temp || !ruleStr || !ruleStr.trim()) return []
  if (depth > MAX_RECURSION_DEPTH) return []

  const isCss = ruleStr.toLowerCase().startsWith('@css:')
  const elementsRule = isCss ? ruleStr.substring(5).trim() : ruleStr
  if (!elementsRule) return []

  const ruleAnalyzer = new RuleAnalyzer(elementsRule)
  const ruleStrS = ruleAnalyzer.splitRule('&&', '||', '%%')

  const validSegments = ruleStrS.filter((s) => s && s.trim())

  if (validSegments.length === 0) return []

  if (isCss) {
    const results: DomNode[][] = []
    for (const rs of validSegments) {
      const els = temp.querySelectorAll ? temp.querySelectorAll(normalizeCssSelector(rs)) : []
      results.push(els)
      if (els.length > 0 && ruleAnalyzer.elementsType === '||') break
    }
    return combineElementResults(results, ruleAnalyzer.elementsType)
  }

  const results: DomNode[][] = []

  for (const rs of validSegments) {
    const rsRule = new RuleAnalyzer(rs)
    rsRule.trim()
    const segments = rsRule.splitRule('@')
    const validRlSegments = segments.filter((s) => s && s.trim())

    let el: DomNode[]

    if (validRlSegments.length > 1) {
      let current = [temp]
      for (const rl of validRlSegments) {
        const nextElements: DomNode[] = []
        for (const et of current) {
          if (!et || typeof et !== 'object' || !('querySelectorAll' in et)) {
            continue
          }
          const subElements = getElementsRecursive(et, rl, depth + 1)
          for (const s of subElements) nextElements.push(s)
        }
        current = nextElements
        if (current.length === 0) break
      }
      el = current
    } else if (validRlSegments.length === 1) {
      const rl = validRlSegments[0]
      if (rl === undefined) { el = [] } else { el = elementsSingle(temp, rl) }
    } else {
      el = []
    }

    results.push(el)
    if (el.length > 0 && ruleAnalyzer.elementsType === '||') break
  }

  return combineElementResults(results, ruleAnalyzer.elementsType)
}

function combineElementResults(results: DomNode[][], elementsType: string): DomNode[] {
  if (results.length === 0) return []
  if (elementsType === '%%') {
    const merged: DomNode[] = []
    const first = results[0]
    if (!first) return []
    const baseLen = first.length
    for (let i = 0; i < baseLen; i++) {
      for (const es of results) {
        const el = es[i]
        if (i < es.length && el) merged.push(el)
      }
    }
    return merged
  }
  return ([] as DomNode[]).concat(...results)
}

export class AnalyzeByCSS {
  private root: DomNode

  constructor(content: unknown) {
    const provider = getDomProvider()
    if (content && typeof content === 'object' && 'tag' in content && typeof (content as DomNode).querySelectorAll === 'function') {
      this.root = content as DomNode
    } else {
      const html = typeof content === 'string' ? content : String(content)
      if (html.trimStart().startsWith('<?xml')) {
        const doc = provider.parseXML(html)
        this.root = doc.documentElement || doc.body || doc as unknown as DomNode
      } else {
        const doc = provider.parseHTML(html)
        this.root = doc.body || doc.documentElement || doc as unknown as DomNode
      }
    }
  }

  getElements(rule: string): DomNode[] {
    if (!rule) return []
    const elements = this.root.querySelectorAll ? this.root.querySelectorAll(rule) : []
    return this.applyPseudo(elements, rule)
  }

  getString(rule: string): string {
    const list = this.getStringList(rule)
    return list.length ? list.join('\n') : ''
  }

  getStringList(rule: string): string[] {
    if (!rule) return []
    const parts = this.splitLogical(rule)
    const type = this.detectLogical(rule)

    const results: string[][] = []
    for (const part of parts) {
      const list = this.evaluateSingleRule(part)
      if (list.length > 0) {
        results.push(list)
        if (type === '||') break
      }
    }

    if (type === '%%') {
      const merged: string[] = []
      const maxLen = Math.max(...results.map((r) => r.length), 0)
      for (let i = 0; i < maxLen; i++) {
        for (const list of results) {
          const val = list[i]
          if (i < list.length && val !== undefined) merged.push(val)
        }
      }
      return merged
    }
    return ([] as string[]).concat(...results)
  }

  private evaluateSingleRule(rule: string): string[] {
    const atIndex = rule.lastIndexOf('@')
    if (atIndex === -1) {
      const els = this.root.querySelectorAll ? this.root.querySelectorAll(rule) : []
      return Array.from(els)
        .map((el) => el.textContent?.trim() || '')
        .filter(Boolean)
    }

    const rawSelector = rule.substring(0, atIndex)
    const selector = normalizeCssSelector(rawSelector)
    const attr = rule.substring(atIndex + 1)
    const els = this.root.querySelectorAll ? this.root.querySelectorAll(selector) : []

    switch (attr) {
      case 'text':
        return Array.from(els).map((el) => el.textContent?.trim() || '').filter(Boolean)
      case 'textNodes':
        return Array.from(els).map((el) => {
          const tns = el.textNodes ? el.textNodes() : []
          return tns.join('\n')
        }).filter(Boolean)
      case 'ownText':
        return Array.from(els).map((el) => el.ownText ? el.ownText() : (el.textContent?.trim() || '')).filter(Boolean)
      case 'html':
        return Array.from(els).map((el) => el.outerHTML || '').filter(Boolean)
      case 'all':
        return Array.from(els).map((el) => el.outerHTML || '').filter(Boolean)
      default:
        return Array.from(els)
          .map((el) => el.getAttribute ? el.getAttribute(attr) || '' : '')
          .filter(Boolean)
    }
  }

  private splitLogical(rule: string): string[] {
    const parts: string[] = []
    let current = ''
    let depth = 0
    let i = 0

    while (i < rule.length) {
      const ch = safeCharAt(rule, i)
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--

      if (depth === 0 && i + 1 < rule.length) {
        const two = rule.substring(i, i + 2)
        if (two === '&&' || two === '||' || two === '%%') {
          if (current.trim()) parts.push(current.trim())
          current = ''
          i += 2
          continue
        }
      }
      current += ch
      i++
    }
    if (current.trim()) parts.push(current.trim())
    return parts
  }

  private detectLogical(rule: string): string {
    if (rule.includes('%%')) return '%%'
    if (rule.includes('||')) return '||'
    return '&&'
  }

  private applyPseudo(elements: DomNode[], rule: string): DomNode[] {
    const ltMatch = rule.match(/:lt\((\d+)\)/)
    if (ltMatch) {
      const nStr = ltMatch[1]
      if (nStr !== undefined) {
        const n = parseInt(nStr)
        return elements.slice(0, n)
      }
    }
    const gtMatch = rule.match(/:gt\((\d+)\)/)
    if (gtMatch) {
      const nStr = gtMatch[1]
      if (nStr !== undefined) {
        const n = parseInt(nStr)
        return elements.slice(n + 1)
      }
    }
    const eqMatch = rule.match(/:eq\((\d+)\)/)
    if (eqMatch) {
      const nStr = eqMatch[1]
      if (nStr !== undefined) {
        const n = parseInt(nStr)
        const el = elements[n]
        return n >= 0 && n < elements.length && el ? [el] : []
      }
    }
    return elements
  }
}

export { normalizeCssSelector, elementsSingle, getResultLast, getResultList, getElementsRecursive }
