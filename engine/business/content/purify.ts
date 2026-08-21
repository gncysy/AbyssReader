// ============================================
// 段落重排 & 净化 — 对齐 Legado ContentHelp
// ============================================

import { getCachedRegex } from '../../utils/regex-cache.js'

interface ReplaceRule {
  id?: number
  name?: string
  pattern: string
  replacement: string
  isEnabled: boolean
  isRegex: boolean
  scopeTitle?: boolean
  scopeContent?: boolean
  timeoutMillisecond?: number
  order?: number
  [key: string]: unknown
}

const MARK_SENTENCES_END = '？。！?!~'
const MARK_SENTENCES_END_P = '.？。！?!~'
const MARK_SENTENCES_MID = '.，、,—…'
const MARK_SENTENCES_SAY = '问说喊唱叫骂道着答'
const MARK_QUOTATION_BEFORE = '，：,:'
const MARK_QUOTATION = '"' + "'" + '\u201C\u201D'
const MARK_QUOTATION_RIGHT = '"' + '\u201D'
const WORD_MAX_LENGTH = 16
const FORCE_SPLIT_DEFAULT_GAIN = 3
const FORCE_SPLIT_DEFAULT_MIN = 0
const FORCE_SPLIT_DEFAULT_TRIGGER = 2
const FORCE_SPLIT_QUOTE_GAIN = 4
const FORCE_SPLIT_QUOTE_MIN = 2
const FORCE_SPLIT_QUOTE_TRIGGER = 4
const REPLACE_TIMEOUT_DEFAULT = 5000

function sAt(str: string, index: number): string {
  if (index < 0 || index >= str.length) return ''
  return str[index] || ''
}

function nAt(arr: number[], index: number): number {
  return arr[index] || 0
}

function strAt(arr: string[], index: number): string {
  return arr[index] || ''
}

function match(rule: string, chr: string): boolean {
  return rule.indexOf(chr) !== -1
}

function createSeededRandom(seed: string): () => number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return () => {
    hash ^= hash << 13
    hash ^= hash >>> 17
    hash ^= hash << 5
    hash = hash >>> 0
    return hash / 4294967296
  }
}

function seekLast(str: string, key: string, from: number, to: number): number {
  if (str.length - from < 1) return -1
  let i = str.length - 1
  if (from < i && i > 0) i = from
  let t = 0
  if (to > 0) t = to
  while (i > t) {
    if (key.indexOf(sAt(str, i)) !== -1) return i
    i--
  }
  return -1
}

function seekIndex(str: string, key: string, from: number, to: number, inOrder: boolean): number {
  if (str.length - from < 1) return -1
  let i = 0
  if (from > 0) i = from
  const t = Math.min(str.length, to > 0 ? to : str.length)
  while (i < t) {
    const c = inOrder ? sAt(str, i) : sAt(str, str.length - i - 1)
    if (key.indexOf(c) !== -1) return i
    i++
  }
  return -1
}

function seekIndexes(str: string, key: string, from: number, to: number, inOrder: boolean): number[] {
  const list: number[] = []
  if (str.length - from < 1) return list
  let i = from > 0 ? from : 0
  const t = Math.min(str.length, to > 0 ? to : str.length)
  while (i < t) {
    const c = inOrder ? sAt(str, i) : sAt(str, str.length - i - 1)
    if (key.indexOf(c) !== -1) {
      if (list.length > 0 && i - (list[list.length - 1] || 0) === 1) {
        list[list.length - 1] = i
      } else {
        list.push(i)
      }
    }
    i++
  }
  return list
}

function makeDict(str: string): string[] {
  const regex = getCachedRegex('(?<=["' + "'" + '\u201C\u201D])([^\\n\\p{P}]{1,' + WORD_MAX_LENGTH + '})(?=["' + "'" + '\u201C\u201D])', 'gu')
  if (!regex) return []
  const cache: string[] = []
  const dict: string[] = []
  let matcher: RegExpExecArray | null
  while ((matcher = regex.exec(str)) !== null) {
    const word = matcher[0]
    if (cache.includes(word)) {
      if (!dict.includes(word)) dict.push(word)
    } else {
      cache.push(word)
    }
  }
  return dict
}

