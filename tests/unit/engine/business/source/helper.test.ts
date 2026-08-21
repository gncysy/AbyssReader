// ============================================
// 书源辅助纯函数单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { parseHeader, parseSourcesFromJson } from '../../../../../engine/business/source/helper.js'

describe('parseHeader', () => {
  it('解析 JSON 字符串', () => {
    expect(parseHeader('{"User-Agent":"test","Cookie":"abc"}')).toEqual({
      'User-Agent': 'test',
      'Cookie': 'abc',
    })
  })

  it('null 返回 null', () => {
    expect(parseHeader(null)).toBeNull()
  })

  it('undefined 返回 null', () => {
    expect(parseHeader(undefined)).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(parseHeader('')).toBeNull()
  })

  it('无效 JSON 返回 null', () => {
    expect(parseHeader('not json')).toBeNull()
  })
})

describe('parseSourcesFromJson', () => {
  it('解析单个书源对象', () => {
    const source = { bookSourceUrl: 'https://example.com', bookSourceName: '测试' }
    expect(parseSourcesFromJson(source)).toEqual([source])
  })

  it('解析书源数组', () => {
    const sources = [
      { bookSourceUrl: 'https://a.com', bookSourceName: 'A' },
      { bookSourceUrl: 'https://b.com', bookSourceName: 'B' },
    ]
    expect(parseSourcesFromJson(sources)).toEqual(sources)
  })

  it('解析 JSON 字符串数组', () => {
    const jsonStr = JSON.stringify([
      { bookSourceUrl: 'https://a.com', bookSourceName: 'A' },
    ])
    expect(parseSourcesFromJson(jsonStr)).toHaveLength(1)
  })

  it('解析包装对象 sources 字段', () => {
    const wrapper = {
      sources: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('解析包装对象 bookSources 字段', () => {
    const wrapper = {
      bookSources: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('解析包装对象 list 字段', () => {
    const wrapper = {
      list: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('解析 data.sources 嵌套结构', () => {
    const wrapper = {
      data: {
        sources: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
      },
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('解析 data.list 嵌套结构', () => {
    const wrapper = {
      data: {
        list: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
      },
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('解析 data 直接为数组', () => {
    const wrapper = {
      data: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('遍历对象值查找数组', () => {
    const wrapper = {
      result: [{ bookSourceUrl: 'https://a.com', bookSourceName: 'A' }],
    }
    expect(parseSourcesFromJson(wrapper)).toHaveLength(1)
  })

  it('空输入返回空数组', () => {
    expect(parseSourcesFromJson('')).toEqual([])
    expect(parseSourcesFromJson(null)).toEqual([])
    expect(parseSourcesFromJson('[object Object]')).toEqual([])
  })

  it('无效 JSON 字符串返回空数组', () => {
    expect(parseSourcesFromJson('not json')).toEqual([])
  })

  it('无书源字段的对象返回空数组', () => {
    expect(parseSourcesFromJson({ foo: 'bar' })).toEqual([])
  })
})
