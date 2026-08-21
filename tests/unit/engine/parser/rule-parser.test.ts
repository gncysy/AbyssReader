// ============================================
// RuleParser 规则拆分单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { RuleParser } from '../../../../engine/parser/rule-parser.js'

describe('RuleParser.isJsonString', () => {
  const parser = new RuleParser()

  it('合法 JSON 返回 true', () => {
    expect(parser.isJsonString('{"name":"test"}')).toBe(true)
    expect(parser.isJsonString('[1,2,3]')).toBe(true)
    expect(parser.isJsonString('"string"')).toBe(true)
    expect(parser.isJsonString('123')).toBe(true)
  })

  it('非法 JSON 返回 false', () => {
    expect(parser.isJsonString('not json')).toBe(false)
    expect(parser.isJsonString('<html>')).toBe(false)
    expect(parser.isJsonString('')).toBe(false)
  })
})

describe('RuleParser.isHtmlString', () => {
  const parser = new RuleParser()

  it('HTML 字符串返回 true', () => {
    expect(parser.isHtmlString('<div>')).toBe(true)
    expect(parser.isHtmlString('  <p>正文</p>')).toBe(true)
  })

  it('非 HTML 返回 false', () => {
    expect(parser.isHtmlString('plain text')).toBe(false)
    expect(parser.isHtmlString('')).toBe(false)
  })
})

describe('RuleParser.splitSourceRule', () => {
  const parser = new RuleParser()

  it('普通规则', () => {
    const rules = parser.splitSourceRule('tag.body@text')
    expect(rules.length).toBe(1)
    expect(rules[0]?.rule).toBe('tag.body@text')
    expect(rules[0]?.mode).toBe('default')
  })

  it('空字符串返回空数组', () => {
    expect(parser.splitSourceRule('')).toEqual([])
  })

  it('@js: 规则', () => {
    const rules = parser.splitSourceRule('@js:result.name')
    expect(rules.length).toBe(1)
    expect(rules[0]?.rule).toBe('result.name')
    expect(rules[0]?.mode).toBe('js')
  })

  it('<js></js> 规则', () => {
    const rules = parser.splitSourceRule('<js>result.name</js>')
    expect(rules.length).toBe(1)
    expect(rules[0]?.rule).toBe('result.name')
    expect(rules[0]?.mode).toBe('js')
  })

  it('混合规则（CSS + JS）', () => {
    const rules = parser.splitSourceRule('tag.body@text@js:result + ",header"')
    expect(rules.length).toBe(2)
    expect(rules[0]?.mode).toBe('default')
    expect(rules[0]?.rule).toBe('tag.body@text')
    expect(rules[1]?.mode).toBe('js')
    expect(rules[1]?.rule).toBe('result + ",header"')
  })

  it('@CSS: 前缀', () => {
    const rules = parser.splitSourceRule('@CSS:tag.body@text')
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('default')
    expect(rules[0]?.rule).toBe('@CSS:tag.body@text')
  })

  it('@XPath: 前缀', () => {
    const rules = parser.splitSourceRule('@XPath://div[@class="title"]')
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('xpath')
    expect(rules[0]?.rule).toBe('//div[@class="title"]')
  })

  it('@Json: 前缀', () => {
    const rules = parser.splitSourceRule('@Json:$.data.list')
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('json')
    expect(rules[0]?.rule).toBe('$.data.list')
  })

  it('JSON 模式自动检测', () => {
    const jsonParser = new RuleParser(true)
    const rules = jsonParser.splitSourceRule('$.data.list')
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('json')
  })

  it('allInOne + : 前缀 → regex 模式', () => {
    const rules = parser.splitSourceRule(':pattern', true)
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('regex')
  })

  it('@webjs: 规则', () => {
    const rules = parser.splitSourceRule('@webjs:document.querySelector("body")')
    expect(rules.length).toBe(1)
    expect(rules[0]?.mode).toBe('webjs')
    expect(rules[0]?.rule).toBe('document.querySelector("body")')
  })
})

describe('RuleParser.splitSourceRuleCacheString', () => {
  it('缓存命中返回克隆', () => {
    const parser = new RuleParser()
    const cache = new Map<string, import('../../../../engine/parser/source-rule.js').SourceRule[]>()
    const ruleStr = 'tag.body@text'

    const first = parser.splitSourceRuleCacheString(ruleStr, cache)
    const second = parser.splitSourceRuleCacheString(ruleStr, cache)

    expect(first.length).toBe(1)
    expect(second.length).toBe(1)
    expect(first[0]).not.toBe(second[0]) // 克隆而非同一引用
    expect(first[0]?.rule).toBe(second[0]?.rule)
  })
})

describe('RuleParser.detectMode', () => {
  const parser = new RuleParser()

  it('CSS', () => {
    expect(parser.detectMode('@css:tag.body')).toBe('default')
    expect(parser.detectMode('tag.body')).toBe('default')
  })

  it('XPath', () => {
    expect(parser.detectMode('@xpath://div')).toBe('xpath')
    expect(parser.detectMode('//div[@class="x"]')).toBe('xpath')
  })

  it('JSONPath', () => {
    expect(parser.detectMode('@json:$.data')).toBe('json')
    expect(parser.detectMode('$.data.list')).toBe('json')
  })

  it('JS', () => {
    expect(parser.detectMode('@js:result')).toBe('js')
    expect(parser.detectMode('<js>result</js>')).toBe('js')
  })

  it('WebJS', () => {
    expect(parser.detectMode('@webjs:document.body')).toBe('webjs')
  })
})
