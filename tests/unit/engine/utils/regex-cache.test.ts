// ============================================
// 正则缓存单元测试
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import { getCachedRegex, clearRegexCache } from '../../../../engine/utils/regex-cache.js'

describe('getCachedRegex', () => {
  beforeEach(() => {
    clearRegexCache()
  })

  it('编译正则', () => {
    const regex = getCachedRegex('\\d+')
    expect(regex).toBeInstanceOf(RegExp)
    expect(regex?.test('123')).toBe(true)
  })

  it('相同模式返回缓存实例', () => {
    const regex1 = getCachedRegex('\\d+')
    const regex2 = getCachedRegex('\\d+')
    expect(regex1).toBe(regex2)
  })

  it('不同 flags 返回不同实例', () => {
    const regexG = getCachedRegex('test', 'g')
    const regexI = getCachedRegex('test', 'i')
    expect(regexG).not.toBe(regexI)
  })

  it('无效正则返回 null', () => {
    expect(getCachedRegex('[')).toBeNull()
  })

  it('clearRegexCache 清空缓存', () => {
    const regex1 = getCachedRegex('\\d+')
    clearRegexCache()
    const regex2 = getCachedRegex('\\d+')
    expect(regex1).not.toBe(regex2)
  })

  it('lastIndex 在多次 exec 之间可被重置', () => {
    const regex = getCachedRegex('a')
    expect(regex).not.toBeNull()
    regex!.lastIndex = 0
    expect(regex!.exec('a')).not.toBeNull()
    regex!.lastIndex = 0
    expect(regex!.exec('a')).not.toBeNull()
  })
})
