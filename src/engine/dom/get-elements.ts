import * as cheerio from 'cheerio'
import { Element, Document } from 'domhandler'

export function getElements(
  html: string,
  selector: string,
  attribute?: string
): any[] {
  if (!html || !selector) return []

  const $ = cheerio.load(html)
  const elements = $(selector)

  if (elements.length === 0) return []

  const results: any[] = []

  elements.each((i, el) => {
    if (attribute) {
      const attrValue = $(el).attr(attribute)
      if (attrValue !== undefined && attrValue !== null) {
        results.push(attrValue)
      }
    } else {
      // 检查是否为 Element 类型
      const isElement = 'tagName' in el && 'attribs' in el
      const result: any = {
        tag: isElement ? (el as Element).tagName?.toLowerCase() || '' : '',
        text: $(el).text().trim(),
        html: $(el).html() || '',
        outerHTML: $.html(el),
        attributes: {} as Record<string, string>,
      }
      if (isElement && (el as Element).attribs) {
        for (const [key, value] of Object.entries((el as Element).attribs)) {
          result.attributes[key] = value
        }
      }
      results.push(result)
    }
  })

  return results
}

export function getElement(
  html: string,
  selector: string,
  attribute?: string
): any | null {
  const results = getElements(html, selector, attribute)
  return results.length > 0 ? results[0] : null
}
