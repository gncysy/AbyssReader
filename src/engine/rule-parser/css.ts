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
 * 执行 CSS 选择器（增强版，支持阅读3所有语法）
 */
export function executeCss(
  source: any,
  expression: string,
  attribute?: string
): any {
  if (!source) return null

  const html = typeof source === 'string' ? source : String(source)

  try {
    const $ = cheerio.load(html)
    let selector = expression

    // ===== 处理分割符 && / || / %% =====
    const result = handleSeparators($, selector, attribute)
    if (result !== null) return result

    // ===== 处理索引选择器 !N / .N / :N =====
    let index = -1
    let isExclude = false
    const indexMatch = selector.match(/(?:!|\.|:)(-?\d+)$/)
    if (indexMatch) {
      const prefix = selector[selector.length - indexMatch[0].length]
      index = parseInt(indexMatch[1], 10)
      isExclude = prefix === '!'
      selector = selector.replace(/(?:!|\.|:)-?\d+$/, '')
    }

    // ===== 处理 :contains 伪类 =====
    let containsText: string | null = null
    const containsMatch = selector.match(/:contains\(([^)]+)\)/)
    if (containsMatch) {
      containsText = containsMatch[1]
      selector = selector.replace(/:contains\([^)]+\)/, '')
    }

    // ===== 处理混合选择器 && =====
    let elements = $(selector)

    if (containsText) {
      elements = elements.filter((i, el) => {
        return $(el).text().includes(containsText)
      })
    }

    // ===== 应用索引 =====
    if (index >= 0 && elements.length > index) {
      elements = $(elements[index])
    } else if (index < 0 && elements.length >= Math.abs(index)) {
      elements = $(elements[elements.length + index])
    }

    if (elements.length === 0) return null

    const results: string[] = []
    elements.each((i, el) => {
      let value: string | null = null

      if (attribute === 'text' || !attribute) {
        value = $(el).text().trim()
      } else if (attribute === 'ownText') {
        value = $(el).clone().children().remove().end().text().trim() || null
      } else if (attribute === 'html') {
        value = $(el).html() || null
      } else if (attribute === 'outerHTML' || attribute === 'all') {
        value = $.html(el) || null
      } else if (attribute === 'tag') {
        value = (el as any).name || null
      } else if (attribute === 'textNodes') {
        const textNodes: string[] = []
        $(el).contents().each((i, node) => {
          if (node.type === 'text') {
            const text = (node as any).data?.trim()
            if (text) textNodes.push(text)
          }
        })
        value = textNodes.join('\n') || null
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

/**
 * 处理分割符 && / || / %%
 */
function handleSeparators($: cheerio.CheerioAPI, selector: string, attribute?: string): any | null {
  const hasAnd = selector.includes('&&')
  const hasOr = selector.includes('||')
  const hasMod = selector.includes('%%')

  if (!hasAnd && !hasOr && !hasMod) return null

  const parts = splitRule(selector, ['&&', '||', '%%'])
  if (parts.length === 0) return null

  let sepType = '||'
  if (hasAnd && !hasOr && !hasMod) sepType = '&&'
  else if (hasOr && !hasAnd && !hasMod) sepType = '||'
  else if (hasMod && !hasAnd && !hasOr) sepType = '%%'
  else {
    return handleMixedSeparators($, parts, attribute)
  }

  const results: any[][] = []
  for (const part of parts) {
    const result = executeCssInternal($, part.trim(), attribute)
    if (result !== null) {
      const arr = Array.isArray(result) ? result : [result]
      results.push(arr)
    }
  }

  if (results.length === 0) return null

  switch (sepType) {
    case '&&':
      return results[0]
    case '||': {
      const merged: string[] = []
      for (const arr of results) {
        merged.push(...arr)
      }
      return merged.length === 1 ? merged[0] : merged
    }
    case '%%': {
      const maxLen = Math.max(...results.map(r => r.length))
      const zipped: string[] = []
      for (let i = 0; i < maxLen; i++) {
        for (const arr of results) {
          if (i < arr.length) {
            zipped.push(arr[i])
          }
        }
      }
      return zipped.length === 1 ? zipped[0] : zipped
    }
    default:
      return results[0]
  }
}

function handleMixedSeparators($: cheerio.CheerioAPI, parts: string[], attribute?: string): any | null {
  const results: any[][] = []
  for (const part of parts) {
    const result = executeCssInternal($, part.trim(), attribute)
    if (result !== null) {
      const arr = Array.isArray(result) ? result : [result]
      results.push(arr)
    }
  }
  if (results.length === 0) return null
  const merged: string[] = []
  for (const arr of results) {
    merged.push(...arr)
  }
  return merged.length === 1 ? merged[0] : merged
}

/**
 * 分割规则
 */
export function splitRule(rule: string, separators: string[]): string[] {
  if (!rule) return []
  if (separators.length === 0) return [rule]

  const result: string[] = []
  let start = 0
  let i = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let depth = 0

  while (i < rule.length) {
    const char = rule[i]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      i++
      continue
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      i++
      continue
    }

    if (inSingleQuote || inDoubleQuote) {
      i++
      continue
    }

    if (char === '(' || char === '[') {
      depth++
      i++
      continue
    }
    if (char === ')' || char === ']') {
      depth--
      i++
      continue
    }

    if (depth > 0) {
      i++
      continue
    }

    for (const sep of separators) {
      if (rule.substring(i, i + sep.length) === sep) {
        const part = rule.substring(start, i).trim()
        if (part) result.push(part)
        i += sep.length
        start = i
        break
      }
    }

    i++
  }

  const last = rule.substring(start).trim()
  if (last) result.push(last)

  return result
}

/**
 * 内部执行函数（用于分割后的子规则）
 */
function executeCssInternal($: cheerio.CheerioAPI, selector: string, attribute?: string): any | null {
  try {
    let index = -1
    const indexMatch = selector.match(/(?:!|\.|:)(-?\d+)$/)
    if (indexMatch) {
      const prefix = selector[selector.length - indexMatch[0].length]
      index = parseInt(indexMatch[1], 10)
      const isExclude = prefix === '!'
      selector = selector.replace(/(?:!|\.|:)-?\d+$/, '')
      if (isExclude) {
        // 排除模式：返回空，由调用方处理
        return null
      }
    }

    let containsText: string | null = null
    const containsMatch = selector.match(/:contains\(([^)]+)\)/)
    if (containsMatch) {
      containsText = containsMatch[1]
      selector = selector.replace(/:contains\([^)]+\)/, '')
    }

    let elements = $(selector)

    if (containsText) {
      elements = elements.filter((i, el) => $(el).text().includes(containsText))
    }

    if (index >= 0 && elements.length > index) {
      elements = $(elements[index])
    } else if (index < 0 && elements.length >= Math.abs(index)) {
      elements = $(elements[elements.length + index])
    }

    if (elements.length === 0) return null

    const results: string[] = []
    elements.each((i, el) => {
      let value: string | null = null

      if (attribute === 'text' || !attribute) {
        value = $(el).text().trim()
      } else if (attribute === 'ownText') {
        value = $(el).clone().children().remove().end().text().trim() || null
      } else if (attribute === 'html') {
        value = $(el).html() || null
      } else if (attribute === 'outerHTML' || attribute === 'all') {
        value = $.html(el) || null
      } else if (attribute === 'tag') {
        value = (el as any).name || null
      } else if (attribute === 'textNodes') {
        const textNodes: string[] = []
        $(el).contents().each((i, node) => {
          if (node.type === 'text') {
            const text = (node as any).data?.trim()
            if (text) textNodes.push(text)
          }
        })
        value = textNodes.join('\n') || null
      } else {
        value = $(el).attr(attribute) || null
      }

      if (value) results.push(value)
    })

    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch {
    return null
  }
}
