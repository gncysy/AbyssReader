// ============================================
// 目录解析纯函数单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { parseTocJson, dedupChapters } from '../../../../../engine/business/book/toc-parser.js'

describe('parseTocJson', () => {
  it('解析标准 JSON 目录', () => {
    const json = JSON.stringify({
      data: {
        list: [
          { chapterId: 1, chapterName: '第一章' },
          { chapterId: 2, chapterName: '第二章' },
        ],
      },
    })
    const chapters = parseTocJson(json, 'https://example.com')
    expect(chapters).toHaveLength(2)
    expect(chapters[0]?.title).toBe('第一章')
    expect(chapters[0]?.url).toBe('https://example.com/chapter/1')
    expect(chapters[1]?.title).toBe('第二章')
    expect(chapters[1]?.url).toBe('https://example.com/chapter/2')
  })

  it('支持 title/name 字段', () => {
    const json = JSON.stringify({
      data: {
        list: [
          { title: '第一章' },
          { name: '第二章' },
        ],
      },
    })
    const chapters = parseTocJson(json, 'https://example.com')
    expect(chapters).toHaveLength(2)
    expect(chapters[0]?.title).toBe('第一章')
    expect(chapters[1]?.title).toBe('第二章')
  })

  it('支持 url/path 字段', () => {
    const json = JSON.stringify({
      data: {
        list: [
          { title: '第一章', url: '/ch/1' },
          { title: '第二章', path: '/ch/2' },
        ],
      },
    })
    const chapters = parseTocJson(json, 'https://example.com')
    expect(chapters).toHaveLength(2)
    expect(chapters[0]?.url).toBe('https://example.com/ch/1')
    expect(chapters[1]?.url).toBe('https://example.com/ch/2')
  })

  it('非 JSON 字符串返回空数组', () => {
    expect(parseTocJson('not json', 'https://example.com')).toEqual([])
  })

  it('空字符串返回空数组', () => {
    expect(parseTocJson('', 'https://example.com')).toEqual([])
  })

  it('缺少 data.list 结构返回空数组', () => {
    const json = JSON.stringify({ foo: 'bar' })
    expect(parseTocJson(json, 'https://example.com')).toEqual([])
  })

  it('正确设置 index 和 id', () => {
    const json = JSON.stringify({
      data: {
        list: [
          { chapterId: 10, chapterName: '第一章' },
          { chapterId: 20, chapterName: '第二章' },
        ],
      },
    })
    const chapters = parseTocJson(json, 'https://example.com')
    expect(chapters[0]?.index).toBe(0)
    expect(chapters[0]?.id).toBe(0)
    expect(chapters[1]?.index).toBe(1)
    expect(chapters[1]?.id).toBe(1)
  })
})

describe('dedupChapters', () => {
  it('按 url 去重', () => {
    const chapters = [
      { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 },
      { id: 1, title: '第一章重复', url: 'https://example.com/ch/1', index: 1 },
      { id: 2, title: '第二章', url: 'https://example.com/ch/2', index: 2 },
    ]
    const result = dedupChapters(chapters)
    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('第一章')
    expect(result[1]?.title).toBe('第二章')
  })

  it('url 为空时按 title 去重', () => {
    const chapters = [
      { id: 0, title: '第一章', url: '', index: 0 },
      { id: 1, title: '第一章', url: '', index: 1 },
      { id: 2, title: '第二章', url: '', index: 2 },
    ]
    const result = dedupChapters(chapters)
    expect(result).toHaveLength(2)
  })

  it('空数组返回空数组', () => {
    expect(dedupChapters([])).toEqual([])
  })
})
