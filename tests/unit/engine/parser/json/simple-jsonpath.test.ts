// ============================================
// SimpleJSONPath 单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { SimpleJSONPath } from '../../../../../engine/parser/json/simple-jsonpath.js'

describe('SimpleJSONPath', () => {
  describe('基本路径', () => {
    it('$.xxx 取单个字段', () => {
      const data = { name: '三体', author: '刘慈欣' }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.name')).toEqual(['三体'])
      expect(engine.query('$.author')).toEqual(['刘慈欣'])
    })

    it('$.x.y.z 嵌套路径', () => {
      const data = { a: { b: { c: 'deep' } } }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.a.b.c')).toEqual(['deep'])
    })

    it('不存在的路径返回空数组', () => {
      const data = { name: 'test' }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.nonexistent')).toEqual([])
    })

    it('空路径返回空数组', () => {
      const engine = new SimpleJSONPath({ name: 'test' })
      expect(engine.query('')).toEqual([])
      expect(engine.query('   ')).toEqual([])
    })

    it('非 $ 开头的路径返回空数组', () => {
      const engine = new SimpleJSONPath({ name: 'test' })
      expect(engine.query('name')).toEqual([])
      expect(engine.query('a.b.c')).toEqual([])
    })

    it('$ 单独使用返回原数据', () => {
      const data = { name: 'test' }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$')).toEqual([data])
    })
  })

  describe('数组处理', () => {
    const listData = {
      data: {
        list: [
          { name: '三体', author: '刘慈欣' },
          { name: '流浪地球', author: '刘慈欣' },
          { name: '球状闪电', author: '刘慈欣' },
        ],
        total: 3,
      },
    }

    it('$.data.list 直接取数组（作为单个结果返回，不展开）', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(listData.data.list)
    })

    it('$.data.list[*] 展开数组', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list[*]')
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual(listData.data.list[0])
      expect(result[1]).toEqual(listData.data.list[1])
      expect(result[2]).toEqual(listData.data.list[2])
    })

    it('$.data.list[*].name 通配符后取属性', () => {
      const engine = new SimpleJSONPath(listData)
      expect(engine.query('$.data.list[*].name')).toEqual(['三体', '流浪地球', '球状闪电'])
    })

    it('$.data.list[0] 数组索引', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list[0]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(listData.data.list[0])
    })

    it('$.data.list[-1] 负数索引', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list[-1]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(listData.data.list[2])
    })

    it('$.data.list[10] 越界索引返回空数组', () => {
      const engine = new SimpleJSONPath(listData)
      expect(engine.query('$.data.list[10]')).toEqual([])
    })

    it('$.data.list[0,2] 多索引', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list[0,2]')
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveLength(2)
      expect(result[0]).toEqual([listData.data.list[0], listData.data.list[2]])
    })

    it('$.data.list[0:2] 切片', () => {
      const engine = new SimpleJSONPath(listData)
      const result = engine.query('$.data.list[0:2]')
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveLength(2)
      expect(result[0]).toEqual([listData.data.list[0], listData.data.list[1]])
    })
  })

  describe('递归下降', () => {
    const recursiveData = {
      a: { content: 'aaa', nested: { content: 'bbb' } },
      b: { c: { content: 'ccc' } },
      d: [{ content: 'ddd' }],
      e: { noContent: 'nothing' },
    }

    it('$..content 查找所有层级', () => {
      const engine = new SimpleJSONPath(recursiveData)
      const result = engine.query('$..content')
      expect(result).toHaveLength(4)
      expect(result).toContain('aaa')
      expect(result).toContain('bbb')
      expect(result).toContain('ccc')
      expect(result).toContain('ddd')
    })

    it('$..content.name 递归后继续嵌套', () => {
      const data = {
        a: { content: { name: 'first' } },
        b: { nested: { content: { name: 'second' } } },
      }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$..content.name')).toEqual(['first', 'second'])
    })

    it('$..nonexistent 返回空数组', () => {
      const engine = new SimpleJSONPath(recursiveData)
      expect(engine.query('$..nonexistent')).toEqual([])
    })
  })

  describe('null 和 undefined 处理', () => {
    it('null 值不包含在结果中', () => {
      const data = { a: null, b: 'value' }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.a')).toEqual([])
      expect(engine.query('$.b')).toEqual(['value'])
    })

    it('undefined 值不包含在结果中', () => {
      const data = { a: undefined, b: 'value' }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.a')).toEqual([])
      expect(engine.query('$.b')).toEqual(['value'])
    })

    it('0 和 false 正常返回', () => {
      const data = { zero: 0, falseValue: false }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.zero')).toEqual([0])
      expect(engine.query('$.falseValue')).toEqual([false])
    })

    it('空数组返回 [空数组]（与 jsonpath 行为一致：非通配符路径不展开数组）', () => {
      const data = { emptyArray: [] }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.emptyArray')).toEqual([[]])
    })

    it('空对象返回 [{}]（与 jsonpath 行为一致）', () => {
      const data = { emptyObject: {} }
      const engine = new SimpleJSONPath(data)
      expect(engine.query('$.emptyObject')).toEqual([{}])
    })
  })

  describe('根节点是数组', () => {
    const arrayData = [{ name: 'first' }, { name: 'second' }]

    it('$[0] 取第一个元素', () => {
      const engine = new SimpleJSONPath(arrayData)
      const result = engine.query('$[0]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(arrayData[0])
    })

    it('$[*] 展开所有元素', () => {
      const engine = new SimpleJSONPath(arrayData)
      const result = engine.query('$[*]')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(arrayData[0])
      expect(result[1]).toEqual(arrayData[1])
    })

    it('$[*].name 通配符后取属性', () => {
      const engine = new SimpleJSONPath(arrayData)
      expect(engine.query('$[*].name')).toEqual(['first', 'second'])
    })
  })

  describe('循环引用', () => {
    it('不会无限递归', () => {
      const data: Record<string, unknown> = { name: 'test' }
      data.self = data
      const engine = new SimpleJSONPath(data)
      const result = engine.query('$..name')
      expect(result).toEqual(['test'])
    })
  })

  describe('构造函数处理', () => {
    it('字符串 JSON 自动解析', () => {
      const engine = new SimpleJSONPath('{"name":"test"}')
      expect(engine.query('$.name')).toEqual(['test'])
    })

    it('非 JSON 字符串包装为 { result: content }', () => {
      const engine = new SimpleJSONPath('<html>content</html>')
      expect(engine.query('$.result')).toEqual(['<html>content</html>'])
    })

    it('null 和 undefined 包装为空对象', () => {
      const nullEngine = new SimpleJSONPath(null)
      expect(nullEngine.query('$.anything')).toEqual([])

      const undefinedEngine = new SimpleJSONPath(undefined)
      expect(undefinedEngine.query('$.anything')).toEqual([])
    })
  })
})
