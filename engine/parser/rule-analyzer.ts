// ============================================
// RuleAnalyzer — 规则字符串拆分（对齐 Legado）
// ============================================

const ESC = '\\'

export class RuleAnalyzer {
  private queue: string
  private pos = 0
  private start = 0
  private startX = 0
  private rule: string[] = []
  private step = 0
  elementsType = ''
  private code: boolean
  private isFirstSplitCall = true

  constructor(data: string, code = false) {
    this.queue = data
    this.code = code
  }

  trim(): void {
    if (this.pos >= this.queue.length) return
    const ch = this.queue[this.pos]
    if (ch !== undefined && (ch === '@' || ch < '!')) {
      this.pos++
      while (this.pos < this.queue.length) {
        const c = this.queue[this.pos]
        if (c !== undefined && (c === '@' || c < '!')) this.pos++
        else break
      }
      this.start = this.pos
      this.startX = this.pos
    }
  }

  reSetPos(): void {
    this.pos = 0
    this.startX = 0
    this.isFirstSplitCall = true
  }

  private consumeTo(seq: string): boolean {
    this.start = this.pos
    const offset = this.queue.indexOf(seq, this.pos)
    if (offset !== -1) {
      this.pos = offset
      return true
    }
    return false
  }

  private consumeToAny(...seq: string[]): boolean {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) {
        if (this.queue.substring(pos, pos + s.length) === s) {
          this.step = s.length
          this.pos = pos
          return true
        }
      }
      pos++
    }
    return false
  }

  private findToAny(...seq: string[]): number {
    let pos = this.pos
    while (pos !== this.queue.length) {
      for (const s of seq) {
        const ch = this.queue[pos]
        if (ch !== undefined && ch === s) return pos
      }
      pos++
    }
    return -1
  }

  private chompCodeBalanced(open: string, close: string): boolean {
    let pos = this.pos
    let depth = 0
    let otherDepth = 0
    let inSingleQuote = false
    let inDoubleQuote = false

    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c === undefined) break
      if (c !== ESC) {
        if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
        else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

        if (inSingleQuote || inDoubleQuote) continue

        if (c === '[') depth++
        else if (c === ']') depth--
        else if (depth === 0) {
          if (c === open) otherDepth++
          else if (c === close) otherDepth--
        }
      } else pos++
    } while (depth > 0 || otherDepth > 0)

    if (depth > 0 || otherDepth > 0) return false
    this.pos = pos
    return true
  }

  private chompRuleBalanced(open: string, close: string): boolean {
    let pos = this.pos
    let depth = 0
    let inSingleQuote = false
    let inDoubleQuote = false

    do {
      if (pos === this.queue.length) break
      const c = this.queue[pos++]
      if (c === undefined) break
      if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
      else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

      if (inSingleQuote || inDoubleQuote) continue
      else if (c === '\\') {
        pos++
        continue
      }

      if (c === open) depth++
      else if (c === close) depth--
    } while (depth > 0)

    if (depth > 0) return false
    this.pos = pos
    return true
  }

  private get chompBalanced() {
    return this.code
      ? (open: string, close: string) => this.chompCodeBalanced(open, close)
      : (open: string, close: string) => this.chompRuleBalanced(open, close)
  }

  splitRule(...split: string[]): string[] {
    // 只在首次调用时重置规则列表和位置
    if (this.isFirstSplitCall) {
      this.rule = []
      this.isFirstSplitCall = false
      this.trim()
    }

    if (this.queue.length === 0 || this.startX >= this.queue.length) {
      return this.rule
    }

    if (split.length === 1) {
      const firstSplit = split[0]
      if (firstSplit === undefined) return []
      this.elementsType = firstSplit
      if (!this.consumeTo(this.elementsType)) {
        this.rule.push(this.queue.substring(this.startX))
        return this.rule
      }
      this.step = this.elementsType.length
      return this.splitRuleNext()
    }

    if (!this.consumeToAny(...split)) {
      this.rule.push(this.queue.substring(this.startX))
      return this.rule
    }

    const end = this.pos
    this.pos = this.start

    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule = [this.queue.substring(this.startX, end)]
        const et = this.queue.substring(end, end + this.step)
        this.elementsType = et
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      if (st > end) {
        this.rule = [this.queue.substring(this.startX, end)]
        this.elementsType = this.queue.substring(end, end + this.step)
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        if (this.pos > st) {
          this.startX = this.start
          return this.splitRuleNext()
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      this.pos = st
      const ch = this.queue[this.pos]
      if (ch === undefined) break
      const next = ch === '[' ? ']' : ')'
      if (!this.chompBalanced(ch, next)) {
        throw new Error(this.queue.substring(0, this.start) + '后未平衡')
      }
    } while (end > this.pos)

    this.start = this.pos
    return this.splitRule(...split)
  }

  private splitRuleNext(): string[] {
    const end = this.pos
    this.pos = this.start

    do {
      const st = this.findToAny('[', '(')
      if (st === -1) {
        this.rule.push(this.queue.substring(this.startX, end))
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      if (st > end) {
        this.rule.push(this.queue.substring(this.startX, end))
        this.pos = end + this.step
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos))
          this.pos += this.step
        }
        if (this.pos > st) {
          this.startX = this.start
          return this.splitRuleNext()
        }
        this.rule.push(this.queue.substring(this.pos))
        return this.rule
      }
      this.pos = st
      const ch = this.queue[this.pos]
      if (ch === undefined) break
      const next = ch === '[' ? ']' : ')'
      if (!this.chompBalanced(ch, next)) {
        throw new Error(this.queue.substring(0, this.start) + '后未平衡')
      }
    } while (end > this.pos)

    this.start = this.pos
    if (!this.consumeTo(this.elementsType)) {
      this.rule.push(this.queue.substring(this.startX))
      return this.rule
    }
    return this.splitRuleNext()
  }

  innerRule(
    inner: string,
    startStep = 1,
    endStep = 1,
    fr: (inner: string) => string | null | undefined,
  ): string {
    const st: string[] = []
    while (this.consumeTo(inner)) {
      const posPre = this.pos
      if (this.chompCodeBalanced('{', '}')) {
        const innerRuleStr = this.queue.substring(posPre + startStep, this.pos - endStep)
        const frv = fr(innerRuleStr)
        if (frv) {
          st.push(this.queue.substring(this.startX, posPre) + frv)
          this.startX = this.pos
          continue
        }
      }
      this.pos += inner.length
    }
    if (this.startX === 0) return ''
    st.push(this.queue.substring(this.startX))
    return st.join('')
  }

  innerRuleWithBounds(
    startStr: string,
    endStr: string,
    fr: (inner: string) => string | null | undefined,
  ): string {
    const st: string[] = []
    while (this.consumeTo(startStr)) {
      this.pos += startStr.length
      const posPre = this.pos
      if (this.consumeTo(endStr)) {
        const frv = fr(this.queue.substring(posPre, this.pos))
        st.push(
          this.queue.substring(this.startX, posPre - startStr.length) + (frv || '')
        )
        this.pos += endStr.length
        this.startX = this.pos
      }
    }
    if (this.startX === 0) return this.queue
    st.push(this.queue.substring(this.startX))
    return st.join('')
  }
}
