// ============================================
// 搜索解析纯函数单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import {
  formatBookName,
  formatBookAuthor,
  isValidBookName,
  cleanIntro,
  formatWordCount,
  matchesBookUrlPattern,
} from '../../../../../engine/business/search/parser.js'

describe('formatBookName', () => {
  it('移除"作者"后缀', () => {
    expect(formatBookName('三体 作者 刘慈欣')).toBe('三体')
  })

  it('移除"著"后缀', () => {
    expect(formatBookName('三体 刘慈欣 著')).toBe('三体')
  })

  it('无后缀时保持原样', () => {
    expect(formatBookName('三体')).toBe('三体')
  })

  it('返回去除首尾空格', () => {
    expect(formatBookName('  三体  ')).toBe('三体')
  })
})

describe('formatBookAuthor', () => {
  it('移除"作者:"前缀', () => {
    expect(formatBookAuthor('作者: 刘慈欣')).toBe('刘慈欣')
  })

  it('移除"作者："前缀（全角冒号）', () => {
    expect(formatBookAuthor('作者：刘慈欣')).toBe('刘慈欣')
  })

  it('移除"著"后缀', () => {
    expect(formatBookAuthor('刘慈欣 著')).toBe('刘慈欣')
  })

  it('无前后缀时保持原样', () => {
    expect(formatBookAuthor('刘慈欣')).toBe('刘慈欣')
  })
})

describe('isValidBookName', () => {
  it('正常书名返回 true', () => {
    expect(isValidBookName('三体')).toBe(true)
  })

  it('空字符串返回 false', () => {
    expect(isValidBookName('')).toBe(false)
  })

  it('超过 100 字符返回 false', () => {
    expect(isValidBookName('a'.repeat(101))).toBe(false)
  })

  it('刚好 100 字符返回 true', () => {
    expect(isValidBookName('a'.repeat(100))).toBe(true)
  })

  it('包含过多 HTML 标签返回 false', () => {
    expect(isValidBookName('<a><b><c><d>test</d></c></b></a>')).toBe(false)
  })

  it('包含少量 HTML 标签返回 true', () => {
    expect(isValidBookName('<b>test</b>')).toBe(true)
  })
})

describe('cleanIntro', () => {
  it('去除 HTML 标签', () => {
    expect(cleanIntro('<p>这是一段<b>简介</b></p>')).toBe('这是一段 简介')
  })

  it('压缩多余空白（HTML 标签被替换为空格后再压缩）', () => {
    expect(cleanIntro('  这是\n\n  一段\n  简介  ')).toBe('这是 一段 简介')
  })

  it('截断到最大长度', () => {
    expect(cleanIntro('a'.repeat(600))).toHaveLength(500)
  })

  it('空字符串返回空字符串', () => {
    expect(cleanIntro('')).toBe('')
  })

  it('usehtml 标记的内容原样返回', () => {
    const html = '<usehtml><p>保留 HTML</p></usehtml>'
    expect(cleanIntro(html)).toBe(html)
  })
})

describe('formatWordCount', () => {
  it('小于 10000 返回原数字', () => {
    expect(formatWordCount('9999字')).toBe('9999')
  })

  it('大于等于 10000 转换为万字', () => {
    expect(formatWordCount('12345字')).toBe('1.2万')
  })

  it('纯数字直接返回', () => {
    expect(formatWordCount('5000')).toBe('5000')
  })

  it('非数字返回原值', () => {
    expect(formatWordCount('未知')).toBe('未知')
  })
})

describe('matchesBookUrlPattern', () => {
  it('匹配 URL', () => {
    expect(matchesBookUrlPattern('https://example.com/book/123', 'example\\.com/book/\\d+')).toBe(true)
  })

  it('不匹配 URL', () => {
    expect(matchesBookUrlPattern('https://example.com/chapter/1', 'example\\.com/book/\\d+')).toBe(false)
  })

  it('无 pattern 返回 false', () => {
    expect(matchesBookUrlPattern('https://example.com', null)).toBe(false)
  })

  it('无效正则返回 false', () => {
    expect(matchesBookUrlPattern('https://example.com', '[')).toBe(false)
  })
})
