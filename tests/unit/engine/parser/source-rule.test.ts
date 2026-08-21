// ============================================
// SourceRule 单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { SourceRule } from '../../../../engine/parser/source-rule.js'

describe('SourceRule 构造', () => {
  it('默认模式', () => {
    const rule = new SourceRule('tag.body@text')
    expect(rule.mode).toBe('default')
    expect(rule.rule).toBe('tag.body@text')
  })

  it('CSS 前缀 @css:', () => {
    const rule = new SourceRule('@css:tag.body@text')
    expect(rule.mode).toBe('default')
    expect(rule.rule).toBe('@css:tag.body@text')
  })

  it('XPath 前缀 @xpath:', () => {
    const rule = new SourceRule('@xpath://div[@class="title"]')
    expect(rule.mode).toBe('xpath')
    expect(rule.rule).toBe('//div[@class="title"]')
  })

  it('JSONPath 前缀 @json:', () => {
    const rule = new SourceRule('@json:$.data.list')
    expect(rule.mode).toBe('json')
    expect(rule.rule).toBe('$.data.list')
  })

  it('@@ 开头去除两个 @', () => {
    const rule = new SourceRule('@@pattern')
    expect(rule.mode).toBe('default')
    expect(rule.rule).toBe('pattern')
  })

  it('## 分隔替换规则', () => {
    const rule = new SourceRule('pattern##replaceRegex##replacement')
    expect(rule.replaceRegex).toBe('replaceRegex')
    expect(rule.replacement).toBe('replacement')
  })

  it('## 四段时 replaceFirst 为 true', () => {
    const rule = new SourceRule('pattern##regex##replacement##true')
    expect(rule.replaceFirst).toBe(true)
  })

  it('@put:{} 提取 putMap', () => {
    const rule = new SourceRule('@put:{"key1":"value1","key2":"value2"}tag.body@text')
    expect(rule.putMap).toEqual({ key1: 'value1', key2: 'value2' })
    expect(rule.rule).toBe('tag.body@text')
  })

  it('JS 模式', () => {
    const rule = new SourceRule('@js:result.name')
    expect(rule.mode).toBe('js')
  })

  it('cloneForExecution 复制状态', () => {
    const rule = new SourceRule('@put:{"k":"v"}tag.body@text##regex##repl')
    const clone = rule.cloneForExecution()
    expect(clone.rule).toBe(rule.rule)
    expect(clone.mode).toBe(rule.mode)
    expect(clone.replaceRegex).toBe(rule.replaceRegex)
    expect(clone.replacement).toBe(rule.replacement)
    expect(clone.putMap).toEqual(rule.putMap)
    expect(clone).not.toBe(rule)
  })
})

describe('SourceRule.makeUpRule', () => {
  it('无规则参数时原样返回', async () => {
    const rule = new SourceRule('tag.body@text')
    await rule.makeUpRule('input', async () => '', () => '', async () => '')
    expect(rule.rule).toBe('tag.body@text')
  })

  it('$1 引用取数组第二个元素（与 Legado 一致）', async () => {
    const rule = new SourceRule('$1')
    await rule.makeUpRule(['value1', 'value2'], async () => '', () => '', async () => '')
    expect(rule.rule).toBe('value2')
  })

  it('处理 {{js}} 内嵌 JS', async () => {
    const rule = new SourceRule('{{result.name}}')
    await rule.makeUpRule({ name: 'test' }, async (js: string) => {
      if (js === 'result.name') return 'test'
      return ''
    }, () => '', async () => '')
    expect(rule.rule).toBe('test')
  })

  it('处理 @get:{key}', async () => {
    const rule = new SourceRule('@get:{myKey}')
    await rule.makeUpRule('input', async () => '', (key) => 'value_' + key, async () => '')
    expect(rule.rule).toBe('value_myKey')
  })
})
