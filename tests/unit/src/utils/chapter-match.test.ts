// ============================================
// 章节智能匹配单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { findChapterIndex } from '../../../../src/utils/chapter-match.js'

describe('findChapterIndex', () => {
  const newChapters = [
    { title: '第一章 起始' },
    { title: '第二章 发展' },
    { title: '第三章 高潮' },
    { title: '第四章 结局' },
    { title: '第五章 番外' },
  ]

  it('oldIndex 为 0 时返回 0', () => {
    expect(findChapterIndex(0, '第一章', newChapters, 5)).toBe(0)
  })

  it('通过章节号匹配', () => {
    expect(findChapterIndex(2, '第三章 高潮', newChapters, 5)).toBe(2)
  })

  it('通过纯名称相似度匹配', () => {
    expect(findChapterIndex(1, '第二章 发展', newChapters, 5)).toBe(1)
  })

  it('新列表为空时返回 oldIndex', () => {
    expect(findChapterIndex(3, '第四章', [], 5)).toBe(3)
  })

  it('oldTitle 为 null 时返回 oldIndex', () => {
    expect(findChapterIndex(2, null, newChapters, 5)).toBe(2)
  })

  it('oldIndex 超出范围时返回限制后的值', () => {
    expect(findChapterIndex(10, '第十章', newChapters, 5)).toBe(4)
  })

  it('估算位置在范围内时返回正确索引', () => {
    const largeList = Array.from({ length: 100 }, (_, i) => ({ title: `第${i + 1}章` }))
    expect(findChapterIndex(50, '第51章', largeList, 100)).toBe(50)
  })

  it('oldChapterListSize 为 0 时使用 oldIndex 直接搜索', () => {
    expect(findChapterIndex(1, '第二章', newChapters, 0)).toBe(1)
  })
})
