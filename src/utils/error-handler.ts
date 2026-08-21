// ============================================
// 错误处理工具
// ============================================

import {
  logError,
  logWarn,
  logInfo,
  recordDiagnostic,
} from '@engine/log/index.js'
import {
  NetworkError,
  ParseError,
  SourceError,
  isUserCancel,
} from '@engine/errors.js'
import type { LogModule } from '@engine/log/index.js'
import type { DiagnosticSnapshot } from '@engine/log/index.js'

const DIAG_ID_PREFIX = Date.now().toString(36)
const DEFAULT_ERROR_MESSAGE = '操作失败'
const DEFAULT_NETWORK_MESSAGE = '网络异常，请检查连接'
const DEFAULT_PARSE_MESSAGE = '解析失败'

export interface ErrorContext {
  module: LogModule
  operation: string
  sourceUrl?: string
  userMessage?: string
  silent?: boolean
}

export interface ErrorResult {
  message: string
  isUserCancel: boolean
  shouldShowUser: boolean
}

let diagIdCounter = 0

function generateDiagId(): string {
  diagIdCounter++
  return DIAG_ID_PREFIX + '_' + diagIdCounter.toString(36)
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error === 'string') return obj.error
    try { return JSON.stringify(err) } catch { return String(err) }
  }
  return String(err)
}

function getErrorStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.stack === 'string') return obj.stack
  }
  return undefined
}

export function handleError(err: unknown, ctx: ErrorContext): ErrorResult {
  if (isUserCancel(err)) {
    logInfo(ctx.module, 'frontend', `[${ctx.operation}] 已取消`)
    return { message: '已取消', isUserCancel: true, shouldShowUser: false }
  }

  const message = getErrorMessage(err)
  const stack = getErrorStack(err)

  if (err instanceof NetworkError) {
    logWarn(ctx.module, 'frontend', `[${ctx.operation}] 网络错误: ${message}`, ctx.sourceUrl)
    return {
      message: ctx.userMessage || DEFAULT_NETWORK_MESSAGE,
      isUserCancel: false,
      shouldShowUser: !ctx.silent,
    }
  }

  if (err instanceof ParseError || err instanceof SourceError) {
    logError(ctx.module, 'frontend', `[${ctx.operation}] ${message}`, stack?.substring(0, 500))
    recordDiagnostic(buildSnapshot(ctx, message, 'parse'))
    return {
      message: ctx.userMessage || `${DEFAULT_PARSE_MESSAGE}: ${message}`,
      isUserCancel: false,
      shouldShowUser: !ctx.silent,
    }
  }

  logError(ctx.module, 'frontend', `[${ctx.operation}] ${message}`, stack?.substring(0, 500))
  recordDiagnostic(buildSnapshot(ctx, message, 'runtime'))
  return {
    message: ctx.userMessage || `${DEFAULT_ERROR_MESSAGE}: ${message}`,
    isUserCancel: false,
    shouldShowUser: !ctx.silent,
  }
}

function buildSnapshot(
  ctx: ErrorContext,
  errorMessage: string,
  type: string,
): DiagnosticSnapshot {
  return {
    id: generateDiagId(),
    timestamp: new Date().toLocaleTimeString(),
    tag: ctx.operation,
    sourceUrl: ctx.sourceUrl || '',
    hasCrypto: false,
    resultLen: -1,
    outputLen: -1,
    cachedLen: -1,
    preview: '',
    errorInfo: `[${type}] ${errorMessage}`,
    extra: {
      module: ctx.module,
      operation: ctx.operation,
    },
  }
}
