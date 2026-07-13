import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import type { RequestConfig, ResponseData } from './index.js'

function isBlockedHost(hostname: string): boolean {
  const blocked = [
    '127.0.0.1', 'localhost', '::1',
    '192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
    '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
    '169.254.',
  ]
  for (const prefix of blocked) {
    if (hostname.startsWith(prefix)) {
      return true
    }
  }
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (ipv4Regex.test(hostname)) {
    const parts = hostname.split('.').map(Number)
    if (parts[0] === 127) return true
    if (parts[0] === 10) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  }
  return false
}

export class HttpClient {
  private client: AxiosInstance
  private cookieJar: CookieJar
  private defaultHeaders: Record<string, string>
  private defaultTimeout: number

  constructor(options: {
    cookieJar?: CookieJar
    defaultHeaders?: Record<string, string>
    defaultTimeout?: number
  } = {}) {
    this.cookieJar = options.cookieJar || new CookieJar()
    this.defaultHeaders = options.defaultHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    }
    this.defaultTimeout = options.defaultTimeout || 30000

    this.client = wrapper(
      axios.create({
        timeout: this.defaultTimeout,
        withCredentials: true,
        maxRedirects: 5,
        validateStatus: () => true,
      } as any)
    )

    ;(this.client as any).defaults.jar = this.cookieJar
    this.client.defaults.headers.common = {
      ...this.client.defaults.headers.common,
      ...this.defaultHeaders,
    }
  }

  async request(config: RequestConfig): Promise<ResponseData> {
    try {
      const urlObj = new URL(config.url)
      if (isBlockedHost(urlObj.hostname)) {
        throw new Error(`禁止访问内网地址: ${urlObj.hostname}`)
      }
    } catch {
      // 如果 URL 解析失败，允许请求（由 axios 处理）
    }

    const startTime = Date.now()
    const axiosConfig: AxiosRequestConfig = {
      url: config.url,
      method: config.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...(config.headers || {}),
      },
      timeout: config.timeout || this.defaultTimeout,
      maxRedirects: config.followRedirect !== false ? 5 : 0,
    }

    if (config.body) {
      if (typeof config.body === 'string') {
        axiosConfig.data = config.body
        if (!axiosConfig.headers?.['Content-Type']) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      } else if (typeof config.body === 'object') {
        axiosConfig.data = config.body
        if (!axiosConfig.headers?.['Content-Type']) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            'Content-Type': 'application/json',
          }
        }
      }
    }

    let retries = config.retry || 0
    let lastError: any

    while (retries >= 0) {
      try {
        const response = await this.client.request(axiosConfig)
        return await this.parseResponse(response, startTime)
      } catch (error: any) {
        lastError = error
        if (retries > 0) {
          const delay = config.retryDelay || 500
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        retries--
      }
    }

    throw lastError || new Error('Request failed after retries')
  }

  async get(url: string, config?: Partial<RequestConfig>): Promise<ResponseData> {
    return this.request({ ...config, url, method: 'GET' })
  }

  async post(url: string, body?: any, config?: Partial<RequestConfig>): Promise<ResponseData> {
    return this.request({ ...config, url, method: 'POST', body })
  }

  async all(requests: RequestConfig[], concurrency: number = 5): Promise<ResponseData[]> {
    const results: ResponseData[] = []
    const queue = [...requests]
    const promises: Promise<void>[] = []

    const worker = async () => {
      while (queue.length > 0) {
        const req = queue.shift()
        if (!req) break
        try {
          const result = await this.request(req)
          results.push(result)
        } catch (error) {
          results.push(error as any)
        }
      }
    }

    const workerCount = Math.min(concurrency, requests.length)
    for (let i = 0; i < workerCount; i++) {
      promises.push(worker())
    }

    await Promise.all(promises)
    return results
  }

  private async parseResponse(response: AxiosResponse, startTime: number): Promise<ResponseData> {
    let data = response.data

    const contentTypeHeader = response.headers['content-type']
    let charset = 'utf-8'
    if (contentTypeHeader && typeof contentTypeHeader === 'string') {
      const match = contentTypeHeader.match(/charset=([^;]+)/)
      if (match) {
        charset = match[1]
      }
    }

    if (Buffer.isBuffer(data)) {
      try {
        const iconv = await import('iconv-lite')
        data = iconv.decode(data, charset)
      } catch {
        data = data.toString('utf-8')
      }
    }

    const cookies: Record<string, string> = {}
    const setCookieHeaders = response.headers['set-cookie']
    if (setCookieHeaders) {
      const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
      for (const cookieStr of cookieArray) {
        if (typeof cookieStr === 'string') {
          const match = cookieStr.match(/^([^=]+)=([^;]+)/)
          if (match) {
            cookies[match[1]] = match[2]
          }
        }
      }
    }

    const headers: Record<string, string> = {}
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined && value !== null) {
          headers[key] = String(value)
        }
      }
    }

    return {
      status: response.status,
      data: data,
      headers: headers,
      cookies: cookies,
      url: response.config.url || '',
      duration: Date.now() - startTime,
    }
  }

  getCookieJar(): CookieJar {
    return this.cookieJar
  }

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value
    this.client.defaults.headers.common[key] = value
  }

  clearCookies(): void {
    this.cookieJar = new CookieJar()
    this.client = wrapper(
      axios.create({
        timeout: this.defaultTimeout,
        withCredentials: true,
        maxRedirects: 5,
        validateStatus: () => true,
      } as any)
    )
    ;(this.client as any).defaults.jar = this.cookieJar
  }

  clone(): HttpClient {
    return new HttpClient({
      cookieJar: new CookieJar(),
      defaultHeaders: { ...this.defaultHeaders },
      defaultTimeout: this.defaultTimeout,
    })
  }
}

let globalHttpClient: HttpClient | null = null

export function getGlobalHttpClient(): HttpClient {
  if (!globalHttpClient) {
    globalHttpClient = new HttpClient()
  }
  return globalHttpClient
}

export function resetGlobalHttpClient(): void {
  if (globalHttpClient) {
    globalHttpClient.clearCookies()
    globalHttpClient = null
  }
}

export function createHttpClientForSource(sourceId: string): HttpClient {
  return new HttpClient({
    cookieJar: new CookieJar(),
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })
}
