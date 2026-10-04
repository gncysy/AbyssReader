// ============================================
// 书源登录服务
// ============================================
//
// 对齐 Legado SourceLoginDialog 的语义：
// - loginUi 为 JSON 或 @js: / <js> 表达式
// - loginUrl 是一整段 JS 函数定义
// - 点按钮时执行 `loginUrl + "\n" + action`
// - 表单数据通过 result 传给 JS
// - loginInfo 持久化到书源对象（本项目的 bookSource 数组元素）
// - viewName 是 'xxx' 当字符串；否则当 JS 表达式求值

import { invoke } from '@tauri-apps/api/core'
import { logError } from '@engine/log/index.js'
import { LOGIN } from '@/constants/login.js'
import { store } from './store.js'
import type { SourceLoginRowUi, ParsedLoginUi, LoginJsResult } from '@/types/source-login.js'
import type { BookSource } from '@/types'

const KNOWN_UI_TYPES: SourceLoginRowUi['type'][] = ['text', 'password', 'button', 'toggle', 'select']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeType(raw: unknown): SourceLoginRowUi['type'] {
  if (typeof raw === 'string' && (KNOWN_UI_TYPES as string[]).includes(raw)) {
    return raw as SourceLoginRowUi['type']
  }
  return 'text'
}

/**
 * 把任意 loginUi JSON 数组项归一化为 SourceLoginRowUi。
 */
function normalizeRow(item: unknown): SourceLoginRowUi | null {
  if (!isRecord(item)) return null
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null

  const type = normalizeType(item.type)
  const chars = Array.isArray(item.chars) ? item.chars.map(String) : null
  const viewName = typeof item.viewName === 'string' ? item.viewName : null
  const action = typeof item.action === 'string' ? item.action : null
  const def = typeof item.default === 'string' ? item.default : null
  const style = isRecord(item.style) ? (item.style as SourceLoginRowUi['style']) : null

  return {
    name,
    type,
    viewName,
    action,
    chars,
    default: def,
    style,
  }
}

/**
 * 判断字符串是否是 Legado 的 @js: / <js> 表达式。
 */
function isJsExpression(str: string): boolean {
  const trimmed = str.trim()
  return trimmed.startsWith('@js:') || trimmed.startsWith('<js>')
}

/**
 * 剥离 @js: / <js> 外壳。
 */
function stripJsWrapper(str: string): string {
  const trimmed = str.trim()
  if (trimmed.startsWith('@js:')) return trimmed.substring(4).trim()
  if (trimmed.startsWith('<js>')) {
    const inner = trimmed.substring(4)
    const end = inner.lastIndexOf('</js>')
    return end >= 0 ? inner.substring(0, end).trim() : inner.trim()
  }
  return trimmed
}

/**
 * 从字符串里剥离 <js> 标签。
 */
function stripJsTags(str: string): string {
  return str.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
}

/**
 * 解析 loginUi，得到控件列表 + 初始表单数据。
 *
 * @param source 书源对象
 */
