// ============================================
// CSS 选择器工具函数单元测试
// ============================================

import { describe, it, expect, beforeAll as _beforeAll } from 'vitest'
import { normalizeCssSelector, applyPseudoOp } from '../../../../../engine/parser/dom/css.js'
import type { DomNode } from '../../../../../engine/parser/dom/provider.js'

// 构造最小 DomNode 树，用于验证 :eq / :lt / :gt 的兄弟索引语义
function makeNode(tag: string, children: DomNode[] = [], attrs: Record<string, string> = {}): DomNode {
  const node = {
    tag,
    attrs,
    children,
    parentNode: null,
    textContent: '',
    innerHTML: '',
    outerHTML: '',
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    nextSibling: null,
    previousSibling: null,
    remove: () => {},
    ownText: () => '',
    textNodes: () => [],
    evaluateXPath: () => [],
  } as unknown as DomNode
  for (const child of children) {
    ;(child as { parentNode: DomNode | null }).parentNode = node
  }
  return node
}

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

describe('applyPseudoOp（对齐 JSoup 兄弟索引语义）', () => {
  // <div class="prenext"><span>上一章</span><a>目录</a><span>下一页</span></div>
  const prenext = makeNode('div', [
    makeNode('span', [makeNode('a', [], { href: '/prev' })]),
    makeNode('a', [], { href: '/dir' }),
    makeNode('span', [makeNode('a', [], { href: '/next' })]),
  ])
  const spans = prenext.children.filter((c) => c.tag === 'span')

  function hrefs(nodes: DomNode[]): string[] {
    return nodes.map((n) => n.children[0]?.getAttribute('href') || '')
  }

  it(':eq(n) 按同级兄弟索引匹配，而不是匹配结果下标', () => {
    // 第二个 span 的兄弟索引是 2（中间夹着 <a>），旧实现按列表下标会取不到
    expect(hrefs(applyPseudoOp(spans, 'eq', 2))).toEqual(['/next'])
    expect(hrefs(applyPseudoOp(spans, 'eq', 0))).toEqual(['/prev'])
    // 兄弟索引 1 上是 <a>，不是 span，因此为空
    expect(applyPseudoOp(spans, 'eq', 1)).toEqual([])
  })

  it(':lt(n) 匹配兄弟索引小于 n 的元素', () => {
    expect(hrefs(applyPseudoOp(spans, 'lt', 2))).toEqual(['/prev'])
  })

  it(':gt(n) 匹配兄弟索引大于 n 的元素', () => {
    expect(hrefs(applyPseudoOp(spans, 'gt', 1))).toEqual(['/next'])
  })

  it('负索引从末尾数', () => {
    expect(hrefs(applyPseudoOp(spans, 'eq', -1))).toEqual(['/next'])
  })

  it('没有父节点的元素不匹配', () => {
    const orphan = makeNode('span', [])
    expect(applyPseudoOp([orphan], 'eq', 0)).toEqual([])
  })
})
