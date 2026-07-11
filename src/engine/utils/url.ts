// src/engine/utils/url.ts
/**
 * 统一的URL工具函数
 * 解决 search.ts, toc.ts, content.ts, book-info.ts 中重复定义的问题
 */

/**
 * 解析请求配置（支持 bookSource 格式）
 * 格式: "url, { method: 'POST', headers: {}, body: {}, charset: 'utf-8' }"
 */
export function parseRequestConfig(
  url: string
): {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: any
  charset: string | null
} {
  const result = {
    url: url,
    method: 'GET' as 'GET' | 'POST',
    headers: {} as Record<string, string>,
    body: null as any,
    charset: null as string | null,
  }

  // 匹配 JSON 配置: 末尾的 ", { ... }"
  const jsonMatch = url.match(/,\s*(\{[\s\S]*\})$/)
  if (jsonMatch) {
    try {
      let configStr = jsonMatch[1].trim()
      // 替换单引号为双引号（兼容性）
      configStr = configStr.replace(/'/g, '"')
      // 修复尾部逗号
      configStr = configStr.replace(/,(\s*})/g, '$1')
      const config = JSON.parse(configStr)

      result.url = url.substring(0, url.lastIndexOf(',')).trim()
      if (config.method) result.method = config.method.toUpperCase()
      if (config.headers) {
        result.headers = typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers
      }
      if (config.body) result.body = config.body
      if (config.charset) result.charset = config.charset
    } catch {
      // 解析失败，保持原样
    }
  }

  return result
}

/**
 * 构建完整URL（支持变量替换）
 */
export function buildUrl(
  url: string,
  baseUrl: string,
  variables: Record<string, any> = {}
): string {
  if (!url) return ''

  let result = url

  // 替换变量 {{key}}
  for (const [key, val] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      encodeURIComponent(String(val))
    )
  }

  // 处理相对路径
  if (result.startsWith('/')) {
    try {
      const base = new URL(baseUrl)
      result = base.origin + result
    } catch {
      const origin = baseUrl.match(/^(https?:\/\/[^/]+)/)
      if (origin) result = origin[1] + result
      else result = baseUrl + result
    }
  } else if (!result.match(/^https?:\/\//)) {
    // 处理不以 http 开头的路径
    const base = baseUrl.replace(/\/+$/, '')
    if (base.match(/^https?:\/\//)) {
      result = base + '/' + result.replace(/^\/+/, '')
    } else {
      result = 'https://' + base.replace(/^\/+/, '') + '/' + result.replace(/^\/+/, '')
    }
  }

  return result
}

/**
 * 构建请求头
 */
export function buildHeaders(
  source: { header?: string | Record<string, string> | null },
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...extraHeaders,
  }

  if (source.header) {
    try {
      const h = typeof source.header === 'string' ? JSON.parse(source.header) : source.header
      Object.assign(headers, h)
    } catch {
      // 忽略解析失败
    }
  }

  return headers
}

/**
 * 解析URL（相对路径转绝对路径）
 */
export function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return ''
  if (url.match(/^https?:\/\//)) return url

  try {
    const base = new URL(baseUrl)
    return url.startsWith('/') ? base.origin + url : baseUrl + '/' + url
  } catch {
    return url
  }
}

/**
 * 检查响应是否为JSON
 */
export function isJsonResponse(headers: Record<string, string>): boolean {
  const contentType = headers['content-type'] || headers['Content-Type'] || ''
  return contentType.includes('application/json')
}

/**
 * 安全解析JSON
 */
export function safeParseJson<T = any>(data: any): T | null {
  if (typeof data === 'object' && data !== null) return data as T
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return null
}

/**
 * 清理简介（移除HTML标签，限制长度）
 */
export function cleanIntro(intro: string, maxLength: number = 500): string {
  return String(intro)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}
