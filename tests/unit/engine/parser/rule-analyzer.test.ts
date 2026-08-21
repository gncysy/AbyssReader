// ============================================
// RuleAnalyzer 规则拆分单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { RuleAnalyzer } from '../../../../engine/parser/rule-analyzer.js'

describe('RuleAnalyzer.splitRule', () => {
  it('无分隔符时返回原字符串', () => {
    const analyzer = new RuleAnalyzer('tag.body@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual(['tag.body@text'])
  })

  it('按 && 拆分', () => {
    const analyzer = new RuleAnalyzer('tag.a@text&&tag.b@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual(['tag.a@text', 'tag.b@text'])
  })

  it('按 || 拆分', () => {
    const analyzer = new RuleAnalyzer('tag.a@text||tag.b@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual(['tag.a@text', 'tag.b@text'])
  })

  it('按 %% 拆分', () => {
    const analyzer = new RuleAnalyzer('tag.a@text%%tag.b@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual(['tag.a@text', 'tag.b@text'])
  })

  it('处理括号内的分隔符', () => {
    const analyzer = new RuleAnalyzer('tag.a[contains(@class,"&&")]@text&&tag.b@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual([
      'tag.a[contains(@class,"&&")]@text',
      'tag.b@text',
    ])
  })

  it('处理方括号内的分隔符', () => {
    const analyzer = new RuleAnalyzer('tag.a[attr="x||y"]@text||tag.b@text')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual([
      'tag.a[attr="x||y"]@text',
      'tag.b@text',
    ])
  })

  it('拆分后 elementsType 正确', () => {
    const analyzer = new RuleAnalyzer('a&&b')
    analyzer.splitRule('&&', '||', '%%')
    expect(analyzer.elementsType).toBe('&&')
  })

  it('空字符串返回空数组', () => {
    const analyzer = new RuleAnalyzer('')
    expect(analyzer.splitRule('&&', '||', '%%')).toEqual([])
  })
})

describe('RuleAnalyzer.innerRule', () => {
  it('提取 {{}} 内内容', () => {
    const analyzer = new RuleAnalyzer('a{{result}}b')
    const result = analyzer.innerRule('{{', 2, 2, (inner) => inner.toUpperCase())
    expect(result).toContain('RESULT')
  })

  it('无匹配时返回空字符串', () => {
    const analyzer = new RuleAnalyzer('abcdef')
    const result = analyzer.innerRule('{{', 2, 2, (inner) => inner)
    expect(result).toBe('')
  })
})
