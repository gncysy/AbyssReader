// ============================================
// CSS 选择器工具函数单元测试
// ============================================

import { describe, it, expect, beforeAll } from 'vitest'
import { normalizeCssSelector } from '../../../../../engine/parser/dom/css.js'

// 注意：elementsSingle / getResultList / getElementsRecursive 依赖 DomProvider，
// 这里只测试不依赖 DOM 的纯函数 normalizeCssSelector

describe('normalizeCssSelector', () => {
  it('@tag.xxx 替换为标签名', () => {
    expect(normalizeCssSelector('@tag.div')).toBe('div')
    expect(normalizeCssSelector('@tag.a@text')).toBe('a@text')
  })

  it('@class.xxx 替换为类选择器', () => {
    expect(normalizeCssSelector('@class.title')).toBe('.title')
  })

  it('@id.xxx 替换为 ID 选择器', () => {
    expect(normalizeCssSelector('@id.main')).toBe('#main')
  })

  it('class.xxx 替换为类选择器', () => {
    expect(normalizeCssSelector('class.title@text')).toBe('.title@text')
  })

  it('tag.xxx 替换为标签名', () => {
    expect(normalizeCssSelector('tag.div@text')).toBe('div@text')
  })

  it('id.xxx 替换为 ID 选择器', () => {
    expect(normalizeCssSelector('id.main@text')).toBe('#main@text')
  })

  it('移除开头的 @', () => {
    expect(normalizeCssSelector('@div@text')).toBe('div@text')
  })

  it('压缩多余空格', () => {
    expect(normalizeCssSelector('div   span')).toBe('div span')
  })

  it('不移除 @text 等结果属性', () => {
    expect(normalizeCssSelector('div@text')).toBe('div@text')
    expect(normalizeCssSelector('div@html')).toBe('div@html')
    expect(normalizeCssSelector('div@src')).toBe('div@src')
  })

  it('空字符串返回空字符串', () => {
    expect(normalizeCssSelector('')).toBe('')
  })

  it('普通 CSS 选择器不变', () => {
    expect(normalizeCssSelector('div .title > a')).toBe('div .title > a')
  })
})
