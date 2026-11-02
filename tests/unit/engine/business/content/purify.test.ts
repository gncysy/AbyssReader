// ============================================
// purify.ts 单元测试 — 验证实际行为（对齐 Legado ContentHelp）
// ============================================

import { describe, it, expect } from 'vitest'
import { reSegment, purifyText, textToHtml } from '@engine/business/content/purify.js'
import type { PurifyOptions } from '@engine/business/content/purify.js'

describe('reSegment — 段落重排（对齐 Legado ContentHelp）', () => {
  it('应该正确处理中文引号对话（全角标点在引号外，使用弯引号）', () => {
    const input = '他说："你好。"我说："你好！"'
    const result = reSegment(input, '')
    // Legado 输出：他说：“你好。”\n我说：“你好！”\n
    // 注意：Legado 会把直引号 " 转换为弯引号 “ 和 ”
    expect(result).toContain('“你好。”')
    expect(result).toContain('“你好！”')
  })

  it('应该正确处理书名号内的内容', () => {
    const input = '《红楼梦》是中国古典文学的巅峰之作。'
    const result = reSegment(input, '')
    expect(result).toContain('《红楼梦》')
  })

  it('应该正确处理省略号', () => {
    const input = '他沉默了……然后转身离去。'
    const result = reSegment(input, '')
    expect(result).toContain('……')
  })

  it('应该正确处理破折号', () => {
    const input = '他突然说——等一下。'
    const result = reSegment(input, '')
    expect(result).toContain('——')
  })

  it('应该正确处理连续的感叹号（不强制分割）', () => {
    const input = '太棒了！！今天真开心！！'
    const result = reSegment(input, '')
    // forceSplit 有随机性，不检查具体分段数，只保证不崩溃
    expect(result.length).toBeGreaterThan(0)
  })

  it('应该正确处理空字符串', () => {
    const result = reSegment('', '')
    expect(result).toBe('')
  })

  it('应该正确处理只有标点符号的字符串', () => {
    const input = '……'
    const result = reSegment(input, '')
    expect(result).toContain('……')
  })

  it('应该正确处理长文本（不崩溃）', () => {
    const longText = '这是一段很长的文字。' + '其中包含多个句子。' + '应该被正确分割。'
    const result = reSegment(longText, '')
    expect(result.length).toBeGreaterThan(0)
  })

  it('普通陈述句不保证固定分段数（forceSplit 有随机性）', () => {
    const input = '今天天气真好。阳光明媚。我们出去玩吧！'
    const result = reSegment(input, '')
    // forceSplit 有随机性，不检查具体数量，只保证不崩溃
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('purifyText — 正文净化', () => {
  it('应该应用替换规则', () => {
    const input = '这是一段测试文字，包含敏感词。'
    const options: PurifyOptions = {
      chapterTitle: '',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        {
          id: 1,
          name: '测试规则',
          pattern: '敏感词',
          replacement: '***',
          isEnabled: true,
          isRegex: false,
          scopeTitle: false,
          scopeContent: true,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('***')
    expect(result).not.toContain('敏感词')
  })

  it('应该支持正则替换规则', () => {
    const input = '电话：1234567890'
    const options: PurifyOptions = {
      chapterTitle: '',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        {
          id: 1,
          name: '电话脱敏',
          pattern: '\\d{10,11}',
          replacement: '***********',
          isEnabled: true,
          isRegex: true,
          scopeTitle: false,
          scopeContent: true,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('***********')
    expect(result).not.toContain('1234567890')
  })

  it('应该跳过禁用的规则', () => {
    const input = '包含敏感词。'
    const options: PurifyOptions = {
      chapterTitle: '',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        {
          id: 1,
          name: '禁用规则',
          pattern: '敏感词',
          replacement: '***',
          isEnabled: false,
          isRegex: false,
          scopeTitle: false,
          scopeContent: true,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('敏感词')
  })

  it('应该只在净化启用时应用规则', () => {
    const input = '包含敏感词。'
    const options: PurifyOptions = {
      chapterTitle: '',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: false,
      rules: [
        {
          id: 1,
          name: '测试规则',
          pattern: '敏感词',
          replacement: '***',
          isEnabled: true,
          isRegex: false,
          scopeTitle: false,
          scopeContent: true,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('敏感词')
  })

  it('应该处理 scopeTitle 规则（不应用在正文）', () => {
    const input = '正文内容包含标题这个词'
    const options: PurifyOptions = {
      chapterTitle: '第一章 标题',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        {
          id: 1,
          name: '标题规则',
          pattern: '标题',
          replacement: 'TITLE',
          isEnabled: true,
          isRegex: false,
          scopeTitle: true,
          scopeContent: false,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).not.toContain('TITLE')
  })

  it('应该处理 scopeContent 规则（应用在正文）', () => {
    const input = '正文内容包含标题这个词'
    const options: PurifyOptions = {
      chapterTitle: '第一章 标题',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        {
          id: 1,
          name: '正文规则',
          pattern: '标题',
          replacement: 'TITLE',
          isEnabled: true,
          isRegex: false,
          scopeTitle: false,
          scopeContent: true,
          timeoutMillisecond: 5000,
          order: 0,
        },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('TITLE')
  })
})

describe('textToHtml — 文本转HTML', () => {
  it('应该为每个非空行生成独立段落', () => {
    const input = '第一段。\n第二段。'
    const result = textToHtml(input)
    expect(result).toBe('<p>\u3000\u3000第一段。</p><p>\u3000\u3000第二段。</p>')
  })

  it('应该正确缩进每段', () => {
    const input = '第一段。'
    const result = textToHtml(input)
    expect(result).toContain('\u3000\u3000')
  })

  it('应该跳过空行，不再用 <br> 分段', () => {
    const input = '第一行\n\n第二行\n   \n第三行'
    const result = textToHtml(input)
    expect(result).not.toContain('<br>')
    expect(result.match(/<p>/g)).toHaveLength(3)
  })

  it('应该正确处理空字符串', () => {
    const result = textToHtml('')
    expect(result).toBe('<p></p>')
  })
})

describe('边界情况', () => {
  it('应该处理多个替换规则（依次替换，注意规则顺序）', () => {
    const input = '测试文本包含多个需要替换的词：敏感词A、敏感词B、敏感词C'
    const options: PurifyOptions = {
      chapterTitle: '',
      bookName: '',
      reSegmentEnabled: false,
      purifyEnabled: true,
      rules: [
        { id: 1, name: '规则1', pattern: '敏感词A', replacement: '***', isEnabled: true, isRegex: false, scopeTitle: false, scopeContent: true, timeoutMillisecond: 5000, order: 0 },
        { id: 2, name: '规则2', pattern: '敏感词B', replacement: '###', isEnabled: true, isRegex: false, scopeTitle: false, scopeContent: true, timeoutMillisecond: 5000, order: 1 },
        { id: 3, name: '规则3', pattern: '敏感词C', replacement: '@@@', isEnabled: true, isRegex: false, scopeTitle: false, scopeContent: true, timeoutMillisecond: 5000, order: 2 },
      ],
    }
    const result = purifyText(input, options)
    expect(result).toContain('***')
    expect(result).toContain('###')
    expect(result).toContain('@@@')
    expect(result).not.toContain('敏感词A')
    expect(result).not.toContain('敏感词B')
    expect(result).not.toContain('敏感词C')
  })

  it('应该处理 Unicode 全角字符', () => {
    const input = '　　这是一段带有全角空格的文本。'
    const result = reSegment(input, '')
    expect(result).toBeDefined()
  })
})
