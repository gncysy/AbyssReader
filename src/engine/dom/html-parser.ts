import * as cheerio from 'cheerio'

export function parseHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html)
}

export function extractText(html: string, selector?: string): string {
  if (!html) return ''
  const $ = cheerio.load(html)
  if (selector) {
    const el = $(selector)
    return el.length > 0 ? el.text().trim() : ''
  }
  return $('body').text().trim()
}

export function extractHtml(html: string, selector?: string): string {
  if (!html) return ''
  const $ = cheerio.load(html)
  if (selector) {
    const el = $(selector)
    return el.length > 0 ? (el.html() || '') : ''
  }
  return $('body').html() || ''
}

export function extractAttribute(
  html: string,
  selector: string,
  attribute: string
): string | null {
  if (!html || !selector || !attribute) return null
  const $ = cheerio.load(html)
  const el = $(selector)
  return el.length > 0 ? (el.attr(attribute) || null) : null
}
