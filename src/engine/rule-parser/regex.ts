import type { ParsedRule } from './index'

export function parseRegex(rule: string): ParsedRule {
  let expression = rule.substring(7)
  let flags: string | null = null

  const flagMatch = expression.match(/^([gimsuy]+):(.+)/)
  if (flagMatch) {
    flags = flagMatch[1]
    expression = flagMatch[2]
  }

  return {
    type: 'regex',
    expression: expression.trim(),
    attribute: null,
    cleanPattern: null,
    cleanReplacement: null,
    flags: flags,
    original: rule,
  }
}

export function executeRegex(
  source: any,
  expression: string,
  flags?: string
): any {
  if (!source) return null

  const text = typeof source === 'string' ? source : String(source)

  try {
    const regex = new RegExp(expression, flags || 'g')
    const matches = [...text.matchAll(regex)]

    if (matches.length === 0) return null

    const results = matches.map((match) => {
      return match.length > 1 ? match.slice(1).join('') : match[0]
    })

    return results.length === 1 ? results[0] : results
  } catch {
    return null
  }
}

export function applyClean(data: any, pattern: string, replacement: string): any {
  if (typeof data === 'string') {
    try {
      return data.replace(new RegExp(pattern, 'g'), replacement)
    } catch {
      return data
    }
  }

  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === 'string' ? applyClean(item, pattern, replacement) : item
    )
  }

  return data
}
