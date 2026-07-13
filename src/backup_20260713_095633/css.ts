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
 * 格式：selector!index 或 selector.index
 * 例如：div.book!0:3 或 div.book.-1:10:2
 */
function processIndexSelector(selector: string): { baseSelector: string; indexMode: string; indexes: number[] } | null {
  // 匹配 !index 或 .index 格式
  const match = selector.match(/^(.*?)([!.])([0-9:,.-]+)$/)
  if (!match) return null

  const baseSelector = match[1]
  const indexMode = match[2] // '!' 或 '.'
  const indexStr = match[3]

  // 解析索引
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

/**
 * 提取元素属性值
 */
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
  // 属性提取
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

    // 检查是否有索引选择器
    const indexInfo = processIndexSelector(expression)

    let elements: any

    if (indexInfo) {
      // 先获取基础选择器的所有元素
      const allElements = $(indexInfo.baseSelector)
      if (allElements.length === 0) return null

      // 根据索引模式筛选
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
        // 排除模式：返回除指定索引外的所有元素
        const excludeSet = new Set(selected)
        const result: any[] = []
        for (let i = 0; i < totalLen; i++) {
          if (!excludeSet.has(allElements[i])) {
            result.push(allElements[i])
          }
        }
        elements = result
      } else {
        // 选择模式：只返回指定索引的元素
        elements = selected
      }
    } else {
      // 标准选择器
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
