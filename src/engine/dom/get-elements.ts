import * as cheerio from 'cheerio'

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
      // 使用 cheerio 的 API 获取信息，避免直接访问 el 的属性
      const result: any = {
        tag: (el as any).name || '',
        text: $(el).text().trim(),
        html: $(el).html() || '',
        outerHTML: $.html(el),
        attributes: {} as Record<string, string>,
      }
      // 使用 cheerio 的 attr 方法获取所有属性
      const attribs = (el as any).attribs
      if (attribs) {
        for (const [key, value] of Object.entries(attribs)) {
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

