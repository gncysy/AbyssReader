// ============================================
// 浏览器 DomProvider 实现
// 对齐 Legado Jsoup + JXNode 行为
// ============================================

import { setDomProvider, type DomProvider, type DomDocument, type DomNode } from '@engine/parser/dom/provider.js'
import { getCachedRegex } from '@engine/utils/regex-cache.js'

const TEXT_NODE_TAG = '#text'

function createTextNodeWrapper(text: string): DomNode {
  return {
    tag: TEXT_NODE_TAG,
    attrs: {},
    children: [],
    textContent: text,
    innerHTML: '',
    outerHTML: text,
    getAttribute: () => null,
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    parentNode: null,
    nextSibling: null,
    previousSibling: null,
    remove: () => {},
    ownText: () => '',
    textNodes: () => [],
    evaluateXPath: () => [],
  }
}

function xpathEvaluate(context: Node, xpath: string): Node[] {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    )
    const nodes: Node[] = []
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i)
      if (node) nodes.push(node)
    }
    return nodes
  } catch {
    return []
  }
}

function ownTextOf(node: Node): string {
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  let text = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || ''
    }
  }
  return text.trim()
}

function textNodesOf(node: Node): string[] {
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as Element
  const result: string[] = []
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result.push(child.textContent || '')
    }
  }
  return result
}

function safeMatchGroup(match: RegExpExecArray, index: number): string {
  const val = match[index]
  return val !== undefined ? val : ''
}

interface SelectorParts {
  baseSelector: string
  containsTexts: string[]
  hasSelectors: string[]
  matchesTexts: string[]
  notHasTexts: string[]
}

