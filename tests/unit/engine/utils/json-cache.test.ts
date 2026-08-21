// ============================================
// JSON 序列化缓存单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { cachedStringify, clearJsonCache } from '../../../../engine/utils/json-cache.js'

describe('cachedStringify', () => {
  it('字符串原样返回', () => {
    expect(cachedStringify('test')).toBe('test')
  })

  it('数字转字符串', () => {
    expect(cachedStringify(123)).toBe('123')
  })

  it('布尔转字符串', () => {
    expect(cachedStringify(true)).toBe('true')
    expect(cachedStringify(false)).toBe('false')
  })

  it('null 和 undefined 返回空字符串', () => {
    expect(cachedStringify(null)).toBe('')
    expect(cachedStringify(undefined)).toBe('')
  })

  it('对象序列化为 JSON', () => {
    expect(cachedStringify({ a: 1 })).toBe('{"a":1}')
  })

  it('数组序列化为 JSON', () => {
    expect(cachedStringify([1, 2, 3])).toBe('[1,2,3]')
  })

  it('同一对象引用返回缓存结果', () => {
    const obj = { a: 1, b: 'test' }
    const result1 = cachedStringify(obj)
    const result2 = cachedStringify(obj)
    expect(result1).toBe(result2)
  })

  it('不同对象返回不同结果', () => {
    const result1 = cachedStringify({ a: 1 })
    const result2 = cachedStringify({ a: 1 })
    expect(result1).toBe(result2) // 相同内容相同字符串
  })
})
