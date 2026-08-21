// ============================================
// 发现页分类解析单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { getExploreCategories } from '../../../../../engine/business/explore/categories.js'
import type { EngineBookSource } from '../../../../../engine/types.js'

describe('getExploreCategories', () => {
  it('无 exploreUrl 返回空数组', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: '',
    }
    expect(getExploreCategories(source)).toEqual([])
  })

  it('JSON 数组格式', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: JSON.stringify([
        { title: '分类1', url: 'https://example.com/cat1' },
        { title: '分类2', url: 'https://example.com/cat2', type: 'text' },
      ]),
    }
    const categories = getExploreCategories(source)
    expect(categories.length).toBe(2)
    expect(categories[0]?.title).toBe('分类1')
    expect(categories[0]?.url).toBe('https://example.com/cat1')
    expect(categories[1]?.type).toBe('text')
  })

  it('JSON 格式错误返回空数组', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: 'not valid json',
    }
    expect(getExploreCategories(source)).toEqual([])
  })

  it('多行 :: 格式', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: '分类1::https://example.com/cat1\n分类2::https://example.com/cat2',
    }
    const categories = getExploreCategories(source)
    expect(categories.length).toBe(2)
    expect(categories[0]?.title).toBe('分类1')
    expect(categories[0]?.url).toBe('https://example.com/cat1')
    expect(categories[1]?.title).toBe('分类2')
  })

  it('单行 :: 格式', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: '分类1::https://example.com/cat1',
    }
    const categories = getExploreCategories(source)
    expect(categories.length).toBe(1)
    expect(categories[0]?.title).toBe('分类1')
    expect(categories[0]?.url).toBe('https://example.com/cat1')
  })

  it('@js: 前缀返回空数组（需异步处理）', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: '@js:return []',
    }
    expect(getExploreCategories(source)).toEqual([])
  })

  it('<js> 前缀返回空数组', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: '<js>return []</js>',
    }
    expect(getExploreCategories(source)).toEqual([])
  })

  it('无 :: 且非 JSON 返回空数组', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: 'just a plain string',
    }
    expect(getExploreCategories(source)).toEqual([])
  })

  it('JSON 数组中的 style 字段保留', () => {
    const source: EngineBookSource = {
      bookSourceName: '测试',
      bookSourceUrl: 'https://example.com',
      exploreUrl: JSON.stringify([
        {
          title: '筛选',
          type: 'select',
          chars: ['选项1', '选项2'],
          style: { layout_flexGrow: 1 },
        },
      ]),
    }
    const categories = getExploreCategories(source)
    expect(categories.length).toBe(1)
    expect(categories[0]?.type).toBe('select')
    expect(categories[0]?.chars).toEqual(['选项1', '选项2'])
    expect(categories[0]?.style).toEqual({ layout_flexGrow: 1 })
  })
})