function parseExtendedSelector(selector: string): SelectorParts {
  const containsTexts: string[] = []
  const hasSelectors: string[] = []
  const matchesTexts: string[] = []
  const notHasTexts: string[] = []
  let baseSelector = selector

  const containsRegex = getCachedRegex(':contains\\(([^)]+)\\)', 'g')
  const hasRegex = getCachedRegex(':has\\(([^)]+)\\)', 'g')
  const notHasRegex = getCachedRegex(':not\\(:has\\(([^)]+)\\)\\)', 'g')
  const notMatchesRegex = getCachedRegex(':not\\(:matches\\(([^)]+)\\)\\)', 'g')
  const notOtherRegex = getCachedRegex(':not\\([^)]+\\)', 'g')
  const matchesRegex = getCachedRegex(':matches\\(([^)]+)\\)', 'g')

  if (containsRegex) {
    containsRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = containsRegex.exec(selector)) !== null) {
      containsTexts.push(safeMatchGroup(m, 1).replace(/^['"]|['"]$/g, ''))
    }
    if (containsTexts.length > 0) {
      const r = getCachedRegex(':contains\\([^)]+\\)', 'g')
      if (r) baseSelector = baseSelector.replace(r, '')
    }
  }

  if (hasRegex) {
    hasRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = hasRegex.exec(selector)) !== null) {
      hasSelectors.push(safeMatchGroup(m, 1))
    }
    if (hasSelectors.length > 0) {
      const r = getCachedRegex(':has\\([^)]+\\)', 'g')
      if (r) baseSelector = baseSelector.replace(r, '')
    }
  }

  if (notHasRegex) {
    notHasRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = notHasRegex.exec(selector)) !== null) {
      notHasTexts.push(safeMatchGroup(m, 1))
    }
    if (notHasTexts.length > 0) {
      const r = getCachedRegex(':not\\(:has\\([^)]+\\)\\)', 'g')
      if (r) baseSelector = baseSelector.replace(r, '')
    }
  }

  if (notMatchesRegex) {
    notMatchesRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = notMatchesRegex.exec(selector)) !== null) {
      const text = safeMatchGroup(m, 1).replace(/^['"]|['"]$/g, '')
      notHasTexts.push(text)
    }
    if (notHasTexts.length > 0) {
      const r = getCachedRegex(':not\\(:matches\\([^)]+\\)\\)', 'g')
      if (r) baseSelector = baseSelector.replace(r, '')
    }
  }

  if (notOtherRegex) {
    baseSelector = baseSelector.replace(notOtherRegex, '')
  }

  if (matchesRegex) {
    matchesRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = matchesRegex.exec(selector)) !== null) {
      matchesTexts.push(safeMatchGroup(m, 1).replace(/^['"]|['"]$/g, ''))
    }
    if (matchesTexts.length > 0) {
      const r = getCachedRegex(':matches\\([^)]+\\)', 'g')
      if (r) baseSelector = baseSelector.replace(r, '')
    }
  }

  return { baseSelector, containsTexts, hasSelectors, matchesTexts, notHasTexts }
}

function matchesElementText(el: Element, patterns: string[]): boolean {
  if (patterns.length === 0) return true
  const text = el.textContent || ''
  for (const pattern of patterns) {
    const regex = getCachedRegex(pattern)
    if (regex && !regex.test(text)) {
      return false
    }
  }
  return true
}

function hasChildSelector(el: Element, selectors: string[]): boolean {
  if (selectors.length === 0) return true
  for (const sel of selectors) {
    try {
      if (el.querySelector(sel)) {
        return true
      }
    } catch {
      // 选择器无效，跳过
    }
  }
  return false
}

function querySelectorAllWithExtended(
  root: Document | Element,
  selector: string,
): Element[] {
  const { baseSelector, containsTexts, hasSelectors, matchesTexts, notHasTexts } = parseExtendedSelector(selector)

  let elements: Element[]
  try {
    elements = Array.from(
      baseSelector.trim()
        ? root.querySelectorAll(baseSelector.trim())
        : root.querySelectorAll('*')
    )
  } catch {
    elements = []
  }

  return elements.filter((el) => {
    const text = el.textContent || ''

    for (const searchText of containsTexts) {
      if (!text.includes(searchText)) {
        return false
      }
    }

    if (hasSelectors.length > 0 && !hasChildSelector(el, hasSelectors)) {
      return false
    }

    if (!matchesElementText(el, matchesTexts)) {
      return false
    }

    for (const notText of notHasTexts) {
      const regex = getCachedRegex(notText)
      if (regex) {
        regex.lastIndex = 0
        if (regex.test(text)) {
          return false
        }
      } else if (text.includes(notText)) {
        return false
      }
    }

    return true
  })
}

class BrowserDomProvider implements DomProvider {
  parseHTML(html: string): DomDocument {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    return this.wrapDocument(doc)
  }

  parseXML(xml: string): DomDocument {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    return this.wrapDocument(doc)
  }

  createDocument(): DomDocument {
    const doc = document.implementation.createHTMLDocument('')
    return this.wrapDocument(doc)
  }

  private wrapDocument(doc: Document): DomDocument {
    const self = this
    const wrapNodeRef = (node: Node | null): DomNode | null => self.wrapNode(node)
    return {
      querySelector: (sel: string) => {
        const { baseSelector } = parseExtendedSelector(sel)
        return wrapNodeRef(doc.querySelector(baseSelector))
      },
      querySelectorAll: (sel: string) =>
        querySelectorAllWithExtended(doc, sel)
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      getElementById: (id: string) => wrapNodeRef(doc.getElementById(id)),
      getElementsByTagName: (name: string) =>
        Array.from(doc.getElementsByTagName(name))
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      getElementsByClassName: (name: string) =>
        Array.from(doc.getElementsByClassName(name))
          .map((el) => wrapNodeRef(el))
          .filter((n): n is DomNode => n !== null),
      get body() { return wrapNodeRef(doc.body) },
      get head() { return wrapNodeRef(doc.head) },
      get documentElement() { return wrapNodeRef(doc.documentElement) },
      createElement: (tag: string) => wrapNodeRef(doc.createElement(tag)) || createTextNodeWrapper(''),
      createTextNode: (text: string) => createTextNodeWrapper(text),
      get textContent() { return doc.documentElement?.textContent || null },
      get innerHTML() { return doc.documentElement?.innerHTML || '' },
      get outerHTML() { return doc.documentElement?.outerHTML || '' },
      evaluateXPath: (xpath: string) =>
        xpathEvaluate(doc, xpath)
          .map((n) => wrapNodeRef(n))
          .filter((n): n is DomNode => n !== null),
    }
  }

  private wrapNode(node: Node | null): DomNode | null {
    if (!node) return null

    if (node.nodeType === Node.TEXT_NODE) {
      return createTextNodeWrapper(node.textContent || '')
    }

    const el = node as Element
    const self = this
    const wrap = (n: Node | null): DomNode | null => self.wrapNode(n)

    const result: DomNode = {
      tag: el.tagName.toLowerCase(),
      attrs: (() => {
        const attrs: Record<string, string> = {}
        for (const attr of Array.from(el.attributes)) {
          attrs[attr.name] = attr.value
        }
        return attrs
      })(),
      children: Array.from(el.children)
        .map((child) => wrap(child))
        .filter((n): n is DomNode => n !== null),
      textContent: el.textContent || '',
      innerHTML: el.innerHTML || '',
      outerHTML: el.outerHTML || '',
      getAttribute: (name: string) => el.getAttribute(name),
      setAttribute: (name: string, value: string) => el.setAttribute(name, value),
      querySelector: (sel: string) => {
        const { baseSelector } = parseExtendedSelector(sel)
        return wrap(el.querySelector(baseSelector))
      },
      querySelectorAll: (sel: string) =>
        querySelectorAllWithExtended(el, sel)
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      getElementsByTagName: (name: string) =>
        Array.from(el.getElementsByTagName(name))
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      getElementsByClassName: (name: string) =>
        Array.from(el.getElementsByClassName(name))
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
      get parentNode() { return wrap(el.parentNode) },
      get nextSibling() { return wrap(el.nextSibling) },
      get previousSibling() { return wrap(el.previousSibling) },
      remove: () => el.remove(),
      ownText: () => ownTextOf(el),
      textNodes: () => textNodesOf(el),
      evaluateXPath: (xpath: string) =>
        xpathEvaluate(el, xpath)
          .map((n) => wrap(n))
          .filter((n): n is DomNode => n !== null),
    }

    return result
  }
}

export function initDomProvider(): void {
  setDomProvider(new BrowserDomProvider())
}
