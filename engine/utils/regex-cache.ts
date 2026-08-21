// ============================================
// 正则表达式预编译缓存 — 避免重复编译
// ============================================

const regexCache = new Map<string, RegExp | null>()
const MAX_CACHE_SIZE = 200

export function getCachedRegex(pattern: string, flags = 'g'): RegExp | null {
  const cacheKey = pattern + '::' + flags
  const cached = regexCache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const regex = new RegExp(pattern, flags)
    regexCache.set(cacheKey, regex)
    if (regexCache.size > MAX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value
      if (firstKey !== undefined) regexCache.delete(firstKey)
    }
    return regex
  } catch {
    regexCache.set(cacheKey, null)
    return null
  }
}

export function clearRegexCache(): void {
  regexCache.clear()
}
