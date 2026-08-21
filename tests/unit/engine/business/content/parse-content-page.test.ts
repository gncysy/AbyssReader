// ============================================
// parseContentPage 纯文本路径单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { parseContentPage } from '../../../../../engine/business/content/fetcher-parser.js'
import type { EngineBookSource } from '../../../../../engine/types.js'

const mockSource: EngineBookSource = {
  bookSourceName: '测试书源',
  bookSourceUrl: 'https://example.com',
  bookSourceType: 0,
  ruleContent: {
    content: '',
  },
}

describe('parseContentPage 纯文本路径', () => {
  it('content 规则为空时使用 stripHtml 处理 HTML', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '<div><p>正文内容</p><p>第二段</p></div>',
      { content: '', sourceRegex: '', imageStyle: null, nextContentUrl: '' },
      chapter,
      mockSource,
      '',
      false
    )

    expect(result.content).toContain('正文内容')
    expect(result.content).toContain('第二段')
    expect(result.nextUrls).toEqual([])
  })

  it('content 规则为空且 HTML 很短（<50 字符）也使用 stripHtml', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '<p>短内容</p>',
      { content: '', sourceRegex: '', imageStyle: null, nextContentUrl: '' },
      chapter,
      mockSource,
      '',
      false
    )

    expect(result.content).toContain('短内容')
  })

  it('bookSourceType=2（漫画）且 content 为空规则时也走 stripHtml', async () => {
    const comicSource: EngineBookSource = {
      ...mockSource,
      bookSourceType: 2,
    }
    const book = { name: '测试漫画', author: '测试作者' }
    const chapter = { id: 0, title: '第一话', url: 'https://example.com/ch/1', index: 0 }

    const html = '<div><p>漫画描述文字</p><img src="https://img.example.com/1.jpg"></div>'
    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      html,
      { content: '', sourceRegex: '', imageStyle: null, nextContentUrl: '' },
      chapter,
      comicSource,
      '',
      false
    )

    // 漫画模式下 content 规则为空 → 走 stripHtml → img 标签被去除
    expect(result.content).toContain('漫画描述文字')
    expect(result.content).not.toContain('<img')
  })

  it('getNextPageUrl=false 不获取下一页', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '<p>正文</p>',
      { content: '', sourceRegex: '', imageStyle: null, nextContentUrl: '' },
      chapter,
      mockSource,
      '',
      false
    )

    expect(result.nextUrls).toEqual([])
  })

  it('空 HTML 返回空内容', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '',
      { content: '', sourceRegex: '', imageStyle: null, nextContentUrl: '' },
      chapter,
      mockSource,
      '',
      false
    )

    expect(result.content).toBe('')
  })
})
