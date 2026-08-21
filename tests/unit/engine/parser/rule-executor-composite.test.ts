import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AnalyzeRule } from '../../../../engine/parser/analyze-rule.js'
import { setJsRuntime } from '../../../../engine/parser/js-executor.js'
import { setDomProvider } from '../../../../engine/parser/dom/provider.js'
import type { JsRuntime } from '../../../../engine/types.js'
import type { DomProvider, DomDocument, DomNode } from '../../../../engine/parser/dom/provider.js'

// 简单 DOM mock
function textNode(text: string): DomNode {
  return {
    tag: '#text', attrs: {}, children: [],
    textContent: text, innerHTML: '', outerHTML: text,
    getAttribute: () => null, setAttribute: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: () => [], getElementsByClassName: () => [],
    parentNode: null, nextSibling: null, previousSibling: null,
    remove: () => {}, ownText: () => text, textNodes: () => [text],
    evaluateXPath: () => [],
  }
}

function elem(tag: string, attrs: Record<string, string>, children: DomNode[] = []): DomNode {
  const textContent = children.map((c) => c.textContent || '').join('')
  const innerHTML = children.map((c) => c.outerHTML).join('')
  const outerHTML = `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}>${innerHTML}</${tag}>`
  return {
    tag, attrs, children,
    textContent, innerHTML, outerHTML,
    getAttribute: (name: string) => attrs[name] || null,
    setAttribute: (name: string, value: string) => { attrs[name] = value },
    querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: (name: string) => children.filter((c) => c.tag === name),
    getElementsByClassName: (name: string) => children.filter((c) => (c.attrs.class || '').split(' ').includes(name)),
    parentNode: null, nextSibling: null, previousSibling: null,
    remove: () => {}, ownText: () => '',
    textNodes: () => [],
    evaluateXPath: () => [],
  }
}

function buildDoc(): DomDocument {
  const imgNode = elem('img', { src: 'https://img.example.com/cover.jpg' })
  const bgDiv = elem('div', { class: 'bg' }, [imgNode])
  const coverBoxDiv = elem('div', { class: 'cover-box' }, [bgDiv])
  const bodyNode = elem('body', {}, [coverBoxDiv])

  // 简易 querySelectorAll 支持 .class 和 img
  function findNodes(selector: string): DomNode[] {
    const result: DomNode[] = []
    const walk = (nodes: DomNode[]) => {
      for (const n of nodes) {
        if (n.tag === 'img' && (selector.includes('img') || selector === 'img')) result.push(n)
        if ((n.attrs.class || '').includes(selector.replace(/^\./, '').split(' ')[0] || '')) result.push(n)
        if (n.children.length > 0) walk(n.children)
      }
    }
    walk([bodyNode])
    return result
  }

  return {
    querySelector: (sel: string) => findNodes(sel)[0] || null,
    querySelectorAll: (sel: string) => findNodes(sel),
    getElementById: () => null,
    getElementsByTagName: (name: string) => {
      const result: DomNode[] = []
      const walk = (nodes: DomNode[]) => {
        for (const n of nodes) {
          if (n.tag === name) result.push(n)
          if (n.children.length > 0) walk(n.children)
        }
      }
      walk([bodyNode])
      return result
    },
    getElementsByClassName: (name: string) => {
      const result: DomNode[] = []
      const walk = (nodes: DomNode[]) => {
        for (const n of nodes) {
          if ((n.attrs.class || '').split(' ').includes(name)) result.push(n)
          if (n.children.length > 0) walk(n.children)
        }
      }
      walk([bodyNode])
      return result
    },
    body: bodyNode, head: null, documentElement: bodyNode,
    createElement: (tag: string) => elem(tag, {}),
    createTextNode: (text: string) => textNode(text),
    textContent: bodyNode.textContent || '',
    innerHTML: bodyNode.innerHTML, outerHTML: bodyNode.outerHTML,
    evaluateXPath: () => [],
  }
}

const mockDomProvider: DomProvider = {
  parseHTML: () => buildDoc(),
  createDocument: () => buildDoc(),
  parseXML: () => buildDoc(),
}

const mockJsRuntime: JsRuntime = {
  execute: async (code: string, context: Record<string, unknown>) => {
    const result = context.result
    if (typeof result === 'string' && code.includes('result')) {
      return result + ',{"headers":{"Referer":"https://test/"}}'
    }
    return code
  },
}

describe('AnalyzeRule 对 @css:...@js:... 的链式执行', () => {
  beforeAll(() => {
    setDomProvider(mockDomProvider)
    setJsRuntime(mockJsRuntime)
  })

  afterAll(() => {
    setJsRuntime(null as unknown as JsRuntime)
  })

  it('getString 应返回 JS 结果（带 Referer），不是两行', async () => {
    const analyzer = new AnalyzeRule()
    analyzer.setContent('<div class="cover-box"><div class="bg"><img src="https://img.example.com/cover.jpg"></div></div>', 'https://example.com')

    const rule = '@css:.cover-box .bg img@src@js:result + ",{"headers":{"Referer":"https://test/"}}"'
    const result = await analyzer.getString(rule)

    console.log('结果行数:', result.split('\n').length)
    console.log('结果:', result.substring(0, 200))

    // 应该只有一行（JS 结果）
    expect(result.split('\n').length).toBe(1)
    expect(result).toContain('img.example.com/cover.jpg')
    expect(result).toContain('{"headers"')
  })
})
