// ============================================
// 段落重排 & 净化 — 对齐 Legado ContentProcessor
//
// 导出两套 API：
// - 异步版：preprocessContent / applyReplaceRules（useReaderContent 用）
//   - 支持 @js: 规则 + Worker 正则匹配
// - 同步版：purifyText / preprocessContentSync / applyReplaceRulesSync
//   - 兼容原 API，供单元测试和纯同步场景使用
//   - @js: 规则跳过（由调用方异步处理）
// ============================================

import { getCachedRegex } from '../../utils/regex-cache.js'

export interface ReplaceRule {
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

/**
 * 正则匹配结果。与 services/regex-worker.ts 的 RegexMatch 结构一致。
 * engine 层独立定义，避免依赖 services。
 */
export interface RegexMatch {
  index: number
  length: number
  /** groups[0] 是全匹配，groups[N] 是第 N 个捕获组 */
  groups: (string | null)[]
}

export interface ReplaceContext {
  chapterTitle: string
  bookName: string
  chapter: unknown
  book: unknown
}

export interface PreprocessOptions {
  chapterTitle: string
  bookName: string
  reSegmentEnabled: boolean
  /** 简繁转换回调。null 或 undefined 表示不转换 */
  convertFn?: ((text: string) => Promise<string>) | null
}

export interface ApplyReplaceRulesOptions {
  rules: ReplaceRule[]
  replaceContext: ReplaceContext
  /** @js: 规则的 JS 执行器（异步） */
  jsExecutor?: ((jsCode: string, matched: string, ctx: ReplaceContext, ruleName: string) => Promise<string>) | null
  /**
   * 正则匹配函数。services 层注入 Worker 实现，以获得超时保护。
   * 无注入时降级为主线程同步匹配（无超时保护）。
   */
  findMatches?: ((text: string, pattern: string, flags: string) => Promise<RegexMatch[]>) | null
}

/**
 * 同步 JS 替换回调（保留原 API 兼容）。
 * @js: 规则执行时的同步替代，返回值直接拼接。
 */
export type JsReplacementFn = (jsCode: string, matched: string) => string

export interface PurifyOptions {
  chapterTitle: string
  bookName: string
  reSegmentEnabled: boolean
  purifyEnabled: boolean
  rules: ReplaceRule[]
  jsReplacementFn?: JsReplacementFn | null
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
  private cached: string | null = null
  private cachedLength = 0

  private markDirty(): void {
    this.cached = null
  }

  append(s: string): void {
    this.chars.push(s)
    this.cachedLength += s.length
    this.markDirty()
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
    this.cachedLength = str.length
    this.markDirty()
  }

  replaceLastChar(ch: string): void {
    const str = this.toString()
    if (str.length > 0) {
      this.chars = [str.substring(0, str.length - 1) + ch]
      this.markDirty()
    }
  }

  toString(): string {
    if (this.cached !== null) return this.cached
    this.cached = this.chars.join('')
    return this.cached
  }