function forceSplit(
  str: string,
  offset: number,
  min: number,
  gain: number,
  trigger: number,
  random: () => number,
): number[] {
  const result: number[] = []
  const arrayEnd = seekIndexes(str, MARK_SENTENCES_END_P, 0, str.length - 2, true)
  const arrayMid = seekIndexes(str, MARK_SENTENCES_MID, 0, str.length - 2, true)
  if (arrayEnd.length < trigger && arrayMid.length < trigger * 3) return result
  let j = 0
  let i = min
  while (i < arrayEnd.length) {
    let k = 0
    while (j < arrayMid.length) {
      if (nAt(arrayMid, j) < nAt(arrayEnd, i)) k++
      j++
    }
    if (random() * gain < 0.8 + k / 2.5) {
      result.push(nAt(arrayEnd, i) + offset)
      i = Math.max(i + min, i)
    }
    i++
  }
  return result
}

const PARAGRAPH_DIAGLOG_KEY = '^["\\u201C\\u201D][^"\\u201C\\u201D]+["\\u201C\\u201D]$'

function isParagraphDialog(str: string): boolean {
  const regex = getCachedRegex(PARAGRAPH_DIAGLOG_KEY)
  return regex ? regex.test(str) : false
}

function splitQuote(str: string): string {
  const length = str.length
  if (length < 3) return str
  if (match(MARK_QUOTATION, sAt(str, 0))) {
    const i = seekIndex(str, MARK_QUOTATION, 1, length - 2, true) + 1
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, sAt(str, i - 1))) {
      return str.substring(0, i) + '\n' + str.substring(i)
    }
  } else if (match(MARK_QUOTATION, sAt(str, length - 1))) {
    const i = length - 1 - seekIndex(str, MARK_QUOTATION, 1, length - 2, false)
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, sAt(str, i - 1))) {
      return str.substring(0, i) + '\n' + str.substring(i)
    }
  }
  return str
}

class StringBuilder {
  private chars: string[] = []

  append(s: string): void {
    this.chars.push(s)
  }

  charAt(index: number): string {
    const str = this.toString()
    return index >= 0 && index < str.length ? (str[index] || '') : ''
  }

  setCharAt(index: number, ch: string): void {
    const str = this.toString()
    const arr = str.split('')
    if (index >= 0 && index < arr.length) {
      arr[index] = ch
    }
    this.chars = [arr.join('')]
  }

  replaceLastChar(ch: string): void {
    const str = this.toString()
    if (str.length > 0) {
      this.chars = [str.substring(0, str.length - 1) + ch]
    }
  }

  toString(): string {
    return this.chars.join('')
  }

  get length(): number {
    return this.toString().length
  }

  last(): string {
    const s = this.toString()
    return s.length > 0 ? (s[s.length - 1] || '') : ''
  }
}

function reduceLength(str: StringBuilder): StringBuilder {
  const p = str.toString().split('\n')
  const l = p.length
  const b: boolean[] = new Array(l)
  for (let i = 0; i < l; i++) {
    b[i] = isParagraphDialog(strAt(p, i))
  }
  let dialogue = 0
  for (let i = 0; i < l; i++) {
    if (b[i]) {
      if (dialogue < 0) dialogue = 1
      else if (dialogue < 2) dialogue++
    } else {
      if (dialogue > 1) {
        p[i] = splitQuote(strAt(p, i))
        dialogue--
      } else if (dialogue > 0 && i < l - 2) {
        if (b[i + 1]) p[i] = splitQuote(strAt(p, i))
      }
    }
  }
  const string = new StringBuilder()
  for (let i = 0; i < l; i++) {
    string.append('\n')
    string.append(strAt(p, i))
  }
  return string
}

