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

  it('分页链接指向下一章时被过滤，不会把下一章拼进来', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    // 模拟书源最后一页：第三个数量的「下一页」实际是「下一章」
    const evaluator = {
      getString: async () => '<p>' + '正文'.repeat(40) + '</p>',
      getStringList: async () => [
        'https://example.com/ch/1-2.html',
        'https://example.com/ch/2.html',
      ],
      getElements: async () => [],
    } as unknown as Parameters<typeof parseContentPage>[9]

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '<div class="con"><p>' + '正文'.repeat(40) + '</p></div>',
      { content: '@css:.con p@text', sourceRegex: '', imageStyle: null, nextContentUrl: '@css:.prenext span:eq(2) a@href' },
      chapter,
      mockSource,
      'https://example.com/ch/2.html',
      true,
      evaluator
    )

    expect(result.nextUrls).toEqual(['https://example.com/ch/1-2.html'])
  })

  it('nextChapterUrl 末尾带斜杠也能匹配过滤', async () => {
    const book = { name: '测试书', author: '测试作者' }
    const chapter = { id: 0, title: '第一章', url: 'https://example.com/ch/1', index: 0 }

    const evaluator = {
      getString: async () => '<p>' + '正文'.repeat(40) + '</p>',
      getStringList: async () => ['https://example.com/ch/2.html'],
      getElements: async () => [],
    } as unknown as Parameters<typeof parseContentPage>[9]

    const result = await parseContentPage(
      book,
      'https://example.com',
      'https://example.com/ch/1',
      '<div class="con"><p>' + '正文'.repeat(40) + '</p></div>',
      { content: '@css:.con p@text', sourceRegex: '', imageStyle: null, nextContentUrl: '@css:.prenext span:eq(2) a@href' },
      chapter,
      mockSource,
      'https://example.com/ch/2.html/',
      true,
      evaluator
    )

    expect(result.nextUrls).toEqual([])
  })
})
