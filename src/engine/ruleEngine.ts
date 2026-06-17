import { fetchUrl } from '../api/tauri'

function log(msg: string, type: 'info' | 'warning' | 'error' = 'info') {
  const prefix = '[墨阅引擎]'
  const fn = type === 'error' ? console.error : type === 'warning' ? console.warn : console.log
  fn(`${prefix} ${msg}`)
}

// ========== 章节缓存管理器 ==========
class ChapterCacheManager {
  private cache: Map<string, { content: string; timestamp: number }> = new Map()
  private maxSize = 5  // 最多缓存 5 章
  private storageKey = 'abyss_chapter_cache'

  constructor() {
    this.loadFromStorage()
  }

  // 生成缓存键
  private getKey(sourceUrl: string, chapterUrl: string): string {
    return `${sourceUrl}|${chapterUrl}`
  }

  // 获取缓存
  get(sourceUrl: string, chapterUrl: string): string | null {
    const key = this.getKey(sourceUrl, chapterUrl)
    const entry = this.cache.get(key)
    if (entry) {
      // 更新访问时间
      entry.timestamp = Date.now()
      return entry.content
    }
    return null
  }

  // 设置缓存（自动淘汰）
  set(sourceUrl: string, chapterUrl: string, content: string): void {
    const key = this.getKey(sourceUrl, chapterUrl)
    this.cache.set(key, { content, timestamp: Date.now() })

    // 如果超过最大数量，淘汰最旧的
    if (this.cache.size > this.maxSize) {
      let oldestKey = ''
      let oldestTime = Infinity
      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp
          oldestKey = k
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey)
        log(`淘汰章节缓存: ${oldestKey}`)
      }
    }

    this.saveToStorage()
  }

  // 预加载多章（不阻塞）
  async preload(
    source: any,
    chapters: any[],
    currentIndex: number,
    fetchFn: (source: any, url: string) => Promise<string>
  ): Promise<void> {
    // 计算需要预加载的章节索引：当前章 + 前后各 2 章 = 5 章
    const halfWindow = 2
    const start = Math.max(0, currentIndex - halfWindow)
    const end = Math.min(chapters.length - 1, currentIndex + halfWindow)

    const toLoad: { index: number; url: string }[] = []
    for (let i = start; i <= end; i++) {
      const chapter = chapters[i]
      if (!chapter || !chapter.url) continue
      const key = this.getKey(source.url, chapter.url)
      if (!this.cache.has(key)) {
        toLoad.push({ index: i, url: chapter.url })
      }
    }

    if (toLoad.length === 0) return

    log(`预加载 ${toLoad.length} 章 (${start}-${end})...`)

    // 并行加载
    const promises = toLoad.map(async ({ index, url }) => {
      try {
        const content = await fetchFn(source, url)
        this.set(source.url, url, content)
        log(`预加载完成: 第 ${index + 1} 章`)
      } catch (err) {
        log(`预加载失败: 第 ${index + 1} 章 - ${err}`, 'warning')
      }
    })

    await Promise.allSettled(promises)
  }

  // 清空缓存
  clear(): void {
    this.cache.clear()
    localStorage.removeItem(this.storageKey)
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      const data: Record<string, string> = {}
      for (const [key, entry] of this.cache) {
        data[key] = entry.content
      }
      localStorage.setItem(this.storageKey, JSON.stringify(data))
    } catch (e) {
      // localStorage 不可用或空间不足
    }
  }

  // 从 localStorage 加载
  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const data = JSON.parse(raw)
      const now = Date.now()
      for (const [key, content] of Object.entries(data)) {
        if (typeof content === 'string') {
          this.cache.set(key, { content, timestamp: now })
        }
      }
      // 如果超过最大数量，只保留最新的 5 条
      if (this.cache.size > this.maxSize) {
        const entries = Array.from(this.cache.entries())
          .sort((a, b) => b[1].timestamp - a[1].timestamp)
          .slice(0, this.maxSize)
        this.cache = new Map(entries)
        this.saveToStorage()
      }
      log(`从 localStorage 加载了 ${this.cache.size} 章缓存`)
    } catch (e) {
      // 数据损坏，忽略
    }
  }

  // 获取缓存统计
  stats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// 单例
const chapterCache = new ChapterCacheManager()

// ========== RuleEngine ==========
export const RuleEngine = {
  // ... 前面所有方法保持不变 ...

  // ========== 获取正文（带缓存） ==========
  async getContent(source: any, chapterUrl: string): Promise<string> {
    if (!source.ruleContent) throw new Error('书源缺少正文规则')
    if (!chapterUrl) throw new Error('章节 URL 为空')

    // 1. 检查缓存
    const cached = chapterCache.get(source.url, chapterUrl)
    if (cached) {
      log(`命中缓存: ${chapterUrl.substring(0, 50)}...`)
      return cached
    }

    // 2. 获取新内容
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
    const result = content || '未能获取正文内容'

    // 3. 存入缓存
    chapterCache.set(source.url, chapterUrl, result)

    return result
  },

  // ========== 预加载章节（自动缓存 5 章） ==========
  async preloadChapters(
    source: any,
    chapters: any[],
    currentIndex: number
  ): Promise<void> {
    if (!source || !chapters || chapters.length === 0) return
    await chapterCache.preload(source, chapters, currentIndex, this.getContent.bind(this))
  },

  // ========== 获取缓存统计 ==========
  getCacheStats() {
    return chapterCache.stats()
  },

  // ========== 清空缓存 ==========
  clearCache() {
    chapterCache.clear()
  },

  // ... 后面所有方法保持不变（JSONPath、XPath 等） ...
}

// ========== JSONPath 实现 ==========
const JSONPath = {
  // ... 保持不变 ...
}

// ========== XPath 实现 ==========
const XPath = {
  // ... 保持不变 ...
}