function findNewLines(str: string, dict: string[], random: () => number): string {
  const string = new StringBuilder()
  string.append(str)
  const arrayQuote: number[] = []
  let insN: number[] = []
  const mod: number[] = new Array(str.length).fill(0)
  let waitClose = false

  for (let i = 0; i < str.length; i++) {
    const c = sAt(str, i)
    if (match(MARK_QUOTATION, c)) {
      const size = arrayQuote.length
      if (size > 0) {
        const quotePre = arrayQuote[size - 1] || 0
        if (i - quotePre === 2) {
          let remove = false
          if (waitClose) {
            if (match(',，、/', sAt(str, i - 1))) remove = true
          } else if (match(',，、/和与或', sAt(str, i - 1))) {
            remove = true
          }
          if (remove) {
            string.setCharAt(i, '\u201C')
            string.setCharAt(i - 2, '\u201D')
            arrayQuote.splice(size - 1, 1)
            mod[size - 1] = 1
            if (size < mod.length) mod[size] = -1
            continue
          }
        }
      }
      arrayQuote.push(i)
      if (i > 1) {
        const charB1 = sAt(str, i - 1)
        let charB2 = '\x00'
        if (match(MARK_QUOTATION_BEFORE, charB1)) {
          if (arrayQuote.length > 1) {
            const lastQuote = arrayQuote[arrayQuote.length - 2] || 0
            let p = 0
            if (charB1 === ',' || charB1 === '，') {
              if (arrayQuote.length > 2) {
                p = arrayQuote[arrayQuote.length - 3] || 0
                if (p > 0) charB2 = sAt(str, p - 1)
              }
            }
            if (match(MARK_SENTENCES_END_P, charB2)) {
              insN.push(p - 1)
            } else if (!match('的', charB2)) {
              const lastEnd = seekLast(str, MARK_SENTENCES_END, i, lastQuote)
              if (lastEnd > 0) insN.push(lastEnd)
              else insN.push(lastQuote)
            }
          }
          waitClose = true
          mod[size] = 1
          if (size > 0) {
            mod[size - 1] = -1
            if (size > 1) mod[size - 2] = 1
          }
        } else if (waitClose) {
          waitClose = false
          insN.push(i)
        }
      }
    }
  }
  const size = arrayQuote.length
  let opend = false
  if (size > 0) {
    for (let i = 0; i < size; i++) {
      const m = mod[i] || 0
      if (m > 0) opend = true
      else if (m < 0) {
        if (!opend && i > 0) mod[i] = 3
        opend = false
      } else {
        opend = !opend
        mod[i] = opend ? 2 : -2
      }
    }
    if (opend) {
      const lastQuote = arrayQuote[size - 1] || 0
      if (lastQuote - string.length > -3) {
        if (size > 1) mod[size - 2] = 4
        mod[size - 1] = -4
      } else if (!match(MARK_SENTENCES_SAY, sAt(string.toString(), string.length - 2))) {
        string.append('\u201D')
      }
    }
    let loop2Mod1 = -1
    let i = 0
    let j = (arrayQuote[0] || 0) - 1
    if (j < 0) { i = 1; loop2Mod1 = 0 }
    while (i < size) {
      j = (arrayQuote[i] || 0) - 1
      const loop2Mod2 = mod[i] || 0
      if (loop2Mod1 < 0 && loop2Mod2 > 0) {
        if (match(MARK_SENTENCES_END, sAt(string.toString(), j))) insN.push(j)
      }
      loop2Mod1 = loop2Mod2
      i++
    }
  }

  const insN1: number[] = []
  for (const n of insN) {
    if (match('"\'"\u201C\u201D', sAt(string.toString(), n))) {
      const start = seekLast(str, '"' + "'" + '\u201C\u201D', n - 1, n - WORD_MAX_LENGTH)
      if (start > 0) {
        const word = str.substring(start + 1, n)
        if (dict.includes(word)) continue
        if (match('的地得', sAt(str, start))) continue
      }
    }
    insN1.push(n)
  }
  insN = [...new Set(insN1)].sort((a, b) => a - b)

  const s = string.toString()
  let j = 0
  let progress = 0
  let nextLine = -1
  if (insN.length > 0) nextLine = insN[j] || 0

  for (let ai = 0; ai < arrayQuote.length; ai++) {
    const quote = arrayQuote[ai] || 0
    const isBeforeQuote = quote > 0
    const gain = isBeforeQuote ? FORCE_SPLIT_QUOTE_GAIN : FORCE_SPLIT_DEFAULT_GAIN
    const min = isBeforeQuote ? FORCE_SPLIT_QUOTE_MIN : FORCE_SPLIT_DEFAULT_MIN
    const trigger = isBeforeQuote ? FORCE_SPLIT_QUOTE_TRIGGER : FORCE_SPLIT_DEFAULT_TRIGGER

    while (j < insN.length) {
      if (nextLine >= quote) break
      nextLine = insN[j] || 0
      if (progress < nextLine) {
        const subs = s.substring(progress, nextLine)
        insN.push(...forceSplit(subs, progress, min, gain, trigger, random))
        progress = nextLine + 1
      }
      j++
    }
    if (progress < quote) {
      const subs = s.substring(progress, quote + 1)
      insN.push(...forceSplit(subs, progress, min, gain, trigger, random))
      progress = quote + 1
    }
  }
  while (j < insN.length) {
    nextLine = insN[j] || 0
    if (progress < nextLine) {
      const subs = s.substring(progress, nextLine)
      insN.push(...forceSplit(subs, progress, FORCE_SPLIT_DEFAULT_MIN, FORCE_SPLIT_DEFAULT_GAIN, FORCE_SPLIT_DEFAULT_TRIGGER, random))
      progress = nextLine + 1
    }
    j++
  }
  if (progress < s.length) {
    const subs = s.substring(progress, s.length)
    insN.push(...forceSplit(subs, progress, FORCE_SPLIT_DEFAULT_MIN, FORCE_SPLIT_DEFAULT_GAIN, FORCE_SPLIT_DEFAULT_TRIGGER, random))
  }

  const insQuote: boolean[] = new Array(size).fill(false)
  opend = false
  for (let i = 0; i < size; i++) {
    const p = arrayQuote[i] || 0
    const m = mod[i] || 0
    if (m > 0) {
      string.setCharAt(p, '\u201C')
      if (opend) insQuote[i] = true
      opend = true
    } else if (m < 0) {
      string.setCharAt(p, '\u201D')
      opend = false
    } else {
      opend = !opend
      string.setCharAt(p, opend ? '\u201C' : '\u201D')
    }
  }
  insN = [...new Set(insN)].sort((a, b) => a - b)

  const buffer = new StringBuilder()
  j = 0
  progress = 0
  nextLine = -1
  if (insN.length > 0) nextLine = insN[j] || 0
  for (let i = 0; i < arrayQuote.length; i++) {
    const quote = arrayQuote[i] || 0
    while (j < insN.length) {
      if (nextLine >= quote) break
      nextLine = insN[j] || 0
      buffer.append(string.toString().substring(progress, nextLine + 1))
      buffer.append('\n')
      progress = nextLine + 1
      j++
    }
    if (progress < quote) {
      buffer.append(string.toString().substring(progress, quote + 1))
      progress = quote + 1
    }
    if (insQuote[i] && buffer.length > 2) {
      const bufStr = buffer.toString()
      if (bufStr.length > 0 && bufStr[bufStr.length - 1] === '\n') buffer.append('\u201C')
      else if (bufStr.length > 0) {
        buffer.replaceLastChar('\u201D\n' + sAt(bufStr, bufStr.length - 1))
      }
    }
  }
  while (j < insN.length) {
    nextLine = insN[j] || 0
    if (progress <= nextLine) {
      buffer.append(string.toString().substring(progress, nextLine + 1))
      buffer.append('\n')
      progress = nextLine + 1
    }
    j++
  }
  if (progress < string.length) {
    buffer.append(string.toString().substring(progress))
  }
  return buffer.toString()
}

