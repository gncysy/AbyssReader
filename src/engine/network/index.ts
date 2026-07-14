export { HttpClient, getGlobalHttpClient, resetGlobalHttpClient, createHttpClientForSource } from './client.js'
export { CookieManager, createCookieManager } from './cookie.js'
export { RequestInterceptor, createRequestInterceptor, createDefaultInterceptors } from './interceptor.js'

export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  headers?: Record<string, string>
  body?: any
  timeout?: number
  charset?: string
  retry?: number
  retryDelay?: number
  followRedirect?: boolean
  proxy?: string
  webView?: boolean
  responseType?: 'text' | 'arraybuffer' | 'blob' | 'json'
}

export interface ResponseData {
  status: number
  data: string | any
  headers: Record<string, string>
  cookies: Record<string, string>
  url: string
  duration: number
}
