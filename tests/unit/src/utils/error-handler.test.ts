// ============================================
// 错误处理单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import { handleError } from '../../../../src/utils/error-handler.js'
import {
  NetworkError, ParseError, SourceError, UserCancelError,
} from '../../../../engine/errors.js'

describe('handleError', () => {
  it('UserCancelError 返回已取消', () => {
    const result = handleError(new UserCancelError(), {
      module: 'reader',
      operation: 'test',
    })
    expect(result.isUserCancel).toBe(true)
    expect(result.shouldShowUser).toBe(false)
    expect(result.message).toBe('已取消')
  })

  it('AbortError 被识别为用户取消', () => {
    const abortError = new Error('canceled')
    abortError.name = 'AbortError'
    const result = handleError(abortError, {
      module: 'search',
      operation: 'test',
    })
    expect(result.isUserCancel).toBe(true)
    expect(result.shouldShowUser).toBe(false)
  })

  it('NetworkError 返回网络错误消息', () => {
    const result = handleError(new NetworkError('DNS failed'), {
      module: 'network',
      operation: 'fetch',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.shouldShowUser).toBe(true)
    expect(result.message).toBe('网络异常，请检查连接')
  })

  it('ParseError 返回解析错误消息', () => {
    const result = handleError(new ParseError('invalid rule'), {
      module: 'engine',
      operation: 'parse',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.shouldShowUser).toBe(true)
    expect(result.message).toContain('解析失败')
  })

  it('SourceError 返回解析错误消息', () => {
    const result = handleError(new SourceError('source not found'), {
      module: 'source',
      operation: 'load',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.shouldShowUser).toBe(true)
    expect(result.message).toContain('解析失败')
  })

  it('通用错误返回默认错误消息', () => {
    const result = handleError(new Error('unknown error'), {
      module: 'system',
      operation: 'test',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.shouldShowUser).toBe(true)
    expect(result.message).toContain('操作失败')
  })

  it('silent 模式不显示给用户', () => {
    const result = handleError(new Error('test'), {
      module: 'system',
      operation: 'test',
      silent: true,
    })
    expect(result.shouldShowUser).toBe(false)
  })

  it('自定义 userMessage 优先', () => {
    const result = handleError(new NetworkError('DNS failed'), {
      module: 'network',
      operation: 'fetch',
      userMessage: '自定义网络错误',
    })
    expect(result.message).toBe('自定义网络错误')
  })

  it('字符串错误被处理', () => {
    const result = handleError('plain string error', {
      module: 'system',
      operation: 'test',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.message).toContain('操作失败')
  })

  it('对象错误被处理', () => {
    const result = handleError({ message: 'object error' }, {
      module: 'system',
      operation: 'test',
    })
    expect(result.isUserCancel).toBe(false)
    expect(result.message).toContain('object error')
  })
})
