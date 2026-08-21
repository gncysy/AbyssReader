// ============================================
// 通用工具函数单元测试
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle, formatBytes, formatDuration } from '../../../../src/utils/helpers.js'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('延迟执行函数', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('连续调用只执行最后一次', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced('a')
    debounced('b')
    debounced('c')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('cancel 取消待执行', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('在间隔内只执行一次', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 300)
    throttled()
    throttled()
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('间隔后可以再次执行', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 300)
    throttled()
    vi.advanceTimersByTime(300)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('formatBytes', () => {
  it('小于 1KB 显示 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('1KB 到 1MB 显示 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(512 * 1024)).toBe('512.0 KB')
  })

  it('大于 1MB 显示 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })
})

describe('formatDuration', () => {
  it('小于 1 秒显示 ms', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('大于等于 1 秒显示 s', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
  })
})
