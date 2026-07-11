import { useMessage, useNotification } from 'naive-ui'

export type ErrorLevel = 'info' | 'success' | 'warning' | 'error'

export function showError(message: string, level: ErrorLevel = 'error', duration?: number): void {
  const msg = useMessage()
  const method = msg[level] || msg.error
  method(message, { duration: duration || 3000 })
}

export function showNotification(title: string, content: string, level: ErrorLevel = 'info'): void {
  const notification = useNotification()
  const method = notification[level] || notification.info
  method({ title, content, duration: 4000 })
}

export function handleApiError(error: any, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || '未知错误'

  // HTTP 错误
  if (error?.response?.status === 404) return '资源未找到 (404)'
  if (error?.response?.status === 403) return '访问被拒绝 (403)'
  if (error?.response?.status === 429) return '请求过于频繁，请稍后再试'
  if (error?.response?.status === 500) return '服务器内部错误 (500)'

  // 网络错误
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return '请求超时，请检查网络连接'
  }
  if (error?.message?.includes('ENOTFOUND') || error?.message?.includes('getaddrinfo')) {
    return '无法连接服务器，请检查网络'
  }
  if (error?.message?.includes('ECONNREFUSED')) {
    return '连接被拒绝，请检查网络'
  }

  // IPC 错误
  if (error?.message?.includes('IPC')) {
    return '通信错误，请重启应用'
  }

  // 引擎错误
  if (error?.message?.includes('书源')) {
    return error.message
  }

  // 通用错误
  if (typeof error === 'string') return error
  if (error?.message) return error.message

  return fallbackMessage || '未知错误'
}

export function withErrorHandler<T>(
  fn: () => Promise<T>,
  fallback?: T,
  onError?: (error: any) => void
): Promise<T> {
  return fn().catch((error) => {
    console.error('[ErrorHandler]', error)
    if (onError) onError(error)
    if (fallback !== undefined) return fallback
    throw error
  })
}