export function reSegment(content: string, chapterName: string): string {
  if (!content) return content
  try {
    let content1 = content
    const dict = makeDict(content1)
    const random = createSeededRandom(content1)

    const quoteReplaceRegex = getCachedRegex('["\\u201C\\u201D]+\\s*["\\u201C\\u201D][\\s"\\u201C\\u201D]*', 'g')
    const quoteWithPunctRegex = getCachedRegex('["\\u201C\\u201D]+(？。！?!~)["\\u201C\\u201D]+', 'g')
    const quotePunctBeforeRegex = getCachedRegex('["\\u201C\\u201D]+(？。！?!~)([^"\\u201C\\u201D])', 'g')
    const sayPunctRegex = getCachedRegex('([问说喊唱叫骂道着答])[.。]', 'g')

    let p = content1
    if (quoteReplaceRegex) p = p.replace(quoteReplaceRegex, '\u201D\n\u201C')
    if (quoteWithPunctRegex) p = p.replace(quoteWithPunctRegex, '\u201D$1\n\u201C')
    if (quotePunctBeforeRegex) p = p.replace(quotePunctBeforeRegex, '\u201D$1\n$2')
    if (sayPunctRegex) p = p.replace(sayPunctRegex, '$1。\n')

    const paragraphs = p.split(/\n(\s*)/)

    let buffer = new StringBuilder()
    buffer.append('  ')
    if (chapterName.trim() !== strAt(paragraphs, 0).trim()) {
      buffer.append(strAt(paragraphs, 0).replace(/[\u3000\s]+/g, ''))
    }

    for (let i = 1; i < paragraphs.length; i++) {
      if (
        match(MARK_SENTENCES_END, buffer.last()) ||
        (match(MARK_QUOTATION_RIGHT, buffer.last()) &&
          buffer.length >= 2 &&
          match(MARK_SENTENCES_END, sAt(buffer.toString(), buffer.length - 2)))
      ) {
        buffer.append('\n')
      }
      buffer.append(strAt(paragraphs, i).replace(/[\u3000\s]+/g, ''))
    }

    const htmlReplace1 = getCachedRegex('["\\u201C\\u201D]+\\s*["\\u201C\\u201D]+', 'g')
    const htmlReplace2 = getCachedRegex('["\\u201C\\u201D]+(？。！?!~)["\\u201C\\u201D]+', 'g')
    const htmlReplace3 = getCachedRegex('["\\u201C\\u201D]+(？。！?!~)([^"\\u201C\\u201D])', 'g')
    const htmlReplace4 = getCachedRegex('([问说喊唱叫骂道着答])[.。]', 'g')
    const htmlReplace5 = getCachedRegex('\\n["\\u201C\\u201D]([^\\n"\\u201C\\u201D]+)([,:，：]["\\u201C\\u201D])([^\\n"\\u201C\\u201D]+)', 'g')
    const htmlReplace6 = getCachedRegex('\\n(\\s*)', 'g')

    let text = buffer.toString()
    if (htmlReplace1) text = text.replace(htmlReplace1, '\u201D\n\u201C')
    if (htmlReplace2) text = text.replace(htmlReplace2, '\u201D$1\n\u201C')
    if (htmlReplace3) text = text.replace(htmlReplace3, '\u201D$1\n$2')
    if (htmlReplace4) text = text.replace(htmlReplace4, '$1。\n')
    if (htmlReplace5) text = text.replace(htmlReplace5, '\n$1：\u201C$3')
    if (htmlReplace6) text = text.replace(htmlReplace6, '\n')

    const textParagraphs = text.split('\n')

    buffer = new StringBuilder()
    for (const s of textParagraphs) {
      buffer.append('\n')
      buffer.append(findNewLines(s, dict, random))
    }
    buffer = reduceLength(buffer)
    content1 = buffer.toString()
    const finalReplace1 = getCachedRegex('^\\s+')
    const finalReplace2 = getCachedRegex('\\s*["\\u201C\\u201D]+\\s*["\\u201C\\u201D][\\s"\\u201C\\u201D]*', 'g')
    const finalReplace3 = getCachedRegex('[:：]["\\u201C\\u201D\\s]+', 'g')
    const finalReplace4 = getCachedRegex('\\n(\\s*)', 'g')
    if (finalReplace1) content1 = content1.replace(finalReplace1, '')
    if (finalReplace2) content1 = content1.replace(finalReplace2, '\u201D\n\u201C')
    if (finalReplace3) content1 = content1.replace(finalReplace3, '：\u201C')
    if (finalReplace4) content1 = content1.replace(finalReplace4, '\n')
    return content1
  } catch {
    return content
  }
}

