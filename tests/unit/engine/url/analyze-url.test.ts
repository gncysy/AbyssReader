// ============================================
// analyzeUrl 主函数单元测试
// ============================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { analyzeUrl } from '../../../../engine/url/index.js'
import { setJsRuntime } from '../../../../engine/parser/js-executor.js'
import type { JsRuntime } from '../../../../engine/types.js'

// 记录 mock runtime 被调用的代码
const jsCalls: string[] = []

// 简单的 JS 运行时 mock
const mockJsRuntime: JsRuntime = {
  execute: async (code: string, context: Record<string, unknown>) => {
    jsCalls.push(code)

    if (code.trim() === 'key') {
      return String(context.key || '')
    }
    if (code.trim() === 'page') {
      return String(context.page || '')
    }
    if (code === 'returnExtra') {
      return 'https://example.com/api/extra'
    }
    return code
  },
}

describe('analyzeUrl', () => {
  beforeAll(() => {
    setJsRuntime(mockJsRuntime)
  })

  afterAll(() => {
    setJsRuntime(null as unknown as JsRuntime)
  })

  beforeEach(() => {
    jsCalls.length = 0
  })

  it('普通 URL 无选项', async () => {
    const result = await analyzeUrl('https://example.com/page', {
      baseUrl: 'https://example.com',
    })
    expect(result.url).toBe('https://example.com/page')
    expect(result.method).toBe('GET')
    expect(result.body).toBeNull()
  })

  it('相对 URL 拼接', async () => {
    const result = await analyzeUrl('/chapter/123', {
      baseUrl: 'https://example.com',
    })
    expect(result.url).toBe('https://example.com/chapter/123')
  })

  it('{{page}} 替换', async () => {
    const result = await analyzeUrl('https://example.com/list?page={{page}}', {
      baseUrl: 'https://example.com',
      page: 3,
    })
    expect(result.url).toBe('https://example.com/list?page=3')
  })

  it('{{key}} 替换并编码', async () => {
    const result = await analyzeUrl('https://example.com/search?q={{key}}', {
      baseUrl: 'https://example.com',
      key: '三体',
    })
    expect(result.url).toContain('q=')
  })

  it('URL 选项解析（method POST + body）', async () => {
    const ruleUrl = 'https://example.com/api,{"method":"POST","body":"page=1&key=test"}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.method).toBe('POST')
    expect(result.body).toBe('page=1&key=test')
  })

  it('URL 选项解析（headers）', async () => {
    const ruleUrl = 'https://example.com/api,{"headers":{"X-Requested-With":"XMLHttpRequest"}}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.headers['X-Requested-With']).toBe('XMLHttpRequest')
  })

  it('URL 选项解析（charset / retry）', async () => {
    const ruleUrl = 'https://example.com/api,{"charset":"gbk","retry":3}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.charset).toBe('gbk')
    expect(result.retry).toBe(3)
  })

  it('URL 选项解析（webView）', async () => {
    const ruleUrl = 'https://example.com/api,{"webView":true}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.useWebView).toBe(true)
  })

  it('URL 选项解析（webView: "false" 字符串）', async () => {
    const ruleUrl = 'https://example.com/api,{"webView":"false"}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.useWebView).toBe(false)
  })

  it('URL 选项解析（webJs / bodyJs）', async () => {
    const ruleUrl = 'https://example.com/api,{"webJs":"document.body","bodyJs":"result.trim()"}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.webJs).toBe('document.body')
    expect(result.bodyJs).toBe('result.trim()')
  })

  it('URL 选项解析（js 后处理）', async () => {
    // 使用不带内部引号的 js 代码避免 JSON 转义问题
    const ruleUrl = 'https://example.com/api,{"js":"returnExtra"}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(jsCalls.length).toBeGreaterThan(0)
    expect(result.url).toBe('https://example.com/api/extra')
  })

  it('页码 <page1,page2> 替换', async () => {
    const result = await analyzeUrl('https://example.com/<page1,page2>', {
      baseUrl: 'https://example.com',
      page: 1,
    })
    expect(result.url).toBe('https://example.com/page1')
  })

  it('页码 <page1,page2> 第二页', async () => {
    const result = await analyzeUrl('https://example.com/<page1,page2>', {
      baseUrl: 'https://example.com',
      page: 2,
    })
    expect(result.url).toBe('https://example.com/page2')
  })

  it('headerMap 合并到结果', async () => {
    const result = await analyzeUrl('https://example.com/api', {
      baseUrl: 'https://example.com',
      headerMap: { 'User-Agent': 'test-ua' },
    })
    expect(result.headers['User-Agent']).toBe('test-ua')
  })

  it('body 为 null 的 POST', async () => {
    const ruleUrl = 'https://example.com/api,{"method":"POST"}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.method).toBe('POST')
    expect(result.body).toBeNull()
  })

  it('baseUrl 包含逗号参数时截断', async () => {
    const result = await analyzeUrl('/relative/path', {
      baseUrl: 'https://example.com,{"method":"POST"}',
    })
    expect(result.url).toBe('https://example.com/relative/path')
  })

  it('webViewDelayTime 默认 0 且不取负值', async () => {
    const ruleUrl = 'https://example.com/api,{"webViewDelayTime":-100}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.webViewDelayTime).toBe(0)
  })

  it('webViewDelayTime 正常值', async () => {
    const ruleUrl = 'https://example.com/api,{"webViewDelayTime":1500}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.webViewDelayTime).toBe(1500)
  })

  it('serverID 解析', async () => {
    const ruleUrl = 'https://example.com/api,{"serverID":42}'
    const result = await analyzeUrl(ruleUrl, {
      baseUrl: 'https://example.com',
    })
    expect(result.serverID).toBe(42)
  })
})
