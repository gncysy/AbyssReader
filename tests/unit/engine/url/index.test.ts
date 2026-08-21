// ============================================
// URL 解析单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { resolveUrl, getBaseUrl, getSubDomain, buildUrl } from '../../../../engine/url/index.js'

describe('resolveUrl', () => {
  it('相对路径拼接到 baseUrl', () => {
    expect(resolveUrl('/chapter/123', 'https://example.com')).toBe('https://example.com/chapter/123')
  })

  it('绝对 URL 直接返回', () => {
    expect(resolveUrl('https://other.com/page', 'https://example.com')).toBe('https://other.com/page')
  })

  it('协议相对 URL 保持原样', () => {
    expect(resolveUrl('//cdn.example.com/img.jpg', 'https://example.com')).toBe('//cdn.example.com/img.jpg')
  })

  it('data URL 保持原样', () => {
    expect(resolveUrl('data:image/png;base64,abc', 'https://example.com')).toBe('data:image/png;base64,abc')
  })

  it('javascript URL 返回空字符串', () => {
    expect(resolveUrl('javascript:alert(1)', 'https://example.com')).toBe('')
  })

  it('无 baseUrl 时返回去除首尾空格的 url', () => {
    expect(resolveUrl('  /path  ', '')).toBe('/path')
  })

  it('baseUrl 包含逗号时截断', () => {
    expect(resolveUrl('/chapter/1', 'https://example.com,{"method":"GET"}')).toBe('https://example.com/chapter/1')
  })

  it('无效 URL 返回原值', () => {
    expect(resolveUrl('not a url', 'not a base')).toBe('not a url')
  })
})

describe('getBaseUrl', () => {
  it('提取协议+域名', () => {
    expect(getBaseUrl('https://example.com/path/to/page')).toBe('https://example.com')
  })

  it('无路径时返回原 URL', () => {
    expect(getBaseUrl('https://example.com')).toBe('https://example.com')
  })

  it('非 HTTP URL 返回 null', () => {
    expect(getBaseUrl('ftp://example.com/file')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(getBaseUrl('')).toBeNull()
  })
})

describe('getSubDomain', () => {
  it('提取主域名', () => {
    expect(getSubDomain('https://www.example.com/path')).toBe('example.com')
  })

  it('IP 地址返回自身', () => {
    expect(getSubDomain('https://192.168.1.1/path')).toBe('192.168.1.1')
  })

  it('三级域名返回后两级', () => {
    expect(getSubDomain('https://a.b.example.com/path')).toBe('example.com')
  })

  it('www 前缀被移除', () => {
    expect(getSubDomain('https://www.example.co.uk/path')).toBe('co.uk')
  })
})

describe('buildUrl', () => {
  it('替换 {{key}} 占位符并编码', () => {
    expect(buildUrl('https://example.com/search?q={{key}}', 'https://example.com', { key: '三体' }))
      .toBe('https://example.com/search?q=%E4%B8%89%E4%BD%93')
  })

  it('无变量时返回原 URL', () => {
    expect(buildUrl('https://example.com/page', 'https://example.com')).toBe('https://example.com/page')
  })

  it('空 URL 返回空字符串', () => {
    expect(buildUrl('', 'https://example.com')).toBe('')
  })
})
