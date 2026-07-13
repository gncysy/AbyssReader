import * as cheerio from 'cheerio'
import type { ParsedRule } from './index.js'

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

/**
 * 处理索引选择器
 * 支持: !n (取第n个), !-1 (取最后一个)
 * 例如: li!2 或 a!-1
 */
function processIndexSelector(selector: string): { baseSelector: string; indexMode: string; indexes: number[] } | null {
  const match = selector.match(/^(.*?)([!.])([0-9:,.-]+)$/)
  if (!match) return null

  const baseSelector = match[1]
  const indexMode = match[2]
  const indexStr = match[3]

  const indexes: number[] = []
  const parts = indexStr.split(':')
  for (const part of parts) {
    if (part.includes(',')) {
      const subParts = part.split(',').map(s => parseInt(s.trim(), 10))
      for (const p of subParts) {
        if (!isNaN(p)) indexes.push(p)
      }
    } else {
      const num = parseInt(part.trim(), 10)
      if (!isNaN(num)) indexes.push(num)
    }
  }

  return { baseSelector, indexMode, indexes }
}

function extractValue($: cheerio.CheerioAPI, el: any, attribute?: string): string | null {
  if (attribute === 'text' || !attribute) {
    return $(el).text().trim() || null
  }
  if (attribute === 'html') {
    return $(el).html() || null
  }
  if (attribute === 'outerHTML') {
    return $.html(el) || null
  }
  if (attribute === 'ownText') {
    return $(el).contents().filter((i, node) => node.type === 'text').text().trim() || null
  }
  if (attribute === 'tag') {
    return el.name || null
  }
  return $(el).attr(attribute) || null
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

    const indexInfo = processIndexSelector(expression)

    let elements: any

    if (indexInfo) {
      const allElements = $(indexInfo.baseSelector)
      if (allElements.length === 0) return null

      const selected: any[] = []
      const totalLen = allElements.length

      for (const idx of indexInfo.indexes) {
        let actualIndex = idx
        if (idx < 0) {
          actualIndex = totalLen + idx
        }
        if (actualIndex >= 0 && actualIndex < totalLen) {
          selected.push(allElements[actualIndex])
        }
      }

      if (indexInfo.indexMode === '!') {
        const excludeSet = new Set(selected)
        const result: any[] = []
        for (let i = 0; i < totalLen; i++) {
          if (!excludeSet.has(allElements[i])) {
            result.push(allElements[i])
          }
        }
        elements = result
      } else {
        elements = selected
      }
    } else {
      elements = $(expression)
    }

    if (!elements || elements.length === 0) return null

    const results: string[] = []

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      const value = extractValue($, el, attribute)
      if (value !== null && value !== undefined) {
        results.push(value)
      }
    }

    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch (error: any) {
    console.warn('[CSS] 执行失败:', error.message, '选择器:', expression)
    return null
  }
}