  get length(): number {
    if (this.cached !== null) return this.cached.length
    return this.cachedLength
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

/**
 * 对齐 Java Matcher.appendReplacement 的替换模式展开。
 *
 * Java 语义：
 * - $0         → 全匹配
 * - $1..$N     → 第 N 个捕获组（N < 捕获组数量）
 * - \x         → 字面 x
 * - $ 后跟非数字 → 保持字面
 * - $N 超出范围  → 抛异常（对齐 IndexOutOfBoundsException）
 */
function expandJavaReplacement(replacement: string, groups: (string | null)[]): string {
  if (!replacement) return ''
  if (replacement.indexOf('$') === -1 && replacement.indexOf('\\') === -1) {
    return replacement
  }
  let result = ''
  let i = 0
  while (i < replacement.length) {
    const ch = replacement[i]
    if (ch === '\\') {
      if (i + 1 < replacement.length) {
        result += replacement[i + 1]
        i += 2
      } else {
        result += '\\'
        i++
      }
    } else if (ch === '$') {
      let numStart = i + 1
      let numEnd = numStart
      while (numEnd < replacement.length) {
        const c = replacement[numEnd]
        if (c !== undefined && c >= '0' && c <= '9') {
          numEnd++
        } else {
          break
        }
      }
      if (numEnd > numStart) {
        const numStr = replacement.substring(numStart, numEnd)
        const num = parseInt(numStr, 10)
        if (num >= 0 && num < groups.length) {
          result += groups[num] || ''
          i = numEnd
        } else {
          throw new Error('No group ' + num)
        }
      } else {
        result += ch
        i++
      }
    } else {
      result += ch
      i++
    }
  }
  return result
}

function fallbackFindMatches(text: string, pattern: string, flags: string): RegexMatch[] {
  const re = new RegExp(pattern, flags)
  const matches: RegexMatch[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const groups: (string | null)[] = []
    for (let i = 0; i < m.length; i++) {
      const v = m[i]
      groups.push(v === undefined ? null : v)
    }
    matches.push({ index: m.index, length: m[0].length, groups })
    if (m[0].length === 0) re.lastIndex++
  }
  return matches
}

function isValidPattern(pattern: string, isRegex: boolean): boolean {
  if (!pattern) return false
  if (!isRegex) return true
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern)
  } catch {
    return false
  }
  if (pattern.endsWith('|') && !pattern.endsWith('\\|')) {
    return false
  }
  return true
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
    prefixPattern.lastIndex = 0
    const matchResult = text.match(prefixPattern)
    if (matchResult && matchResult[0]) return text.substring(matchResult[0].length)
  } catch {
    // ignore
  }
  return text
}

// ─── 同步 API ───

/**
 * 同步版预处理：去除重复标题 → reSegment → trim 每行。
 * 不支持异步 convertFn（简繁转换由调用方在外部处理）。
 */
export function preprocessContentSync(rawText: string, options: PreprocessOptions): string {
  if (!rawText) return rawText
  let text = rawText
  try {
    text = removeSameTitle(text, options.chapterTitle, options.bookName)
    if (options.reSegmentEnabled) {
      text = reSegment(text, options.chapterTitle)
      const leadingNewlines = getCachedRegex('^\\n+')
      if (leadingNewlines) {
        leadingNewlines.lastIndex = 0
        text = text.replace(leadingNewlines, '')
      }
    }
    text = text.split('\n').map((l) => l.trim()).join('\n')
  } catch {
    // ignore
  }
  return text
}

/**
 * 同步版替换：只处理非 @js: 规则。
 * @js: 规则由调用方异步执行后，通过 preprocessContentAsync / applyReplaceRules 处理。
 */
