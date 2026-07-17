import * as cheerio from 'cheerio'

export interface ParsedRule {
  type: 'css' | 'xpath' | 'json' | 'js' | 'regex' | 'text'
  expression: string
  attribute?: string | null
  cleanPattern?: string | null
  cleanReplacement?: string | null
  flags?: string | null
  original: string
}

/**
 * 解析 CSS 规则字符串，提取选择器和属性
 * 
 * 支持格式：
 * - "@CSS:selector@attr" 显式 CSS 模式
 * - "selector@attr" 属性提取
 * - "selector@tag.xxx" 按标签名筛选
 * - "selector@js:code" JS 处理
 * - "@@selector" 强制 CSS（去掉 @@ 前缀）
 */
export function parseCss(rule: string): ParsedRule {
  let expression = rule
  let attribute: string | null = null

  // @CSS: 前缀
  if (expression.toLowerCase().startsWith('@css:')) {
    expression = expression.substring(5).trim()
  }

  // @@ 前缀 → 强制 CSS 模式
  if (expression.startsWith('@@')) {
    expression = expression.substring(2).trim()
  }

  // 查找最后一个 @ 后面的属性
  const atIdx = expression.lastIndexOf('@')
  if (atIdx > 0) {
    const before = expression.substring(0, atIdx)
    const after = expression.substring(atIdx + 1)

    if (after.toLowerCase().startsWith('tag.')) {
      // tag.xxx → 按标签名筛选
      attribute = after
      expression = before.trim()
    } else if (after.toLowerCase().startsWith('js:')) {
      // js: → JS 处理，保留整体
      attribute = after
      expression = before.trim()
    } else if (/^[a-zA-Z_-]+$/.test(after)) {
      // 简单属性名
      // 检查前一个 @ 是否存在（处理 tag.div@attr 形式）
      const secondAt = before.lastIndexOf('@')
      if (secondAt > 0) {
        const tagName = before.substring(secondAt + 1)
        expression = before.substring(0, secondAt) + ' ' + tagName
        attribute = after
      } else {
        attribute = after
        expression = before.trim()
      }
    }
  }

  return {
    type: 'css',
    expression: expression.trim(),
    attribute,
    cleanPattern: null,
    cleanReplacement: null,
    flags: null,
    original: rule,
  }
}

/**
 * 解析索引选择器，支持 legado 格式：
 * - tag.div.-1:10:2  (阅读原有写法，: 分隔索引)
 * - tag.div!0:3      (! 排除模式)
 * - tag.div[-1, 3:-2:10, 2]  (类 JsonPath 写法)
 * - tag.div[-1:0]    (反向)
 * 
 * 返回 { baseSelector, indexMode, indexes }
 * indexMode: '.' 选择, '!' 排除, '' 无索引
 */
function processIndexSelector(selector: string): { baseSelector: string; indexMode: string; indexes: number[] } | null {
  // 先检查 [] 写法
  const bracketMatch = selector.match(/^(.*?)\[([^\]]+)\]$/)
  if (bracketMatch) {
    const baseSelector = bracketMatch[1]
    const indexContent = bracketMatch[2]
    let indexMode = '.'
    let indexStr = indexContent
    if (indexStr.startsWith('!')) {
      indexMode = '!'
      indexStr = indexStr.substring(1)
    }
    const indexes: number[] = []
    const parts = indexStr.split(',').map(s => s.trim())
    for (const part of parts) {
      if (part.includes(':')) {
        // 区间 start:end:step 或 start:end
        const segs = part.split(':').map(s => s.trim())
        const start = segs[0] ? parseInt(segs[0], 10) : 0
        const end = segs[1] ? parseInt(segs[1], 10) : -1
        const step = segs[2] ? Math.abs(parseInt(segs[2], 10)) : 1
        if (end >= start) {
          for (let i = start; i <= end; i += step) indexes.push(i)
        } else {
          for (let i = start; i >= end; i -= step) indexes.push(i)
        }
      } else {
        indexes.push(parseInt(part, 10))
      }
    }
    return { baseSelector, indexMode, indexes }
  }

  // 检查 : 或 ! 或 . 写法（阅读原有格式）
  const legacyMatch = selector.match(/^(.*?)([!.])([0-9:,.\-]+)$/)
  if (legacyMatch) {
    const baseSelector = legacyMatch[1]
    const indexMode = legacyMatch[2]
    const indexStr = legacyMatch[3]
    if (indexMode === '.' && /^\d+$/.test(indexStr)) {
      // 单个正数，后面可能跟 .xxx 的属性，不是索引
      return null
    }
    const indexes = indexStr.split(':').map(s => parseInt(s, 10)).filter(n => !isNaN(n))
    return { baseSelector, indexMode, indexes }
  }

  return null
}

