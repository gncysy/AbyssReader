// ============================================
// AnalyzeByJSONPath 组合规则单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { AnalyzeByJSONPath } from '../../../../../engine/parser/json/jsonpath.js'

const testData = {
  data: {
    list: [
      { name: '三体', author: '刘慈欣' },
      { name: '流浪地球', author: '刘慈欣' },
      { name: '球状闪电', author: '刘慈欣' },
    ],
    total: 3,
  },
  code: 200,
}

describe('AnalyzeByJSONPath.getString', () => {
  it('简单路径', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getString('$.code')).toBe('200')
  })

  it('嵌套路径', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getString('$.data.total')).toBe('3')
  })

  it('通配符 + 属性', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getString('$.data.list[*].name')).toBe('三体\n流浪地球\n球状闪电')
  })

  it('空规则返回 null', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getString('')).toBeNull()
  })

  it('不存在的路径返回 null', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getString('$.nonexistent')).toBeNull()
  })

  it('&& 组合', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    const result = analyzer.getString('$.data.list[*].name&&$.data.total')
    expect(result).toContain('三体')
    expect(result).toContain('3')
  })

  it('|| 组合（短路）', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    const result = analyzer.getString('$.data.list[*].name||$.nonexistent')
    expect(result).toBe('三体\n流浪地球\n球状闪电')
  })
})

describe('AnalyzeByJSONPath.getStringList', () => {
  it('简单路径', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getStringList('$.data.list[*].name')).toEqual(['三体', '流浪地球', '球状闪电'])
  })

  it('空规则返回空数组', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getStringList('')).toEqual([])
  })

  it('%% 合并', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    const result = analyzer.getStringList('$.data.list[*].name%%$.data.list[*].author')
    expect(result).toEqual(['三体', '刘慈欣', '流浪地球', '刘慈欣', '球状闪电', '刘慈欣'])
  })
})

describe('AnalyzeByJSONPath.getObject', () => {
  it('返回第一个结果', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getObject('$.data.list[*].name')).toBe('三体')
  })

  it('不存在的路径返回 null', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getObject('$.nonexistent')).toBeNull()
  })
})

describe('AnalyzeByJSONPath.getList', () => {
  it('数组路径', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    const result = analyzer.getList('$.data.list[*]')
    expect(result).toHaveLength(3)
  })

  it('空规则返回空数组', () => {
    const analyzer = new AnalyzeByJSONPath(testData)
    expect(analyzer.getList('')).toEqual([])
  })
})

describe('AnalyzeByJSONPath 构造函数', () => {
  it('JSON 字符串自动解析', () => {
    const analyzer = new AnalyzeByJSONPath('{"name":"test"}')
    expect(analyzer.getString('$.name')).toBe('test')
  })

  it('非 JSON 字符串包装为 { result: content }', () => {
    const analyzer = new AnalyzeByJSONPath('<html>content</html>')
    expect(analyzer.getString('$.result')).toBe('<html>content</html>')
  })

  it('null 和 undefined 包装为空对象', () => {
    const nullAnalyzer = new AnalyzeByJSONPath(null)
    expect(nullAnalyzer.getString('$.anything')).toBeNull()

    const undefinedAnalyzer = new AnalyzeByJSONPath(undefined)
    expect(undefinedAnalyzer.getString('$.anything')).toBeNull()
  })
})