export async function parseLoginUi(source: BookSource): Promise<ParsedLoginUi | null> {
  const raw = source.loginUi
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null

  const trimmed = raw.trim()
  let jsonStr = ''

  if (isJsExpression(trimmed)) {
    const jsCode = stripJsWrapper(trimmed)
    const loginUrl = typeof source.loginUrl === 'string' ? source.loginUrl : ''
    const loginJs = stripJsTags(loginUrl)
    const fullCode = loginJs ? loginJs + '\n' + jsCode : jsCode

    const loginContext = buildLoginJsContext(source, {}, null, null, false)
    const result = await invokeLoginJs(fullCode, loginContext)
    if (!result.success || !result.result) {
      logError('source', 'frontend', `[登录] loginUi JS 执行失败: ${result.error || '空结果'}`)
      return null
    }
    jsonStr = result.result.trim()
  } else {
    jsonStr = trimmed
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('source', 'frontend', `[登录] loginUi JSON 解析失败: ${msg}`)
    return null
  }

  if (!Array.isArray(parsed)) {
    logError('source', 'frontend', '[登录] loginUi 不是 JSON 数组')
    return null
  }

  const rows: SourceLoginRowUi[] = []
  for (const item of parsed) {
    const row = normalizeRow(item)
    if (row) rows.push(row)
  }

  const formData: Record<string, string> = {}
  for (const row of rows) {
    if (row.type === 'text' || row.type === 'password') {
      formData[row.name] = row.default || ''
    } else if (row.type === 'toggle') {
      const chars = row.chars && row.chars.length > 0 ? row.chars : ['']
      formData[row.name] = row.default || chars[0] || ''
    } else if (row.type === 'select') {
      const chars = row.chars && row.chars.length > 0 ? row.chars : ['']
      formData[row.name] = row.default || chars[0] || ''
    }
  }

  const savedInfo = await getSavedLoginInfo(source)
  for (const key of Object.keys(savedInfo)) {
    formData[key] = savedInfo[key] || ''
  }

  return { rows, formData }
}

/**
 * 判断 viewName 是否是单引号字符串常量。
 */
function isViewNameConstant(viewName: string): boolean {
  const trimmed = viewName.trim()
  return trimmed.length >= 3 && trimmed.startsWith("'") && trimmed.endsWith("'")
}

/**
 * 取出单引号常量内的内容。
 */
function unwrapViewNameConstant(viewName: string): string {
  return viewName.trim().slice(1, -1)
}

/**
 * 求值 row 的 viewName。
 * - null → 返回 name
 * - 'xxx' → 返回 xxx
 * - 其他 → 当 JS 表达式求值；失败返回 "err"；空返回 "null"
 */
export async function resolveViewName(
  source: BookSource,
  row: SourceLoginRowUi,
  formData: Record<string, string>,
): Promise<string> {
  const viewName = row.viewName
  if (!viewName) return row.name

  if (isViewNameConstant(viewName)) {
    return unwrapViewNameConstant(viewName)
  }

  const loginUrl = typeof source.loginUrl === 'string' ? source.loginUrl : ''
  const loginJs = stripJsTags(loginUrl)
  const viewNameCode = stripJsTags(viewName)
  const fullCode = loginJs ? loginJs + '\n' + viewNameCode : viewNameCode

  const context = buildLoginJsContext(source, formData, null, null, false)
  const result = await invokeLoginJs(fullCode, context, LOGIN.CHECK_TIMEOUT_MS)
  if (!result.success) return 'err'
  const value = result.result.trim()
  if (!value) return 'null'
  return value
}

/**
 * 批量求值所有 row 的 viewName，缓存在 `resolvedViewName` 上。
 */
export async function resolveAllViewNames(
  source: BookSource,
  rows: SourceLoginRowUi[],
  formData: Record<string, string>,
): Promise<void> {
  for (const row of rows) {
    const resolved = await resolveViewName(source, row, formData)
    ;(row as SourceLoginRowUi & { resolvedViewName?: string }).resolvedViewName = resolved
  }
}

function buildLoginJsContext(
  source: BookSource,
  formData: Record<string, string>,
  book: Record<string, unknown> | null,
  chapter: Record<string, unknown> | null,
  isLongClick: boolean,
): Record<string, unknown> {
  return {
    source,
    result: formData,
    book: book || {},
    chapter: chapter || {},
    isLongClick,
    baseUrl: source.bookSourceUrl || '',
  }
}

/**
 * 执行登录 JS（loginUrl + action 拼接）。
 */
