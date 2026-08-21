// ============================================
// 日志系统单元测试
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  onLog, offLog, emitLog, logDebug, logInfo, logWarn, logError,
  getDiagnostics, clearDiagnostics, logHistory,
  type LogEntry, type LogFilter,
} from '../../../../engine/log/index.js'

describe('emitLog / onLog', () => {
  beforeEach(() => {
    // 清空日志历史
    logHistory.length = 0
    clearDiagnostics()
  })

  it('emitLog 写入历史', () => {
    emitLog('info', 'engine', 'frontend', 'test message')
    expect(logHistory.length).toBe(1)
    expect(logHistory[0]?.message).toBe('test message')
  })

  it('onLog 触发回调', () => {
    const received: LogEntry[] = []
    const handler = (entry: LogEntry) => { received.push(entry) }
    onLog(handler)
    emitLog('warn', 'network', 'rust', 'test warn')
    expect(received.length).toBe(1)
    expect(received[0]?.level).toBe('warn')
    offLog(handler)
  })

  it('onLog 返回取消函数', () => {
    const received: LogEntry[] = []
    const handler = (entry: LogEntry) => { received.push(entry) }
    const unsubscribe = onLog(handler)
    emitLog('info', 'engine', 'frontend', 'first')
    unsubscribe()
    emitLog('info', 'engine', 'frontend', 'second')
    expect(received.length).toBe(1)
  })

  it('offLog 取消监听', () => {
    const received: LogEntry[] = []
    const handler = (entry: LogEntry) => { received.push(entry) }
    onLog(handler)
    offLog(handler)
    emitLog('info', 'engine', 'frontend', 'test')
    expect(received.length).toBe(0)
  })

  it('按模块过滤', () => {
    const received: LogEntry[] = []
    const filter: LogFilter = { module: 'reader' }
    const handler = (entry: LogEntry) => { received.push(entry) }
    onLog(handler, filter)
    emitLog('info', 'reader', 'frontend', 'reader message')
    emitLog('info', 'engine', 'frontend', 'engine message')
    expect(received.length).toBe(1)
    expect(received[0]?.module).toBe('reader')
    offLog(handler)
  })

  it('按级别过滤', () => {
    const received: LogEntry[] = []
    const filter: LogFilter = { level: ['error'] }
    const handler = (entry: LogEntry) => { received.push(entry) }
    onLog(handler, filter)
    emitLog('info', 'engine', 'frontend', 'info message')
    emitLog('error', 'engine', 'frontend', 'error message')
    expect(received.length).toBe(1)
    expect(received[0]?.level).toBe('error')
    offLog(handler)
  })

  it('logDebug / logInfo / logWarn / logError', () => {
    logDebug('engine', 'frontend', 'debug')
    logInfo('engine', 'frontend', 'info')
    logWarn('engine', 'frontend', 'warn')
    logError('engine', 'frontend', 'error')
    expect(logHistory.length).toBe(4)
    expect(logHistory[0]?.level).toBe('debug')
    expect(logHistory[3]?.level).toBe('error')
  })
})

describe('诊断快照', () => {
  beforeEach(() => {
    logHistory.length = 0
    clearDiagnostics()
  })

  it('DIAG| 前缀的日志自动记录诊断', () => {
    const diagMsg = 'DIAG|final|' + JSON.stringify({
      t: '测试书源',
      u: 'https://example.com',
      r: 100,
      o: 50,
      p: 'preview',
    })
    emitLog('info', 'engine', 'rust', diagMsg)
    const diagnostics = getDiagnostics()
    expect(diagnostics.length).toBe(1)
    expect(diagnostics[0]?.tag).toBe('测试书源')
    expect(diagnostics[0]?.sourceUrl).toBe('https://example.com')
  })

  it('DIAG|error| 记录错误诊断', () => {
    const diagMsg = 'DIAG|error|' + JSON.stringify({
      t: '测试',
      u: 'https://example.com',
      m: 'JSON.parse 失败',
    })
    emitLog('error', 'engine', 'rust', diagMsg)
    const diagnostics = getDiagnostics()
    expect(diagnostics.length).toBe(1)
    expect(diagnostics[0]?.errorInfo).toBe('JSON.parse 失败')
  })

  it('非 DIAG| 前缀不记录诊断', () => {
    emitLog('info', 'engine', 'frontend', 'normal message')
    expect(getDiagnostics().length).toBe(0)
  })

  it('clearDiagnostics 清空', () => {
    const diagMsg = 'DIAG|final|' + JSON.stringify({ t: 'test' })
    emitLog('info', 'engine', 'rust', diagMsg)
    expect(getDiagnostics().length).toBe(1)
    clearDiagnostics()
    expect(getDiagnostics().length).toBe(0)
  })
})
