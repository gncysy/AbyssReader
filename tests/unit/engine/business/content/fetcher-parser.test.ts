// ============================================
// 正文解析纯函数单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { stripHtml, injectImageStyle, formatKeepImg } from '../../../../../engine/business/content/fetcher-parser.js'

describe('stripHtml', () => {
  it('去除所有 HTML 标签', () => {
    expect(stripHtml('<p>正文</p><div>内容</div>')).toBe('正文\n内容')
  })

  it('br 转换为换行', () => {
    expect(stripHtml('第一行<br>第二行<br/>第三行')).toBe('第一行\n第二行\n第三行')
  })

  it('p 闭合标签转换为换行', () => {
    expect(stripHtml('<p>第一段</p><p>第二段</p>')).toBe('第一段\n第二段')
  })

  it('解码 HTML 实体（&nbsp; 转换后的尾部空格被 trim 去除）', () => {
    expect(stripHtml('&amp;&lt;&gt;&quot;&nbsp;')).toBe('&<>"')
  })

  it('去除 script 和 style 标签内容', () => {
    const html = '<p>正文</p><script>alert(1)</script><style>.a{color:red}</style>'
    expect(stripHtml(html)).toBe('正文')
  })

  it('空字符串返回空字符串', () => {
    expect(stripHtml('')).toBe('')
  })

  it('纯文本保持不变', () => {
    expect(stripHtml('纯文本内容')).toBe('纯文本内容')
  })

  it('压缩多余空行', () => {
    expect(stripHtml('<p>一</p><p></p><p>二</p>')).toBe('一\n二')
  })

  it('每行去除首尾空格', () => {
    expect(stripHtml('<p>  有空格  </p>')).toBe('有空格')
  })
})

describe('injectImageStyle', () => {
  it('无样式时原样返回', () => {
    const html = '<img src="https://example.com/1.jpg">'
    expect(injectImageStyle(html, null)).toBe(html)
  })

  it('FULL 样式注入 width:100%', () => {
    const html = '<img src="test.jpg">'
    const result = injectImageStyle(html, 'FULL')
    expect(result).toContain('style="width:100%;height:auto;"')
  })

  it('TEXT 样式注入 display:none', () => {
    const html = '<img src="test.jpg">'
    const result = injectImageStyle(html, 'TEXT')
    expect(result).toContain('style="display:none;"')
  })

  it('自定义样式直接注入', () => {
    const html = '<img src="test.jpg">'
    const result = injectImageStyle(html, 'border-radius:8px')
    expect(result).toContain('style="border-radius:8px"')
  })

  it('JSON 格式样式解析', () => {
    const html = '<img src="test.jpg">'
    const result = injectImageStyle(html, '{"style":"max-width:100%"}')
    expect(result).toContain('style="max-width:100%"')
  })
})

describe('formatKeepImg', () => {
  const baseUrl = 'https://example.com'

  it('保留 img 标签，去除其他标签', () => {
    const html = '<div><p>正文</p><img src="https://example.com/1.jpg"></div>'
    const result = formatKeepImg(html, baseUrl, null)
    expect(result).toContain('<img src="https://example.com/1.jpg">')
    expect(result).not.toContain('<div>')
    expect(result).not.toContain('<p>')
  })

  it('相对图片 URL 解析为绝对 URL', () => {
    const html = '<img src="/images/1.jpg">'
    const result = formatKeepImg(html, baseUrl, null)
    expect(result).toContain('<img src="https://example.com/images/1.jpg">')
  })

  it('data-src 属性转换为 src', () => {
    const html = '<img data-src="https://example.com/1.jpg">'
    const result = formatKeepImg(html, baseUrl, null)
    expect(result).toContain('<img src="https://example.com/1.jpg">')
  })

  it('空 HTML 返回空字符串', () => {
    expect(formatKeepImg('', baseUrl, null)).toBe('')
  })

  it('无图片时保留纯文本', () => {
    const html = '<div>纯文本内容</div>'
    const result = formatKeepImg(html, baseUrl, null)
    expect(result).toContain('纯文本内容')
    expect(result).not.toContain('<div>')
  })

  it('应用图片样式', () => {
    const html = '<img src="https://example.com/1.jpg">'
    const result = formatKeepImg(html, baseUrl, 'FULL')
    expect(result).toContain('style="FULL"')
  })
})
