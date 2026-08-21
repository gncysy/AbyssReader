import { describe, it, expect } from 'vitest'
import { RuleParser } from '../../../../engine/parser/rule-parser.js'

describe('RuleParser.splitSourceRule 对 @css:...@js:... 的拆分', () => {
  it('应拆分为两个规则：CSS + JS', () => {
    const parser = new RuleParser()
    const ruleStr = '@css:.cover-box .bg img@src@js:result + ",{"headers":{"Referer":"https://example.com/"}}"'
    const rules = parser.splitSourceRule(ruleStr)

    console.log('规则数量:', rules.length)
    for (let i = 0; i < rules.length; i++) {
      console.log(`规则[${i}]: mode=${rules[i]?.mode}, rule=${rules[i]?.rule}`)
    }

    expect(rules.length).toBe(2)
    expect(rules[0]?.mode).toBe('default')
    expect(rules[1]?.mode).toBe('js')
  })
})
