// ============================================
// 发现页分类 — 纯函数（完整对齐 Legado）
// ============================================

import type { EngineBookSource } from '../../types.js'

export interface ExploreKind {
  title: string
  url?: string | null
  type: 'url' | 'text' | 'button' | 'toggle' | 'select'
  action?: string | null
  chars?: string[] | null
  default?: string | null
  viewName?: string | null
  style?: {
    layout_flexGrow?: number
    layout_flexShrink?: number
    layout_alignSelf?: string
    layout_flexBasisPercent?: number
    layout_wrapBefore?: boolean
    layout_justifySelf?: string
  } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 判断字符串是否是 Legado 的 {{...}} JS 模板。
 */
function isJsTemplate(str: string): boolean {
  const trimmed = str.trim()
  return trimmed.startsWith('{{') && trimmed.endsWith('}}')
}

function toExploreKind(item: unknown): ExploreKind | null {
  if (!isRecord(item)) return null
  const title = typeof item.title === 'string' ? item.title
    : typeof item.name === 'string' ? item.name
    : null
  if (!title) return null

  const rawUrl = typeof item.url === 'string' ? item.url
    : typeof item.value === 'string' ? item.value
    : null

  const action = typeof item.action === 'string' ? item.action : null

  let type: ExploreKind['type']
  const rawType = item.type
  if (rawType === 'text' || rawType === 'button' || rawType === 'toggle' || rawType === 'select' || rawType === 'url') {
    type = rawType
  } else if (rawUrl === null || rawUrl === '') {
    type = 'text'
  } else if (isJsTemplate(rawUrl)) {
    type = 'button'
  } else {
    type = 'url'
  }

  let finalAction = action
  let finalUrl: string | null = rawUrl
  if (type === 'button' && finalUrl && isJsTemplate(finalUrl) && !finalAction) {
    finalAction = finalUrl
    finalUrl = null
  }

  const chars = Array.isArray(item.chars) ? item.chars.map(String) : null
  const def = typeof item.default === 'string' ? item.default : null
  const viewName = typeof item.viewName === 'string' ? item.viewName : null
  const style = isRecord(item.style) ? (item.style as ExploreKind['style']) : null

  return {
    title,
    url: finalUrl,
    type,
    action: finalAction,
    chars,
    default: def,
    viewName,
    style,
  }
}

export function getExploreCategories(source: EngineBookSource): ExploreKind[] {
  const exploreUrl = source.exploreUrl
  if (!exploreUrl) return []

  const trimmed = exploreUrl.trim()

  // 1. 整个 exploreUrl 是 @js: / <js>
  if (trimmed.startsWith('@js:') || trimmed.startsWith('<js>')) {
    return []
  }

  // 2. 整个 exploreUrl 是 {{...}}
  if (isJsTemplate(trimmed)) {
    return []
  }

  // 3. JSON 数组格式
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const result: ExploreKind[] = []
        for (const item of parsed) {
          const kind = toExploreKind(item)
          if (kind) result.push(kind)
        }
        return result
      }
    } catch {
      // ignore
    }
  }

  // 4. 多行文本格式
  if (trimmed.includes('\n') && trimmed.includes('::')) {
    const lines = trimmed.split('\n').filter((line: string) => line.includes('::'))
    const result: ExploreKind[] = []
    for (const line of lines) {
      const kind = parseTextLine(line)
      if (kind) result.push(kind)
    }
    return result
  }

  // 5. 单行格式
  if (trimmed.includes('::')) {
    const kind = parseTextLine(trimmed)
    if (kind) return [kind]
  }

  return []
}

/**
 * 解析 `分类名::URL` 格式的行。
 * 完整对齐 Legado：
 * - **只按第一个 `::` 切分**（避免 action 中的 `::` 被误分割）
 * - url 为 {{...}} → button 类型
 * - url 为空 → text 类型
 */
function parseTextLine(line: string): ExploreKind | null {
  // 修复：用 indexOf 只切第一个 ::
  const idx = line.indexOf('::')
  if (idx === -1) return null

  const title = line.substring(0, idx).trim()
  const urlPart = line.substring(idx + 2).trim()

  if (!title) return null

  // url 为 {{...}} → button
  if (urlPart && isJsTemplate(urlPart)) {
    return { title, url: null, type: 'button', action: urlPart }
  }

  // url 为空 → text
  if (!urlPart) {
    return { title, url: null, type: 'text' }
  }

  // 普通 url
  return { title, url: urlPart, type: 'url' }
}
