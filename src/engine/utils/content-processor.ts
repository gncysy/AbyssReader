import type { ReplaceRule } from '../../shared/types.js'

export function applyReplaceRules(
  content: string,
  rules: ReplaceRule[],
  scope: 'title' | 'content'
): { result: string; effectiveRules: ReplaceRule[] } {
  if (!content || content === 'null') return { result: content, effectiveRules: [] }

  const effectiveRules: ReplaceRule[] = []
  let result = content

  for (const rule of rules) {
    if (!rule.isEnabled || rule.scope !== scope || !rule.pattern) continue
    try {
      const before = result
      if (rule.isRegex) {
        const regex = new RegExp(rule.pattern, 'g')
        result = result.replace(regex, rule.replacement)
      } else {
        result = result.split(rule.pattern).join(rule.replacement)
      }
      if (result !== before) {
        effectiveRules.push(rule)
      }
    } catch {
      // 规则异常跳过
    }
  }

  return { result, effectiveRules }
}

export function removeDuplicateTitle(content: string, title: string, bookName: string): string {
  if (!title) return content
  // 匹配开头的标题（可能带空格和标点前缀）
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp('^(\\s|\\p{P}|' + bookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')*' + escapedTitle + '(\\s)*', 'u')
  const match = content.match(pattern)
  if (match) {
    return content.substring(match[0].length)
  }
  return content
}
