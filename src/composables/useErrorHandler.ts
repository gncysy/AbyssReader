// ============================================
// useErrorHandler — Vue 组合式错误处理
// 不依赖 useMessage，由调用方决定如何显示
// ============================================

import { handleError, type ErrorContext, type ErrorResult } from '@/utils/error-handler.js'

export function useErrorHandler() {
  /**
   * 处理错误并返回结果，由调用方决定是否弹 toast。
   * 命名沿用历史 API，语义为 "handle error and return whether to notify"。
   */
  function handleAndNotify(err: unknown, ctx: ErrorContext): ErrorResult {
    return handleError(err, ctx)
  }

  function handleSilent(err: unknown, ctx: ErrorContext): ErrorResult {
    return handleError(err, { ...ctx, silent: true })
  }

  return {
    handleAndNotify,
    handleSilent,
  }
}
