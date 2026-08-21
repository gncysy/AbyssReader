// ============================================
// SimpleJSONPath — 轻量级 JSONPath 实现
// 覆盖书源中实际出现的所有 JSONPath 用法
// 支持：$.xxx / $.x.y.z / $.list[*] / $.list[*].name / $.list[0] / $..content / $..content.name
// ============================================

const EMPTY_RESULT: unknown[] = []

export class SimpleJSONPath {
  private data: unknown

  constructor(data: unknown) {
    if (typeof data === 'string') {
      const trimmed = data.trim()
      if (!trimmed) {
        this.data = {}
        return
      }
      const noBom = trimmed.replace(/^\uFEFF/, '')
      try {
        this.data = JSON.parse(noBom)
      } catch {
        this.data = { result: data }
      }
    } else if (data === null || data === undefined) {
      this.data = {}
    } else {
      this.data = data
    }
  }

  query(path: string): unknown[] {
    if (!path || typeof path !== 'string') return EMPTY_RESULT

    const trimmed = path.trim()
    if (!trimmed) return EMPTY_RESULT
    if (!trimmed.startsWith('$')) return EMPTY_RESULT

    // 处理 $.. 递归下降
    if (trimmed.includes('$..')) {
      return this.queryRecursive(trimmed)
    }

    // $ 单独使用返回原数据
    if (trimmed === '$') {
      return [this.data]
    }

    const segments = this.parsePath(trimmed)
    if (segments.length === 0) return EMPTY_RESULT

    return this.resolveSegments(this.data, segments)
  }

  private queryRecursive(path: string): unknown[] {
    const rest = path.replace(/^\$\.\./, '')

    if (!rest) return EMPTY_RESULT

    let splitIndex = rest.length
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i]
      if (ch === '.' || ch === '[') {
        splitIndex = i
        break
      }
    }

    const prop = rest.substring(0, splitIndex)
    if (!prop) return EMPTY_RESULT

    const found = this.recursiveFind(this.data, prop)
    if (found.length === 0) return EMPTY_RESULT

    const remainingPath = rest.substring(splitIndex)
    if (!remainingPath) {
      return found
    }

    const fullRemainingPath = '$' + remainingPath
    const results: unknown[] = []

    for (const item of found) {
      const tempEngine = new SimpleJSONPath(item)
      const tempResults = tempEngine.query(fullRemainingPath)
      for (const r of tempResults) {
        if (r !== null && r !== undefined) {
          results.push(r)
        }
      }
    }

    return results
  }

  private parsePath(path: string): string[] {
    let normalized = path.replace(/^\$/, '')

    if (!normalized) return []

    normalized = normalized.replace(/^[.[]/, '')

    const segments: string[] = []
    let current = ''
    let inBracket = false

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i]

      if (char === '[') {
        if (current) {
          segments.push(current)
          current = ''
        }
        inBracket = true
      } else if (char === ']') {
        if (current) {
          segments.push(current)
          current = ''
        }
        inBracket = false
      } else if (char === '.' && !inBracket) {
        if (current) {
          segments.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }

    if (current) segments.push(current)

    return segments.filter((s) => s && s.trim())
  }

  private resolveSegments(data: unknown, segments: string[]): unknown[] {
    let current: unknown[] = [data]

    for (const segment of segments) {
      if (current.length === 0) break
      const next: unknown[] = []

      for (const item of current) {
        const result = this.resolveSegment(item, segment)

        if (segment === '*') {
          // 只有通配符才展开数组
          if (Array.isArray(result)) {
            for (const v of result) {
              if (v !== null && v !== undefined) {
                next.push(v)
              }
            }
          } else if (result !== undefined && result !== null) {
            next.push(result)
          }
        } else {
          // 非通配符：数组作为单个值传递
          if (result !== undefined && result !== null) {
            next.push(result)
          }
        }
      }

      current = next
    }

    return current
  }

  private resolveSegment(data: unknown, segment: string): unknown {
    if (data === null || data === undefined) return undefined

    if (segment === '*') {
      if (Array.isArray(data)) {
        return data.length > 0 ? data : undefined
      }
      if (typeof data === 'object') {
        const values = Object.values(data)
        return values.length > 0 ? values : undefined
      }
      return undefined
    }

    if (/^-?\d+$/.test(segment)) {
      const index = parseInt(segment, 10)
      if (Array.isArray(data)) {
        const actualIndex = index < 0 ? data.length + index : index
        if (actualIndex >= 0 && actualIndex < data.length) {
          return data[actualIndex]
        }
      }
      return undefined
    }

    const sliceMatch = segment.match(/^(-?\d*):(-?\d*)$/)
    if (sliceMatch) {
      if (Array.isArray(data)) {
        const start = sliceMatch[1] ? parseInt(sliceMatch[1], 10) : 0
        const end = sliceMatch[2] ? parseInt(sliceMatch[2], 10) : data.length
        const actualStart = start < 0 ? Math.max(0, data.length + start) : Math.min(start, data.length)
        const actualEnd = end < 0 ? Math.max(0, data.length + end) : Math.min(end, data.length)
        return data.slice(actualStart, actualEnd)
      }
      return undefined
    }

    if (segment.includes(',')) {
      const indexes = segment.split(',').map((s) => s.trim())
      if (Array.isArray(data)) {
        const result: unknown[] = []
        for (const idx of indexes) {
          const index = parseInt(idx, 10)
          if (!isNaN(index) && index >= 0 && index < data.length) {
            result.push(data[index])
          }
        }
        return result.length > 0 ? result : undefined
      }
      return undefined
    }

    if (typeof data === 'object') {
      return (data as Record<string, unknown>)[segment]
    }

    return undefined
  }

  private recursiveFind(obj: unknown, prop: string): unknown[] {
    const results: unknown[] = []
    const visited = new WeakSet<object>()

    const traverse = (item: unknown): void => {
      if (item === null || item === undefined) return

      if (typeof item === 'object') {
        if (visited.has(item)) return
        visited.add(item)
      }

      if (Array.isArray(item)) {
        if (item.length === 0) return
        for (const element of item) {
          traverse(element)
        }
        return
      }

      if (typeof item === 'object') {
        const record = item as Record<string, unknown>

        if (prop in record && record[prop] !== undefined) {
          results.push(record[prop])
        }

        for (const value of Object.values(record)) {
          traverse(value)
        }
      }
    }

    traverse(obj)
    return results
  }
}