/**
 * 从 cheerio 元素中提取值
 */
function extractValue($: cheerio.CheerioAPI, el: any, attribute?: string | null): any {
  if (attribute === 'html' || attribute === 'outerHTML') return $.html(el) || null
  if (attribute === 'all') return $.html(el) || null
  if (attribute === 'text') return $(el).text() || null
  if (attribute === 'textNodes') {
    const textNodes: string[] = []
    $(el).contents().each((_i: number, node: any) => {
      if (node.type === 'text') {
        const t = $(node).text().trim()
        if (t) textNodes.push(t)
      }
    })
    return textNodes.length > 0 ? textNodes.join('\n') : null
  }
  if (attribute === 'ownText') {
    const ownText: string[] = []
    $(el).contents().each((_i: number, node: any) => {
      if (node.type === 'text') {
        const t = $(node).text().trim()
        if (t) ownText.push(t)
      }
    })
    return ownText.length > 0 ? ownText.join('') : null
  }
  if (attribute === 'tag' || attribute === 'tagName') return el.name || el.tagName || null
  if (attribute && attribute.startsWith('tag.')) {
    // tag.xxx → 返回标签名
    return el.name || el.tagName || null
  }
  if (attribute) return $(el).attr(attribute) || null
  // 无属性 → 返回 text，fallback href/src
  return $(el).text() || $(el).attr('href') || $(el).attr('src') || null
}

function isCheerioElement(obj: any): boolean {
  return obj && typeof obj === 'object' && (obj.type === 'tag' || obj.type === 'root') && obj.name && typeof obj.name === 'string'
}

/**
 * 将 legado CSS 规则中的简写转为标准 CSS 选择器
 * class.xxx → .xxx
 * id.xxx → #xxx
 * tag.xxx → xxx
 * [1:3] → :nth-child(n+1):nth-child(-n+3)
 */
function normalizeSelector(expression: string): string {
  let fixed = expression

  // tag.xxx → xxx（只在选择器开头或组合符后面）
  fixed = fixed.replace(/(^|[,\s>+~])tag\.(\w+)/g, '$1$2')

  // class.xxx → .xxx
  fixed = fixed.replace(/(^|[,\s>+~])class\.(\w+)/g, '$1.$2')

  // id.xxx → #xxx
  fixed = fixed.replace(/(^|[,\s>+~])id\.(\w+)/g, '$1#$2')

  // [数字:数字] → nth-child 范围
  fixed = fixed.replace(/\[(\d+):(\d+)\]/g, (_m: string, a: string, b: string) => {
    return `:nth-child(n+${a}):nth-child(-n+${b})`
  })

  // [attr~=/regex/] → 暂不转换，后续手动过滤
  return fixed
}

/**
 * 执行 CSS 规则
 */
