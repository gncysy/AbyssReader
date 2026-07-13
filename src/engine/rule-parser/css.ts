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

export function parseCss(rule: string): ParsedRule {
  let expression = rule
  let attribute: string | null = null
  const attrMatch = expression.match(/^(.+)@([a-zA-Z-]+)$/)
  if (attrMatch) { expression = attrMatch[1]; attribute = attrMatch[2] }
  return { type: 'css', expression: expression.trim(), attribute, cleanPattern: null, cleanReplacement: null, flags: null, original: rule }
}

function processIndexSelector(selector: string): { baseSelector: string; indexMode: string; indexes: number[] } | null {
  const match = selector.match(/^(.*?)([!.])([0-9:,.-]+)$/)
  if (!match) return null
  if (match[2] === "." && /^\d+$/.test(match[3])) return null
  const baseSelector = match[1], indexMode = match[2], indexStr = match[3]
  const indexes = indexStr.split(/[:,]/).map(s => parseInt(s, 10)).filter(n => !isNaN(n))
  return { baseSelector, indexMode, indexes }
}

function extractValue($: cheerio.CheerioAPI, el: any, attribute?: string): string | null {
  if (attribute === 'text' || !attribute) return $(el).text().trim() || null
  if (attribute === 'html') return $(el).html() || null
  if (attribute === 'outerHTML') return $.html(el) || null
  if (attribute === 'ownText') return $(el).contents().filter((i, node) => node.type === 'text').text().trim() || null
  if (attribute === 'tag') return el.name || null
  return $(el).attr(attribute) || null
}

export function executeCss(source: any, expression: string, attribute?: string): any {
  if (!source) return null
  if (typeof expression === "string") {
    expression = expression.split('\n').filter((line: string) => !line.trim().startsWith('//')).join('\n').trim()
  }
  const html = typeof source === 'string' ? source : String(source)
  try {
    const $ = cheerio.load(html)
    if (expression.includes('&&')) {
      const parts = expression.split('&&').map(s => s.trim())
      const allResults: string[] = []
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined) {
          if (Array.isArray(result)) allResults.push(...result.map(String))
          else allResults.push(String(result))
        }
      }
      return allResults.length > 0 ? allResults : null
    }
    if (expression.includes('%%')) {
      const parts = expression.split('%%').map(s => s.trim())
      const matrixResults: string[][] = []
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined) {
          if (Array.isArray(result)) matrixResults.push(result.map(String))
          else matrixResults.push([String(result)])
        } else matrixResults.push([])
      }
      const maxLen = Math.max(...matrixResults.map(arr => arr.length))
      const merged: string[] = []
      for (let i = 0; i < maxLen; i++) {
        for (const arr of matrixResults) {
          if (i < arr.length) merged.push(arr[i])
        }
      }
      return merged.length > 0 ? merged : null
    }
    const indexInfo = processIndexSelector(expression)
    let elements: any
    if (indexInfo) {
      const allElements = $(indexInfo.baseSelector)
      if (allElements.length === 0) return null
      const selected: any[] = []
      const totalLen = allElements.length
      for (const idx of indexInfo.indexes) {
        let actualIndex = idx < 0 ? totalLen + idx : idx
        if (actualIndex >= 0 && actualIndex < totalLen) selected.push(allElements[actualIndex])
      }
      if (indexInfo.indexMode === '!') {
        const excludeSet = new Set(selected)
        const result: any[] = []
        for (let i = 0; i < totalLen; i++) {
          if (!excludeSet.has(allElements[i])) result.push(allElements[i])
        }
        elements = result
      } else elements = selected
    } else elements = $(expression)
    if (!elements || elements.length === 0) return null
    const results: string[] = []
    for (let i = 0; i < elements.length; i++) {
      const value = extractValue($, elements[i], attribute)
      if (value !== null && value !== undefined) results.push(value)
    }
    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch (error: any) {
    console.warn('[CSS] 执行失败:', error.message, '选择器:', expression)
    return null
  }
}
