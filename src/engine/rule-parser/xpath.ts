import xpath from 'xpath'
import { DOMParser } from '@xmldom/xmldom'

export interface ParsedRule {
  type: 'css' | 'xpath' | 'json' | 'js' | 'regex' | 'text'
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

export function parseXPath(rule: string): ParsedRule {
  let expression = rule
  if (expression.toLowerCase().startsWith('@xpath:')) expression = expression.substring(7)
  let attribute: string | null = null
  const attrMatch = expression.match(/^(.+)@([a-zA-Z_-]+)$/)
  if (attrMatch) { expression = attrMatch[1]; attribute = attrMatch[2] }
  return { type: 'xpath', expression: expression.trim(), attribute, cleanPattern: null, cleanReplacement: null, flags: null, original: rule }
}

/**
 * 自动补全 td/tr/tbody 缺少的父标签，与 legado 行为一致
 */
function wrapPartialHtml(html: string): string {
  let result = html
  if (result.endsWith('</td>') && !result.includes('<tr')) {
    result = '<tr>' + result + '</tr>'
  }
  if ((result.endsWith('</tr>') || result.endsWith('</tbody>')) && !result.includes('<table')) {
    result = '<table>' + result + '</table>'
  }
  return result
}

/**
 * 将 xmldom 节点转为可读字符串
 */
function nodeToString(node: any): string {
  if (!node) return ''
  // 属性节点 (nodeType === 2)
  if (node.nodeType === 2) return node.value || ''
  // 文本节点 (nodeType === 3)
  if (node.nodeType === 3) return node.textContent?.trim() || node.data?.trim() || ''
  // 元素节点 (nodeType === 1)
  if (node.nodeType === 1) return node.textContent?.trim() || ''
  return String(node)
}

function flattenResult(result: any): any[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  return [result]
}

export function executeXPath(source: any, expression: string, attribute?: string): any {
  if (!source || !expression) return null

  try {
    const html = typeof source === 'string' ? source : String(source)
    const wrappedHtml = wrapPartialHtml(html)

    const parser = new DOMParser()
    const doc = parser.parseFromString(wrappedHtml, 'text/html')

    if (!doc.documentElement) return null

    let xpathExpr = expression
    if (attribute) {
      xpathExpr = expression + '/@' + attribute
    }

    // 使用命名空间避免 xmldom 节点类型兼容问题
    const select = xpath.useNamespaces({ html: 'http://www.w3.org/1999/xhtml' })
    const rawResult = select(xpathExpr, doc.documentElement as any)
    const result = flattenResult(rawResult)

    if (result.length === 0) return null

    const values = result
      .map(nodeToString)
      .filter((v: string) => v !== '')

    if (values.length === 0) return null
    return values.length === 1 ? values[0] : values
  } catch (error: any) {
    console.warn('[XPath] 执行失败:', error.message, expression)
    return null
  }
}
