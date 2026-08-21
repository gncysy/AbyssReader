// ============================================
// 变量存储单元测试
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  putContext,
  getContext,
  clearContext,
  putChapterVariable,
  getChapterVariable,
  putBookVariable,
  getBookVariable,
} from '../../../../engine/context/store.js'

describe('context store', () => {
  beforeEach(() => {
    clearContext()
  })

  it('putContext 和 getContext 基本操作', () => {
    putContext('source1', 'key1', 'value1')
    expect(getContext('source1', 'key1')).toBe('value1')
  })

  it('不同 sourceId 隔离', () => {
    putContext('source1', 'key1', 'value1')
    putContext('source2', 'key1', 'value2')
    expect(getContext('source1', 'key1')).toBe('value1')
    expect(getContext('source2', 'key1')).toBe('value2')
  })

  it('不存在的 key 返回 undefined', () => {
    expect(getContext('source1', 'nonexistent')).toBeUndefined()
  })

  it('clearContext 按 sourceId 清理', () => {
    putContext('source1', 'key1', 'value1')
    putContext('source2', 'key1', 'value2')
    clearContext('source1')
    expect(getContext('source1', 'key1')).toBeUndefined()
    expect(getContext('source2', 'key1')).toBe('value2')
  })

  it('clearContext 不带参数清理所有', () => {
    putContext('source1', 'key1', 'value1')
    putContext('source2', 'key1', 'value2')
    clearContext()
    expect(getContext('source1', 'key1')).toBeUndefined()
    expect(getContext('source2', 'key1')).toBeUndefined()
  })

  it('覆盖已有值', () => {
    putContext('source1', 'key1', 'old')
    putContext('source1', 'key1', 'new')
    expect(getContext('source1', 'key1')).toBe('new')
  })
})

describe('chapter variable store', () => {
  beforeEach(() => {
    clearContext()
  })

  it('putChapterVariable 和 getChapterVariable 基本操作', () => {
    putChapterVariable('source1', 'chapter1', 'key1', 'value1')
    expect(getChapterVariable('source1', 'chapter1', 'key1')).toBe('value1')
  })

  it('不同章节隔离', () => {
    putChapterVariable('source1', 'chapter1', 'key1', 'v1')
    putChapterVariable('source1', 'chapter2', 'key1', 'v2')
    expect(getChapterVariable('source1', 'chapter1', 'key1')).toBe('v1')
    expect(getChapterVariable('source1', 'chapter2', 'key1')).toBe('v2')
  })
})

describe('book variable store', () => {
  beforeEach(() => {
    clearContext()
  })

  it('putBookVariable 和 getBookVariable 基本操作', () => {
    putBookVariable('source1', 'key1', 'value1')
    expect(getBookVariable('source1', 'key1')).toBe('value1')
  })

  it('不同 sourceId 隔离', () => {
    putBookVariable('source1', 'key1', 'v1')
    putBookVariable('source2', 'key1', 'v2')
    expect(getBookVariable('source1', 'key1')).toBe('v1')
    expect(getBookVariable('source2', 'key1')).toBe('v2')
  })
})