interface PurifyRule {
  pattern: string
  replacement: string
  isRegex: boolean
  timeoutMs: number
}

function execJsReplacement(jsCode: string, matched: string): string {
  try {
    const code = jsCode
      .replace(/^@js:\s*/, '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '')
      .trim()
    const fn = new Function('result', code + '; return result')
    const r = fn(matched)
    if (r !== undefined && r !== null && r !== '' && r !== matched) return String(r).replace(/\$/g, '$$$$')
    return matched
  } catch {
    return matched
  }
}

function applyReplaceRuleSync(text: string, rule: PurifyRule): string {
  const start = Date.now()
  const timeout = rule.timeoutMs > 0 ? rule.timeoutMs : REPLACE_TIMEOUT_DEFAULT

  try {
    const replacement = rule.replacement || ''
    const isJsReplace = replacement.startsWith('@js:') || replacement.startsWith('<js>')

    if (rule.isRegex) {
      const re = getCachedRegex(rule.pattern, 'g')
      if (!re) return text
      re.lastIndex = 0
      const result = text.replace(re, (match) => {
        if (Date.now() - start > timeout) throw new Error('timeout')
        return isJsReplace ? execJsReplacement(replacement, match) : replacement
      })
      return result
    }

    return text.split(rule.pattern).join(replacement)
  } catch {
    return text
  }
}

function removeSameTitle(text: string, chapterTitle: string, bookName: string): string {
  if (!chapterTitle || !text) return text
  try {
    const escapedTitle = chapterTitle
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\\\s*')
    const escapedName = bookName ? bookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
    const pattern = escapedName
      ? '^(\\s|[\\p{P}])*(' + escapedName + ')*(\\s)*' + escapedTitle + '(\\s)*'
      : '^(\\s|[\\p{P}])*' + escapedTitle + '(\\s)*'
    const prefixPattern = getCachedRegex(pattern, 'u')
    if (!prefixPattern) return text
    const match = text.match(prefixPattern)
    if (match && match[0]) return text.substring(match[0].length)
  } catch {
    // ignore
  }
  return text
}

export interface PurifyOptions {
  chapterTitle: string
  bookName: string
  reSegmentEnabled: boolean
  purifyEnabled: boolean
  rules: ReplaceRule[]
}

export function purifyText(rawText: string, options: PurifyOptions): string {
  let text = rawText
  try {
    text = removeSameTitle(text, options.chapterTitle, options.bookName)
    if (options.reSegmentEnabled) {
      text = reSegment(text, options.chapterTitle)
      const leadingNewlines = getCachedRegex('^\\n+')
      if (leadingNewlines) text = text.replace(leadingNewlines, '')
    }
    if (options.purifyEnabled) {
      for (const rule of options.rules) {
        if (!rule.isEnabled || !rule.pattern) continue
        if (!rule.scopeContent && rule.scopeTitle) continue
        const newText = applyReplaceRuleSync(text, {
          pattern: rule.pattern,
          replacement: rule.replacement || '',
          isRegex: rule.isRegex,
          timeoutMs: rule.timeoutMillisecond || REPLACE_TIMEOUT_DEFAULT,
        })
        if (newText) text = newText
      }
    }
  } catch {
    // ignore
  }
  return text
}

export function textToHtml(text: string): string {
  const INDENT = '\u3000\u3000'
  text = text
    .split('\n')
    .map((l) => (l.trim() ? INDENT + l.trim() : ''))
    .join('\n')
  const doubleNewlines = getCachedRegex('\\n\\n', 'g')
  const singleNewlines = getCachedRegex('\\n', 'g')
  let result = '<p>' + text
  if (doubleNewlines) result = result.replace(doubleNewlines, '</p><p>')
  if (singleNewlines) result = result.replace(singleNewlines, '<br>')
  return result + '</p>'
}
