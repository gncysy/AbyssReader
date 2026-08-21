// ============================================
// 漫画图片处理纯函数单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { extractImageUrls, createComicImages } from '../../../../../engine/business/comic/index.js'

describe('extractImageUrls', () => {
  it('提取所有 img 标签的 src', () => {
    const html = '<img src="https://example.com/1.jpg"><img src="https://example.com/2.jpg">'
    expect(extractImageUrls(html)).toEqual([
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
    ])
  })

  it('只提取包含 // 的 URL', () => {
    const html = '<img src="https://example.com/1.jpg"><img src="/relative.jpg">'
    expect(extractImageUrls(html)).toEqual(['https://example.com/1.jpg'])
  })

  it('去重', () => {
    const html = '<img src="https://example.com/1.jpg"><img src="https://example.com/1.jpg">'
    expect(extractImageUrls(html)).toEqual(['https://example.com/1.jpg'])
  })

  it('无 img 标签返回空数组', () => {
    expect(extractImageUrls('<p>no images</p>')).toEqual([])
  })

  it('剥离 URL 中的 ,{...} 选项（JSON 中的引号导致正则截断）', () => {
    const html = '<img src="https://example.com/1.jpg,{"headers":{"Referer":"https://example.com/"}}">'
    // 正则 [^"'] 遇到 JSON 中第一个 " 就停止，提取到干净 URL
    expect(extractImageUrls(html)).toEqual(['https://example.com/1.jpg'])
  })

  it('处理 data-src 属性（当前实现不提取）', () => {
    const html = '<img data-src="https://example.com/1.jpg">'
    expect(extractImageUrls(html)).toEqual([])
  })
})

describe('createComicImages', () => {
  it('创建 ComicImage 数组', () => {
    const urls = ['https://example.com/1.jpg', 'https://example.com/2.jpg']
    const images = createComicImages(urls)
    expect(images).toHaveLength(2)
    expect(images[0]).toEqual({
      url: 'https://example.com/1.jpg',
      data: '',
      directUrl: '',
      status: 'loading',
      retries: 3,
    })
    expect(images[1]?.url).toBe('https://example.com/2.jpg')
  })

  it('空数组返回空数组', () => {
    expect(createComicImages([])).toEqual([])
  })
})
