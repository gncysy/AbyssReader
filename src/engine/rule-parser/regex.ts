export interface ParsedRule {
  type: 'css' | 'xpath' | 'json' | 'js' | 'regex' | 'text'
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

export function parseRegex(rule: string): ParsedRule {
  let expression = rule.substring(7)
  let flags: string | null = null
  const flagMatch = expression.match(/^([gimsuy]+):(.+)/)
  if (flagMatch) { flags = flagMatch[1]; expression = flagMatch[2] }
  return { type: 'regex', expression: expression.trim(), attribute: null, cleanPattern: null, cleanReplacement: null, flags, original: rule }
}

export function executeRegex(source: any, expression: string, flags?: string): any {
  if (!source) return null
  const text = typeof source === 'string' ? source : String(source)
  try {
    const regex = new RegExp(expression, flags || 'g')
    const matches = [...text.matchAll(regex)]
    if (matches.length === 0) return null
    const results = matches.map((match) => match.length > 1 ? match.slice(1).join('') : match[0])
    return results.length === 1 ? results[0] : results
  } catch { return null }
}
