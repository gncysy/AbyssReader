// ============================================
// HTTP 客户端 — 纯接口，零环境依赖
// ============================================

import type { RequestConfig, ResponseData } from '../types.js'

export interface HttpClientAdapter {
  request(config: RequestConfig): Promise<ResponseData>
}

type RequestInterceptorFn = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
type ResponseInterceptorFn = (response: ResponseData) => ResponseData | Promise<ResponseData>
type ErrorInterceptorFn = (error: unknown) => unknown

export class RequestInterceptor {
  private requestFns: RequestInterceptorFn[] = []
  private responseFns: ResponseInterceptorFn[] = []
  private errorFns: ErrorInterceptorFn[] = []

  useRequest(fn: RequestInterceptorFn): void { this.requestFns.push(fn) }
  useResponse(fn: ResponseInterceptorFn): void { this.responseFns.push(fn) }
  useError(fn: ErrorInterceptorFn): void { this.errorFns.push(fn) }

  async interceptRequest(config: RequestConfig): Promise<RequestConfig> {
    let result = config
    for (const fn of this.requestFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断请求
      }
    }
    return result
  }

  async interceptResponse(response: ResponseData): Promise<ResponseData> {
    let result = response
    for (const fn of this.responseFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断响应
      }
    }
    return result
  }

  async interceptError(error: unknown): Promise<unknown> {
    let result = error
    for (const fn of this.errorFns) {
      try {
        result = await fn(result)
      } catch {
        // 拦截器异常不阻断错误传递
      }
    }
    return result
  }

  clear(): void { this.requestFns = []; this.responseFns = []; this.errorFns = [] }
}

export class HttpClient {
  private defaultHeaders: Record<string, string>
  private interceptor: RequestInterceptor
  private adapter: HttpClientAdapter | null = null
  private cookies: Record<string, string> = {}

  constructor(options: {
    defaultHeaders?: Record<string, string>
    defaultTimeout?: number
    interceptor?: RequestInterceptor
    adapter?: HttpClientAdapter
  } = {}) {
    this.defaultHeaders = options.defaultHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    this.interceptor = options.interceptor || new RequestInterceptor()
    this.adapter = options.adapter || null
  }

  setAdapter(adapter: HttpClientAdapter): void { this.adapter = adapter }

  getInterceptor(): RequestInterceptor { return this.interceptor }

  async request(config: RequestConfig): Promise<ResponseData> {
    if (!this.adapter) throw new Error('HttpClient: 未设置适配器，请在 services/ 层调用 setAdapter()')
    const finalConfig = await this.interceptor.interceptRequest(config)
    const startTime = Date.now()
    const headers = { ...this.defaultHeaders, ...(finalConfig.headers || {}) }
    const cookieStr = this.getCookieString(finalConfig.url)
    if (cookieStr && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = cookieStr
    }
    try {
      const response = await this.adapter.request({ ...finalConfig, headers })
      const duration = Date.now() - startTime
      const result = { ...response, duration }
      if (response.headers) {
        const setCookie = response.headers['Set-Cookie'] || response.headers['set-cookie']
        if (setCookie) {
          this.setCookieFromString(finalConfig.url, setCookie)
        }
      }
      return await this.interceptor.interceptResponse(result)
    } catch (error: unknown) {
      // 修复：错误拦截器的返回值不再强制转换为 ResponseData
      // 而是将处理后的错误重新抛出
      const handledError = await this.interceptor.interceptError(error)
      throw handledError
    }
  }

  async get(url: string, headers?: Record<string, string>): Promise<ResponseData> {
    const config: RequestConfig = { url, method: 'GET' }
    if (headers !== undefined) config.headers = headers
    return this.request(config)
  }

  async post(url: string, body: unknown, headers?: Record<string, string>): Promise<ResponseData> {
    const config: RequestConfig = { url, method: 'POST', body }
    if (headers !== undefined) config.headers = headers
    return this.request(config)
  }

  setCookie(url: string, cookieStr: string): void {
    try {
      const domain = new URL(url).hostname
      this.cookies[domain] = cookieStr
    } catch {
      // ignore
    }
  }

  setCookieFromString(url: string, cookieStr: string): void {
    this.setCookie(url, cookieStr)
  }

  getCookieString(url: string): string {
    try {
      const domain = new URL(url).hostname
      return this.cookies[domain] || ''
    } catch {
      return ''
    }
  }

  clearCookies(): void {
    this.cookies = {}
  }

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value
  }
}

let globalHttpClient: HttpClient | null = null

export function getGlobalHttpClient(): HttpClient {
  if (!globalHttpClient) globalHttpClient = new HttpClient()
  return globalHttpClient
}

export function resetGlobalHttpClient(): void { globalHttpClient = null }
export function setGlobalHttpClient(client: HttpClient): void { globalHttpClient = client }
