// ============================================
// 解析器统一导出
// ============================================

export { AnalyzeRule } from './analyze-rule.js'
export { RuleAnalyzer } from './rule-analyzer.js'
export { SourceRule } from './source-rule.js'
export { AnalyzeByCSS, normalizeCssSelector, elementsSingle, getResultLast, getResultList, getElementsRecursive } from './dom/css.js'
export { AnalyzeByXPath } from './dom/xpath.js'
export { AnalyzeByJSONPath } from './json/jsonpath.js'
export { setJsRuntime, getJsRuntime, clearJsCache } from './js-executor.js'
export { toDomNode } from './dom/to-dom-node.js'

import { AnalyzeRule } from './analyze-rule.js'
import type { EngineBookSource, ParseContext } from '../types.js'

type WebJsExecutor = (html: string, jsCode: string, baseUrl: string) => Promise<string>

let globalWebJsExecutor: WebJsExecutor | null = null

export function setWebJsExecutor(executor: WebJsExecutor): void {
  globalWebJsExecutor = executor
}

function getAnalyzer(html: unknown, baseCtx?: ParseContext): AnalyzeRule {
  const source = baseCtx?.source
  const analyzer = new AnalyzeRule(source)
  analyzer.setContent(html, baseCtx?.baseUrl)
  const redirectUrl = baseCtx?.redirectUrl
  if (typeof redirectUrl === 'string') analyzer.setRedirectUrl(redirectUrl)
  if (globalWebJsExecutor) {
    analyzer.setWebJsExecutor(globalWebJsExecutor)
  }
  return analyzer
}

export async function getElements(html: unknown, rule: string, context?: ParseContext): Promise<unknown[]> {
  if (!rule) return []
  return getAnalyzer(html, context).getElements(rule, context)
}

export async function getString(content: unknown, rule: string, context?: ParseContext): Promise<string> {
  if (!rule) {
    if (typeof content === 'string') return content
    if (content && typeof content === 'object') {
      const obj = content as Record<string, unknown>
      if (typeof obj.textContent === 'string') return obj.textContent
      if (typeof obj.text === 'function') return String((obj.text as () => unknown)())
    }
    return String(content)
  }
  return getAnalyzer(content, context).getString(rule, context)
}

export async function getStringList(content: unknown, rule: string, context?: ParseContext): Promise<string[]> {
  if (!rule) return []
  return getAnalyzer(content, context).getStringList(rule, context)
}

export function createAnalyzer(source?: EngineBookSource | null): AnalyzeRule {
  const analyzer = new AnalyzeRule(source)
  if (globalWebJsExecutor) {
    analyzer.setWebJsExecutor(globalWebJsExecutor)
  }
  return analyzer
}