export async function invokeLoginJs(
  code: string,
  context: Record<string, unknown>,
  timeoutMs: number = LOGIN.DEFAULT_TIMEOUT_MS,
): Promise<LoginJsResult> {
  try {
    const response: unknown = await invoke('execute_login_js', {
      code,
      context,
      timeoutMs,
    })
    if (isRecord(response) && typeof response.success === 'boolean') {
      const result: LoginJsResult = {
        success: response.success,
        result: typeof response.result === 'string' ? response.result : '',
      }
      if (typeof response.error === 'string') {
        result.error = response.error
      }
      return result
    }
    return { success: false, result: '', error: '无效响应' }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, result: '', error: msg }
  }
}

/**
 * 执行 loginUrl + action。对齐 Legado：
 * `source.evalJS(loginJS + "\n" + action)`
 */
export async function executeLoginAction(
  source: BookSource,
  action: string,
  formData: Record<string, string>,
  book: Record<string, unknown> | null,
  chapter: Record<string, unknown> | null,
  isLongClick = false,
): Promise<LoginJsResult> {
  const loginUrl = typeof source.loginUrl === 'string' ? source.loginUrl : ''
  const loginJs = stripJsTags(loginUrl)
  if (!loginJs) {
    return { success: false, result: '', error: '书源未配置 loginUrl' }
  }

  if (/^https?:\/\//i.test(action.trim())) {
    return { success: true, result: action.trim() }
  }

  const fullCode = loginJs + '\n' + action
  const context = buildLoginJsContext(source, formData, book, chapter, isLongClick)

  return invokeLoginJs(fullCode, context)
}

/**
 * 执行 loginCheckJs，检查登录状态。
 */
export async function checkLoginStatus(source: BookSource): Promise<boolean> {
  const checkJs = typeof source.loginCheckJs === 'string' ? source.loginCheckJs : ''
  if (!checkJs.trim()) {
    const info = await getSavedLoginInfo(source)
    return Object.keys(info).length > 0
  }

  const loginUrl = typeof source.loginUrl === 'string' ? source.loginUrl : ''
  const loginJs = stripJsTags(loginUrl)
  const checkCode = stripJsTags(checkJs)
  const fullCode = loginJs ? loginJs + '\n' + checkCode : checkCode

  const context = buildLoginJsContext(source, {}, null, null, false)
  const result = await invokeLoginJs(fullCode, context, LOGIN.CHECK_TIMEOUT_MS)

  if (!result.success) return false
  return result.result.trim() === 'true'
}

/**
 * 从书源对象读取已保存的 loginInfo。
 */
export async function getSavedLoginInfo(source: BookSource): Promise<Record<string, string>> {
  try {
    const raw = await store.get('bookSource')
    if (!Array.isArray(raw)) return {}
    const found = (raw as BookSource[]).find((s) => s.bookSourceUrl === source.bookSourceUrl)
    if (!found) return {}
    const src = found as unknown as Record<string, unknown>
    const map = src.loginInfoMap
    if (!isRecord(map)) return {}
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(map)) {
      result[k] = typeof v === 'string' ? v : String(v ?? '')
    }
    return result
  } catch {
    return {}
  }
}

/**
 * 保存 loginInfo 到书源对象。
 */
export async function saveLoginInfo(
  source: BookSource,
  loginInfo: Record<string, string>,
): Promise<boolean> {
  try {
    const raw = await store.get('bookSource')
    if (!Array.isArray(raw)) return false
    const list = [...(raw as BookSource[])]
    const idx = list.findIndex((s) => s.bookSourceUrl === source.bookSourceUrl)
    if (idx === -1) return false
    const target = list[idx]
    if (!target) return false
    const targetRecord = target as unknown as Record<string, unknown>
    targetRecord.loginInfoMap = { ...loginInfo }
    await store.set('bookSource', list)
    return true
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('source', 'frontend', `[登录] 保存 loginInfo 失败: ${msg}`)
    return false
  }
}

/**
 * 清除书源的 loginInfo。
 */
export async function clearLoginInfo(source: BookSource): Promise<boolean> {
  return saveLoginInfo(source, {})
}