export function applyReplaceRulesSync(
  text: string,
  options: {
    rules: ReplaceRule[]
    jsReplacementFn?: JsReplacementFn | null
  },
): string {
  if (!text) return text
  const sortedRules = [...options.rules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  let result = text
  for (const rule of sortedRules) {
    if (!rule.isEnabled || !rule.pattern) continue
    if (!rule.scopeContent && rule.scopeTitle) continue
    if (!isValidPattern(rule.pattern, rule.isRegex)) continue

    const replacement = rule.replacement || ''
    const isJs = replacement.startsWith('@js:')
    const replacement1 = isJs ? replacement.substring(4) : replacement

    if (rule.isRegex) {
      let matches: RegexMatch[]
      try {
        matches = fallbackFindMatches(result, rule.pattern, 'g')
      } catch {
        continue
      }
      let newResult = ''
      let lastIndex = 0
      for (const m of matches) {
        newResult += result.substring(lastIndex, m.index)
        const matchedText = m.groups[0] || ''
        if (isJs) {
          if (options.jsReplacementFn) {
            try {
              newResult += options.jsReplacementFn(replacement1, matchedText)
            } catch {
              newResult += matchedText
            }
          } else {
            newResult += matchedText
          }
        } else {
          try {
            newResult += expandJavaReplacement(replacement1, m.groups)
          } catch {
            newResult = text
            break
          }
        }
        lastIndex = m.index + m.length
      }
      if (newResult) result = newResult + result.substring(lastIndex)
    } else {
      if (isJs) {
        if (options.jsReplacementFn) {
          try {
            result = options.jsReplacementFn(replacement1, result)
          } catch {
            // ignore
          }
        }
      } else {
        result = result.split(rule.pattern).join(replacement)
      }
    }
  }
  return result
}

/**
 * 兼容层：同步版的 purifyText。
 *
 * 保留原有同步语义：
 * - 先 preprocessContentSync（removeSameTitle + reSegment + trim）
 * - 再 applyReplaceRulesSync（非 @js: 规则）
 * - @js: 规则若提供了 jsReplacementFn 则同步执行
 *
 * 对齐原项目的 purifyText 行为。
 */
export function purifyText(rawText: string, options: PurifyOptions): string {
  let text = rawText
  try {
    text = preprocessContentSync(text, {
      chapterTitle: options.chapterTitle,
      bookName: options.bookName,
      reSegmentEnabled: options.reSegmentEnabled,
      convertFn: null,
    })
    if (options.purifyEnabled) {
      text = applyReplaceRulesSync(text, {
        rules: options.rules,
        jsReplacementFn: options.jsReplacementFn ?? null,
      })
    }
  } catch {
    // ignore
  }
  return text
}

// ─── 异步 API ───

async function applySingleRuleAsync(
  text: string,
  rule: ReplaceRule,
  options: ApplyReplaceRulesOptions,
): Promise<string> {
  const replacement = rule.replacement || ''
  if (!rule.pattern) return text

  const isJs = replacement.startsWith('@js:')
  const replacement1 = isJs ? replacement.substring(4) : replacement

  if (rule.isRegex) {
    let matches: RegexMatch[]
    try {
      if (options.findMatches) {
        matches = await options.findMatches(text, rule.pattern, 'g')
      } else {
        matches = fallbackFindMatches(text, rule.pattern, 'g')
      }
    } catch {
      return text
    }

    let result = ''
    let lastIndex = 0
    for (const m of matches) {
      result += text.substring(lastIndex, m.index)
      const matchedText = m.groups[0] || ''
      if (isJs) {
        if (options.jsExecutor) {
          try {
            const repl = await options.jsExecutor(replacement1, matchedText, options.replaceContext, rule.name || '')
            result += repl
          } catch {
            return text
          }
        } else {
          result += matchedText
        }
      } else {
        try {
          result += expandJavaReplacement(replacement1, m.groups)
        } catch {
          return text
        }
      }
      lastIndex = m.index + m.length
    }
    result += text.substring(lastIndex)
    return result
  }

  if (isJs) {
    if (options.jsExecutor) {
      try {
        const repl = await options.jsExecutor(replacement1, text, options.replaceContext, rule.name || '')
        return repl || text
      } catch {
        return text
      }
    }
    return text
  }
  return text.split(rule.pattern).join(replacement)
}

/**
 * 异步版预处理：去除重复标题 → reSegment → 简繁转换 → trim 每行。
 */
export async function preprocessContent(rawText: string, options: PreprocessOptions): Promise<string> {
  if (!rawText) return rawText
  let text = rawText
  try {
    text = removeSameTitle(text, options.chapterTitle, options.bookName)
    if (options.reSegmentEnabled) {
      text = reSegment(text, options.chapterTitle)
      const leadingNewlines = getCachedRegex('^\\n+')
      if (leadingNewlines) {
        leadingNewlines.lastIndex = 0
        text = text.replace(leadingNewlines, '')
      }
    }
    if (options.convertFn) {
      try {
        text = await options.convertFn(text)
      } catch {
        // ignore
      }
    }
    text = text.split('\n').map((l) => l.trim()).join('\n')
  } catch {
    // ignore
  }
  return text
}

/**
 * 异步版单循环执行替换规则，按 order 排序。
 */
export async function applyReplaceRules(text: string, options: ApplyReplaceRulesOptions): Promise<string> {
  if (!text) return text
  const sortedRules = [...options.rules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  let result = text
  for (const rule of sortedRules) {
    if (!rule.isEnabled || !rule.pattern) continue
    if (!rule.scopeContent && rule.scopeTitle) continue
    if (!isValidPattern(rule.pattern, rule.isRegex)) continue
    try {
      result = await applySingleRuleAsync(result, rule, options)
    } catch {
      // ignore
    }
  }
  return result
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
  if (doubleNewlines) {
    doubleNewlines.lastIndex = 0
    result = result.replace(doubleNewlines, '</p><p>')
  }
  if (singleNewlines) {
    singleNewlines.lastIndex = 0
    result = result.replace(singleNewlines, '<br>')
  }
  return result + '</p>'
}
