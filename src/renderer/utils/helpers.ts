import type { Book } from '@shared/types'

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
  return debounced as any
}

export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let last = 0
  return ((...args: any[]) => {
    const now = Date.now()
    if (now - last >= delay) { last = now; fn(...args) }
  }) as any
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

export function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatTime(date: Date | string | number): string {
  const d = new Date(date)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return str.replace(/[&<>"']/g, char => map[char] || char)
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export function randomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isLocalBook(book: Book): boolean {
  return book?.bookUrl?.startsWith('local://') || false
}

export function isNetworkBook(book: Book): boolean {
  return !isLocalBook(book)
}
