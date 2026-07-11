/**
 * 通用工具函数
 */

/**
 * 防抖函数
 * 在连续调用中，只在最后一次调用后的延迟时间后执行
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): ((...args: Parameters<T>) => void) & { cancel?: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}

/**
 * 节流函数
 * 在指定时间间隔内最多执行一次
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number = 300
): (...args: Parameters<T>) => void {
  let lastTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now()
    const remaining = interval - (now - lastTime)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      lastTime = now
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  }
}

/**
 * 格式化日期
 */
export function formatDate(date: Date | string | number, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')

  const map: Record<string, string> = {
    'YYYY': String(d.getFullYear()),
    'MM': pad(d.getMonth() + 1),
    'DD': pad(d.getDate()),
    'HH': pad(d.getHours()),
    'mm': pad(d.getMinutes()),
    'ss': pad(d.getSeconds()),
  }

  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => map[match] || match)
}

/**
 * 相对时间（多久以前）
 */
export function timeAgo(date: Date | string | number): string {
  const now = Date.now()
  const time = new Date(date).getTime()
  if (isNaN(time)) return ''

  const diff = now - time
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(months / 12)

  if (years > 0) return years + '年前'
  if (months > 0) return months + '个月前'
  if (days > 0) return days + '天前'
  if (hours > 0) return hours + '小时前'
  if (minutes > 0) return minutes + '分钟前'
  return '刚刚'
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

  return size + ' ' + sizes[i]
}

/**
 * 截断文本
 */
export function truncate(text: string, maxLength: number = 100, suffix: string = '...'): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + suffix
}

/**
 * 验证是否为有效 URL
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 获取域名
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 生成随机 ID
 */
export function generateId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse<T = any>(str: string, defaultValue: T | null = null): T | null {
  if (!str || typeof str !== 'string') return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}

/**
 * 移除 HTML 标签
 */
export function stripHtml(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T

  const cloned: Record<string, any> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, any>)[key])
    }
  }
  return cloned as T
}

/**
 * 检查是否为空对象
 */
export function isEmptyObject(obj: Record<string, any>): boolean {
  if (!obj || typeof obj !== 'object') return true
  return Object.keys(obj).length === 0
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  if (!filename) return ''
  const ext = filename.split('.').pop()
  return ext ? ext.toLowerCase() : ''
}

/**
 * 检查是否为本地书籍
 */
export function isLocalBook(book: { sourceId: string }): boolean {
  return book && book.sourceId === 'local'
}

/**
 * 检查是否为网络书籍
 */
export function isNetworkBook(book: { sourceId: string }): boolean {
  return book && book.sourceId !== 'local'
}

/**
 * 睡眠函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (i < maxRetries - 1) {
        await sleep(delay * (i + 1))
      }
    }
  }

  throw lastError
}

/**
 * 并发限制执行
 */
export async function concurrentLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<any>
): Promise<any[]> {
  const results: any[] = []
  const queue = [...items]
  const promises: Promise<void>[] = []

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      const index = items.indexOf(item)
      try {
        const result = await fn(item, index)
        results[index] = result
      } catch (error) {
        results[index] = error
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    promises.push(worker())
  }

  await Promise.all(promises)
  return results
}

/**
 * 获取随机颜色
 */
export function getRandomColor(): string {
  const colors = [
    '#d4a017', '#e8c547', '#b8860b',
    '#4caf50', '#2196f3', '#ff5722',
    '#9c27b0', '#e91e63', '#00bcd4',
    '#ff9800', '#8bc34a', '#3f51b5'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

/**
 * 拼音首字母（简单实现）
 */
export function getInitials(name: string): string {
  if (!name) return ''
  const first = name.charAt(0)
  // 如果是英文，返回大写
  if (first.match(/[a-zA-Z]/)) return first.toUpperCase()
  // 中文返回第一个字
  return first
}