export function executeCss(source: any, expression: string, attribute?: string | null): any {
  if (!source || !expression) return null

  let $: cheerio.CheerioAPI
  let root: any

  if (isCheerioElement(source)) {
    const html = source.outerHTML
      ? typeof source.outerHTML === 'function' ? source.outerHTML() : source.outerHTML
      : cheerio.load(source).html() || ''
    $ = cheerio.load(`<div>${html}</div>`)
    root = $('div')
  } else if (Array.isArray(source) && source.length > 0 && isCheerioElement(source[0])) {
    $ = cheerio.load('<div></div>')
    root = $('div')
    for (const el of source) {
      const elHtml = el.outerHTML
        ? typeof el.outerHTML === 'function' ? el.outerHTML() : el.outerHTML
        : cheerio.load(el).html() || ''
      root.append(elHtml)
    }
  } else if (typeof source === 'string') {
    $ = cheerio.load(source)
    root = $('body')
  } else {
    const html = String(source)
    $ = cheerio.load(html)
    root = $('body')
  }

  // 去掉 JS 注释行
  if (typeof expression === 'string') {
    expression = expression.split('\n')
      .filter((line: string) => !line.trim().startsWith('//'))
      .join('\n')
      .trim()
  }

  try {
    let fixedExpression = normalizeSelector(expression)

    // :matches(REGEX) / :matchesOwn(REGEX) → 记下正则，后面手动过滤
    const matchFilters: { regex: RegExp; own: boolean }[] = []
    fixedExpression = fixedExpression.replace(/:matches(Own)?\(([^)]+)\)/gi, (_m: string, own: string, regexStr: string) => {
      try {
        let pattern = regexStr
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          pattern = pattern.substring(1, pattern.length - 1)
        }
        matchFilters.push({ regex: new RegExp(pattern, 'i'), own: !!own })
      } catch {}
      return ''
    })
    if (fixedExpression.trim() === '') {
      fixedExpression = '*'
    }

    // 处理 && 合并
    if (fixedExpression.includes('&&') && !fixedExpression.includes('||') && !fixedExpression.includes('%%')) {
      const parts = fixedExpression.split('&&').map(s => s.trim())
      const allResults: any[] = []
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined) {
          if (Array.isArray(result)) allResults.push(...result)
          else allResults.push(result)
        }
      }
      return allResults.length > 0 ? allResults : null
    }

    // 处理 %% 交错合并
    if (fixedExpression.includes('%%')) {
      const parts = fixedExpression.split('%%').map(s => s.trim())
      const matrixResults: any[][] = []
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined) {
          if (Array.isArray(result)) matrixResults.push(result)
          else matrixResults.push([result])
        } else matrixResults.push([])
      }
      if (matrixResults.length === 0) return null
      const maxLen = Math.max(...matrixResults.map(arr => arr.length))
      const merged: any[] = []
      for (let i = 0; i < maxLen; i++) {
        for (const arr of matrixResults) {
          if (i < arr.length) merged.push(arr[i])
        }
      }
      return merged.length > 0 ? merged : null
    }

    // 处理 || 备选（取第一个非空结果）
    if (fixedExpression.includes('||')) {
      const parts = fixedExpression.split('||').map(s => s.trim())
      for (const part of parts) {
        const result = executeCss(source, part, attribute)
        if (result !== null && result !== undefined && result !== '' &&
          !(Array.isArray(result) && result.length === 0)) {
          return result
        }
      }
      return null
    }

    // 索引选择器
    const indexInfo = processIndexSelector(fixedExpression)
    let elements: any

    if (indexInfo) {
      const allElements = root.find(indexInfo.baseSelector || '*')
      if (allElements.length === 0) return null
      const selected: any[] = []
      const totalLen = allElements.length
      for (const idx of indexInfo.indexes) {
        let actualIndex = idx < 0 ? totalLen + idx : idx
        if (actualIndex >= 0 && actualIndex < totalLen) {
          selected.push(allElements[actualIndex])
        }
      }
      if (indexInfo.indexMode === '!') {
        const excludeSet = new Set(selected)
        const result: any[] = []
        for (let i = 0; i < totalLen; i++) {
          if (!excludeSet.has(allElements[i])) result.push(allElements[i])
        }
        elements = result
      } else {
        elements = selected
      }
    } else {
      elements = root.find(fixedExpression)
    }

    if (!elements || elements.length === 0) return null

    // :matches 正则过滤
    if (matchFilters.length > 0) {
      const filtered: any[] = []
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        let pass = true
        for (const filter of matchFilters) {
          const text = filter.own
            ? $(el).contents().filter((_j: number, node: any) => node.type === 'text').text().trim()
            : $(el).text()
          if (!filter.regex.test(text)) { pass = false; break }
        }
        if (pass) filtered.push(el)
      }
      if (filtered.length === 0) return null
      elements = filtered
    }

    // 如果表达式以 @ 结尾（如 "selector@"），表示提取元素本身而非属性值
    if (expression.endsWith('@') && !attribute) {
      const results: any[] = []
      for (let i = 0; i < elements.length; i++) {
        results.push(elements[i])
      }
      return results.length === 0 ? null : results.length === 1 ? results[0] : results
    }

    const results: any[] = []
    for (let i = 0; i < elements.length; i++) {
      const value = extractValue($, elements[i], attribute)
      if (value !== null && value !== undefined) results.push(value)
    }
    return results.length === 0 ? null : results.length === 1 ? results[0] : results
  } catch (error: any) {
    console.warn('[CSS] 执行失败:', error.message, '选择器:', expression)
    return null
  }
}
