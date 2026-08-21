// ============================================
// JSON 序列化缓存 — 缓存重复序列化的对象引用
// ============================================

const stringifyCache = new WeakMap<object, string>()
const MAX_STRINGIFY_CACHE_SIZE = 500
let cacheCount = 0

export function cachedStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)

  // WeakMap 缓存：同一个对象引用，直接返回之前序列化的结果
  const cached = stringifyCache.get(value)
  if (cached !== undefined) return cached

  const jsonStr = JSON.stringify(value)
  if (jsonStr === undefined) return ''

  // 只缓存"小"结果，避免内存占用
  if (jsonStr.length < 10000 && cacheCount < MAX_STRINGIFY_CACHE_SIZE) {
    stringifyCache.set(value, jsonStr)
    cacheCount++
  }

  return jsonStr
}

export function clearJsonCache(): void {
  // WeakMap 不需要手动清理，GC 会自动回收
  // 只重置计数器
  cacheCount = 0
}
