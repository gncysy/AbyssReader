import xpath from 'xpath'
import * as cheerio from 'cheerio'

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
  const attrMatch = expression.match(/^(.+)@([a-zA-Z-]+)$/)
  if (attrMatch) { expression = attrMatch[1]; attribute = attrMatch[2] }
  return { type: 'xpath', expression: expression.trim(), attribute, cleanPattern: null, cleanReplacement: null, flags: null, original: rule }
}

export function executeXPath(source: any, expression: string, attribute?: string): any {
  if (!source) return null
  const html = typeof source === 'string' ? source : String(source)
  const $ = cheerio.load(html)
  const doc = $.root()[0]
  let xpathExpr = attribute ? expression + '/@' + attribute : expression
  try {
    const result = xpath.select(xpathExpr, doc as any)
    if (!result) return null
    if (Array.isArray(result)) {
      const values = result.map((node: any) => {
        if (node.nodeType === 2) return node.value
        if (node.nodeType === 3) return node.textContent?.trim() || ''
        if (node.nodeType === 1) return node.textContent?.trim() || ''
        return String(node)
      }).filter((v: string) => v && v !== '')
      return values.length === 0 ? null : values.length === 1 ? values[0] : values
    }
    return String(result)
  } catch { return null }
}
