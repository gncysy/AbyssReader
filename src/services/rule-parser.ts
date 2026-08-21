// ============================================
// 规则解析器 — 将规则字符串拆分为 pure/js 段
// 对齐 Legado：@js: 后跟到字符串结束
// ============================================

export type RuleSegment =
  | { type: 'pure'; rule: string }
  | { type: 'js'; code: string }

const MAX_ITERATIONS = 200

function indexOutsideString(str: string, search: string, fromIndex: number): number {
  let i = fromIndex
  while (i < str.length) {
    const ch = str[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i++
      while (i < str.length) {
        const c = str[i]
        if (c === '\\') { i += 2; continue }
        if (c === quote) { i++; break }
        i++
      }
      continue
    }
    if (str.startsWith(search, i)) return i
    i++
  }
  return -1
}

interface Marker {
  index: number
  type: 'tag' | 'inline'
  prefix: string
}

function findFirstMarker(remaining: string): Marker | null {
  const candidates: { idx: number; type: 'tag' | 'inline' }[] = []

  const tagIdx = indexOutsideString(remaining, '<js>', 0)
  if (tagIdx !== -1) candidates.push({ idx: tagIdx, type: 'tag' })

  const inlineJsIdx = indexOutsideString(remaining, '@js:', 0)
  const inlineJavascriptIdx = indexOutsideString(remaining, '@javascript:', 0)
  const inlineIdx = inlineJsIdx !== -1 ? inlineJsIdx : inlineJavascriptIdx
  if (inlineIdx !== -1) candidates.push({ idx: inlineIdx, type: 'inline' })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => a.idx - b.idx)
  const best = candidates[0]
  if (best === undefined) return null
  const prefix = remaining.substring(0, best.idx).trim()
  return { index: best.idx, type: best.type, prefix }
}

export function parseRuleSegments(rule: string): RuleSegment[] {
  if (!rule) return []

  const segments: RuleSegment[] = []
  let remaining = rule
  let iterations = 0

  while (remaining.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++

    const marker = findFirstMarker(remaining)

    if (!marker) {
      const trimmed = remaining.trim()
      if (trimmed) segments.push({ type: 'pure', rule: trimmed })
      break
    }

    if (marker.prefix) {
      segments.push({ type: 'pure', rule: marker.prefix })
    }

    if (marker.type === 'tag') {
      const codeStart = marker.index + 4
      let depth = 1
      let pos = codeStart

      while (pos < remaining.length && depth > 0) {
        const ch = remaining[pos]
        if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch
          pos++
          while (pos < remaining.length) {
            const c = remaining[pos]
            if (c === '\\') { pos += 2; continue }
            if (c === quote) { pos++; break }
            pos++
          }
          continue
        }
        if (remaining.startsWith('<js>', pos)) { depth++; pos += 4; continue }
        if (remaining.startsWith('</js>', pos)) {
          depth--
          if (depth === 0) {
            const code = remaining.substring(codeStart, pos).trim()
            if (code) segments.push({ type: 'js', code })
            remaining = remaining.substring(pos + 5)
            break
          }
          pos += 5
          continue
        }
        pos++
      }

      if (depth > 0) {
        segments.push({ type: 'pure', rule: remaining.substring(marker.index).trim() })
        break
      }
      continue
    }

    // inline @js: / @javascript:
    const isJavascript = remaining.startsWith('@javascript:', marker.index)
    const codeStart = marker.index + (isJavascript ? 12 : 4)
    const jsCode = remaining.substring(codeStart).trim()
    if (jsCode) segments.push({ type: 'js', code: jsCode })
    remaining = ''
  }

  if (iterations >= MAX_ITERATIONS && remaining.trim()) {
    segments.push({ type: 'pure', rule: remaining.trim() })
  }

  return segments
}
