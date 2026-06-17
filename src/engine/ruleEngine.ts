import { fetchUrl } from '../api/tauri'

function log(msg: string, type: 'info' | 'warning' | 'error' = 'info') {
  const prefix = '[墨阅引擎]'
  const fn = type === 'error' ? console.error : type === 'warning' ? console.warn : console.log
  fn(`${prefix} ${msg}`)
}

const chapterCache = new Map<string, string>()

export const RuleEngine = {
  // ========== 网络请求（唯一后端依赖） ==========
  async fetchHtml(
    url: string,
    method: string = 'GET',
    body?: string,
    headers?: Record<string, string>,
    charset?: string
  ): Promise<string> {
    return fetchUrl(url, method, body, headers, charset)
  },

  // ========== URL 模板替换 ==========
  parseUrl(url: string, baseUrl: string, variables: Record<string, string> = {}): string {
    if (!url) return ''
    let result = url
    Object.entries(variables).forEach(([key, val]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodeURIComponent(val))
    })
    result = result.replace(/\{\{page\}\}/g, variables.page || '1')
    result = result.replace(/\{\{key\}\}/g, encodeURIComponent(variables.key || ''))
    if (result.startsWith('/')) {
      try {
        const base = new URL(baseUrl)
        result = base.origin + result
      } catch {
        result = baseUrl + result
      }
    } else if (!result.match(/^https?:\/\//)) {
      result = baseUrl + (baseUrl.endsWith('/') ? '' : '/') + result
    }
    return result
  },

  // ========== 解析搜索 URL（支持 JSON 配置） ==========
  parseSearchUrl(searchUrl: string): { url: string; method: string; headers: Record<string, string>; body: string | null } {
    if (!searchUrl) {
      return { url: '', method: 'GET', headers: {}, body: null }
    }
    let url = searchUrl
    let method = 'GET'
    let headers: Record<string, string> = {}
    let body: string | null = null
    const jsonMatch = searchUrl.match(/,\s*(\{[\s\S]*\})$/)
    if (jsonMatch) {
      try {
        const config = JSON.parse(jsonMatch[1])
        url = searchUrl.substring(0, searchUrl.lastIndexOf(','))
        if (config.method) method = config.method.toUpperCase()
        if (config.headers) {
          headers = typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers
        }
        if (config.body) body = config.body
      } catch (e) {
        // ignore
      }
    }
    return { url, method, headers, body }
  },

  // ========== 搜索 ==========
  async search(source: any, keyword: string, page: number = 1): Promise<any[]> {
    if (!source.searchUrl || !source.ruleSearch) {
      throw new Error('书源缺少搜索配置')
    }
    const urlConfig = this.parseSearchUrl(source.searchUrl)
    const searchUrl = this.parseUrl(urlConfig.url, source.url, { key: keyword, page: String(page) })
    log(`搜索 ${source.name}: ${searchUrl.substring(0, 80)}...`)

    const body = urlConfig.body ? urlConfig.body.replace(/\{\{key\}\}/g, encodeURIComponent(keyword)) : undefined
    const method = urlConfig.method || 'GET'
    const html = await this.fetchHtml(searchUrl, method, body, urlConfig.headers)

    let data: any = html
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      try { data = JSON.parse(html) } catch {}
    }

    const items = this.parseBookList(data, source.ruleSearch)
    if (!Array.isArray(items)) {
      log('搜索解析结果非数组', 'warning')
      return []
    }

    return items.map((item: any) => this.parseBookItem(item, source, 'search')).filter((b: any) => b && b.name)
  },

  // ========== 发现/探索 ==========
  async explore(source: any, url: string): Promise<any[]> {
    log(`发现 ${source.name}: ${url.substring(0, 80)}...`)
    const html = await this.fetchHtml(url)
    let data: any = html
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      try { data = JSON.parse(html) } catch {}
    }
    const ruleExplore = source.ruleExplore || source.ruleSearch
    if (!ruleExplore) throw new Error('书源缺少发现规则')
    const listRule = ruleExplore.bookList || ruleExplore.exploreList
    const items = this.parseBookList(data, listRule)
    if (!Array.isArray(items)) {
      log('发现解析结果非数组', 'warning')
      return []
    }
    return items.map((item: any) => this.parseBookItem(item, source, 'explore')).filter((b: any) => b && b.name)
  },

  // ========== 获取目录 ==========
  async getToc(source: any, tocUrl: string): Promise<any[]> {
    if (!source.ruleToc) throw new Error('书源缺少目录规则')
    if (!tocUrl) throw new Error('目录 URL 为空')
    log(`获取目录: ${tocUrl}`)
    const html = await this.fetchHtml(tocUrl)
    let data: any = html
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      try { data = JSON.parse(html) } catch {}
    }
    const rule = source.ruleToc
    const chapters = this.parseBookList(data, rule.chapterList)
    if (!Array.isArray(chapters)) {
      log('目录解析结果非数组', 'warning')
      return []
    }
    return chapters
      .map((ch: any, index: number) => ({
        id: index,
        title: this.parseField(ch, rule.chapterName) || '无标题',
        url: this.resolveUrl(this.parseField(ch, rule.chapterUrl) as string | undefined, source.url),
        index,
        isVip: false,
        isPay: false,
      }))
      .filter((c: any) => c.title && c.url)
  },

  // ========== 获取正文 ==========
  async getContent(source: any, chapterUrl: string): Promise<string> {
    if (!source.ruleContent) throw new Error('书源缺少正文规则')
    if (!chapterUrl) throw new Error('章节 URL 为空')
    const cacheKey = `${source.url}_${chapterUrl}`
    if (chapterCache.has(cacheKey)) return chapterCache.get(cacheKey)!

    log(`获取正文: ${chapterUrl.substring(0, 80)}...`)
    const html = await this.fetchHtml(chapterUrl)
    let data: any = html
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      try { data = JSON.parse(html) } catch {}
    }
    const rule = source.ruleContent
    let content = this.parseField(data, rule.content)
    if (typeof content === 'string') {
      content = this.cleanContent(content)
    } else if (Array.isArray(content)) {
      content = content.map((c: any) => this.cleanContent(c)).join('\n\n')
    }
    if (rule.replaceRegex) {
      content = this.applyReplaceRules(content, rule.replaceRegex)
    }
    chapterCache.set(cacheKey, content)
    if (chapterCache.size > 50) {
      const firstKey = chapterCache.keys().next().value
      chapterCache.delete(firstKey)
    }
    return content || '未能获取正文内容'
  },

  // ========== 通用解析 ==========
  parseBookList(data: any, rule: any): any {
    if (!rule) return null
    if (typeof data === 'object') {
      return JSONPath.parse(data, rule)
    } else if (typeof data === 'string') {
      let result = XPath.select(data, rule)
      if (!result && (data.trim().startsWith('{') || data.trim().startsWith('['))) {
        try {
          const json = JSON.parse(data)
          result = JSONPath.parse(json, rule)
        } catch {}
      }
      return result
    }
    return null
  },

  parseField(data: any, rule: any): any {
    if (!rule) return null
    let value: any
    if (typeof data === 'object') {
      value = JSONPath.parse(data, rule)
    } else if (typeof data === 'string') {
      value = XPath.select(data, rule)
      if (!value && (data.trim().startsWith('{') || data.trim().startsWith('['))) {
        try {
          const json = JSON.parse(data)
          value = JSONPath.parse(json, rule)
        } catch {}
      }
    }
    if (Array.isArray(value)) value = value[0]
    return value
  },

  parseBookItem(book: any, source: any, type: string): any {
    const rule = type === 'explore' ? (source.ruleExplore || source.ruleSearch) : source.ruleSearch
    const getField = (ruleField: any) => ruleField ? this.parseField(book, ruleField) : null
    const name = getField(rule.name)
    if (!name) return null
    return {
      name: String(name).trim(),
      author: String(getField(rule.author) || '未知作者').trim(),
      cover: this.resolveUrl(getField(rule.coverUrl || rule.cover) as string | undefined, source.url),
      intro: this.cleanIntro(getField(rule.intro)),
      bookUrl: this.resolveUrl(getField(rule.bookUrl) as string | undefined, source.url),
      lastChapter: String(getField(rule.lastChapter) || '').trim(),
      source: source,
      sourceName: source.name,
    }
  },

  // ========== 工具函数 ==========
  cleanContent(html: string): string {
    if (!html) return ''
    let result = html
    result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    result = result.replace(/<br\s*\/?>/gi, '\n')
    result = result.replace(/<\/p>/gi, '\n\n')
    result = result.replace(/<\/div>/gi, '\n')
    result = result.replace(/<\/h[1-6]>/gi, '\n\n')
    result = result.replace(/<[^>]+>/g, '')
    const textarea = document.createElement('textarea')
    textarea.innerHTML = result
    result = textarea.value
    result = result.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
    return result
  },

  cleanIntro(intro: any): string {
    if (!intro) return ''
    const text = String(intro).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text.substring(0, 500)
  },

  applyReplaceRules(content: string, rules: string): string {
    if (!rules || !content) return content
    const parts = rules.split('##').filter(r => r.trim())
    let result = content
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i + 1] !== undefined) {
        try {
          const regex = new RegExp(parts[i], 'g')
          result = result.replace(regex, parts[i + 1])
        } catch (e) {
          log('正则替换错误: ' + (e as Error).message, 'error')
        }
      }
    }
    return result
  },

  resolveUrl(url: string | undefined | null, baseUrl: string): string {
    if (!url) return ''
    if (typeof url !== 'string') url = String(url)
    if (url.match(/^https?:\/\//)) return url
    try {
      const base = new URL(baseUrl)
      return url.startsWith('/') ? base.origin + url : baseUrl + '/' + url
    } catch {
      return url
    }
  },
}

// ========== JSONPath 实现 ==========
const JSONPath = {
  parse(obj: any, path: string): any {
    if (!path || !obj) return null
    if (path.startsWith('@js:')) return this.executeJs(obj, path.slice(4))
    if (path.includes('##')) return this.handleRegex(obj, path)
    let cleanPath = path.replace(/^\$\./, '').replace(/^\$/, '')
    if (!cleanPath) return obj
    const parts = this.tokenize(cleanPath)
    let current = obj
    for (const part of parts) {
      if (current == null) return null
      switch (part.type) {
        case 'property':
          current = current[part.value]
          break
        case 'index':
          if (Array.isArray(current)) current = current[part.value]
          else return null
          break
        case 'wildcard':
          break
        case 'recursive':
          current = this.findRecursive(current, part.value)
          break
      }
    }
    return current
  },

  tokenize(path: string): any[] {
    const tokens: any[] = []
    let current = ''
    let i = 0
    while (i < path.length) {
      const ch = path[i]
      if (ch === '.') {
        if (current) tokens.push({ type: 'property', value: current })
        current = ''
        i++
      } else if (ch === '[') {
        if (current) tokens.push({ type: 'property', value: current })
        current = ''
        let j = i + 1,
          depth = 1,
          content = ''
        while (j < path.length && depth > 0) {
          if (path[j] === '[') depth++
          else if (path[j] === ']') depth--
          if (depth > 0) content += path[j]
          j++
        }
        if (content === '*') {
          tokens.push({ type: 'wildcard' })
        } else if (!isNaN(parseInt(content))) {
          tokens.push({ type: 'index', value: parseInt(content) })
        } else {
          tokens.push({ type: 'property', value: content.replace(/['"]/g, '') })
        }
        i = j
      } else {
        current += ch
        i++
      }
    }
    if (current) tokens.push({ type: 'property', value: current })
    return tokens
  },

  executeJs(obj: any, code: string): any {
    try {
      const func = new Function('result', 'java', 'source', `"use strict"; return (${code})`)
      return func(obj, {}, null)
    } catch (e) {
      return null
    }
  },

  handleRegex(obj: any, path: string): any {
    const parts = path.split('##')
    let value = this.parse(obj, parts[0]) || ''
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1] !== undefined) {
        try {
          value = String(value).replace(new RegExp(parts[i], 'g'), parts[i + 1])
        } catch {}
      }
    }
    return value
  },

  findRecursive(obj: any, propName: string): any {
    const results: any[] = []
    const visited = new WeakSet()
    const search = (current: any) => {
      if (!current || typeof current !== 'object') return
      if (visited.has(current)) return
      visited.add(current)
      if (Array.isArray(current)) {
        current.forEach((item) => {
          if (item && item[propName] !== undefined) results.push(item[propName])
          search(item)
        })
      } else {
        if (current[propName] !== undefined) results.push(current[propName])
        Object.values(current).forEach(search)
      }
    }
    search(obj)
    return results
  },
}

// ========== XPath 实现 ==========
const XPath = {
  select(html: string, xpath: string): any {
    if (!xpath || !html) return null
    if (xpath.startsWith('@js:')) return this.executeJs(html, xpath.slice(4))
    if (xpath.includes('##')) {
      const [rule, pattern, repl] = xpath.split('##')
      let value = this.select(html, rule)
      if (value && pattern) value = String(value).replace(new RegExp(pattern, 'g'), repl || '')
      return value
    }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    try {
      const result = document.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
      const nodes = []
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i)
        if (node) nodes.push(node.textContent?.trim() || '')
      }
      return nodes.length === 1 ? nodes[0] : nodes.length > 0 ? nodes : null
    } catch {
      const elements = doc.querySelectorAll(xpath)
      const results = Array.from(elements)
        .map((el) => el.textContent?.trim())
        .filter((t) => t)
      return results.length === 1 ? results[0] : results.length > 0 ? results : null
    }
  },

  executeJs(html: string, code: string): any {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const func = new Function('doc', 'java', `"use strict"; return (${code})`)
      return func(doc, {})
    } catch {
      return null
    }
  },
}
