// ============================================
// RuleExecutor 主流程单元测试
// ============================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuleExecutor } from '../../../../engine/parser/rule-executor.js'
import { setJsRuntime } from '../../../../engine/parser/js-executor.js'
import type { JsRuntime } from '../../../../engine/types.js'

const mockJsRuntime: JsRuntime = {
  execute: async (code: string, context: Record<string, unknown>) => {
    if (code.includes('result.name')) {
      return String((context.result as Record<string, unknown>)?.name || '')
    }
    if (code.includes('result')) {
      return String(context.result || '')
    }
    return code
  },
}

describe('RuleExecutor', () => {
  beforeAll(() => {
    setJsRuntime(mockJsRuntime)
  })

  afterAll(() => {
    setJsRuntime(null as unknown as JsRuntime)
  })

  it('getString 空规则返回空字符串', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.getString('')
    expect(result).toBe('')
  })

  it('getString null 规则返回空字符串', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.getString(null)
    expect(result).toBe('')
  })

  it('getStringList 空规则返回空数组', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.getStringList('')
    expect(result).toEqual([])
  })

  it('getElements 空规则返回空数组', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.getElements('')
    expect(result).toEqual([])
  })

  it('getElement 空规则返回 null', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.getElement('')
    expect(result).toBeNull()
  })

  it('evalJS 空 JS 返回空字符串', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.evalJS('')
    expect(result).toBe('')
  })

  it('evalJS 简单 JS 返回 mock 结果', async () => {
    const executor = new RuleExecutor()
    executor.setContent('<div>test</div>')
    const result = await executor.evalJS('result.name', { name: '测试' })
    expect(result).toBe('测试')
  })

  it('setContent + getString 普通字符串', async () => {
    const executor = new RuleExecutor()
    executor.setContent('{"name":"测试书籍"}')
    // 不做实际规则解析，仅验证方法可调用不抛异常
    const result = await executor.getString('$.name')
    expect(typeof result).toBe('string')
  })

  it('setVariableProvider / setVariableSetter 注入', async () => {
    const executor = new RuleExecutor()
    let storedValue = ''
    executor.setVariableProvider((key) => key.toUpperCase())
    executor.setVariableSetter((key, value) => { storedValue = value })
    // 验证方法可调用不抛异常
    expect(storedValue).toBe('')
  })

  it('setWebJsExecutor 注入', async () => {
    const executor = new RuleExecutor()
    executor.setWebJsExecutor(async (html, jsCode, baseUrl) => {
      return html + jsCode + baseUrl
    })
    // 验证方法可调用不抛异常
    expect(true).toBe(true)
  })
})
