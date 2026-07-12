import * as cheerio from 'cheerio'
import type { ParsedRule } from './index'

export function parseCss(rule: string): ParsedRule {
  let expression = rule
  let attribute: string | null = null

  const attrMatch = expression.match(/^(.+)@([a-zA-Z-]+)$/)
  if (attrMatch) {
    expression = attrMatch[1]
    attribute = attrMatch[2]
  }

  return {
    type: 'css',
    expression: expression.trim(),
    attribute: attribute,
    cleanPattern: null,
    cleanReplacement: null,
    flags: null,
    original: rule,
  }
}

export function executeCss(
  source: any,
  expression: string,
  attribute?: string
): any {
  if (!source) return null

  const html = typeof source === 'string' ? source : String(source)
  
  try {
    const $ = cheerio.load(html)
    const elements = $(expression)
    
    if (elements.length === 0) return null

    const results: string[] = []
    elements.each((i, el) => {
      let value: string | null = null
      if (attribute === 'text' || !attribute) {
        value = $(el).text().trim()
      } else if (attribute === 'html') {
        value = $(el).html() || null
      } else if (attribute === 'outerHTML') {
        value = $.html(el) || null
      } else {
        value = $(el).attr(attribute) || null
      }
      if (value) results.push(value)
    })

    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch (error: any) {
    console.warn('[CSS] 执行失败:', error.message, '选择器:', expression)
    return null
  }
}
