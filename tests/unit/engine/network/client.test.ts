// ============================================
// HttpClient + RequestInterceptor 单元测试
// ============================================

import { describe, it, expect } from 'vitest'
import {
  HttpClient,
  RequestInterceptor,
  getGlobalHttpClient,
  resetGlobalHttpClient,
} from '../../../../engine/network/client.js'
import type { HttpClientAdapter, ResponseData, RequestConfig } from '../../../../engine/network/client.js'

describe('RequestInterceptor', () => {
  it('拦截请求', async () => {
    const interceptor = new RequestInterceptor()
    interceptor.useRequest((config) => ({
      ...config,
      headers: { ...config.headers, 'X-Added': 'yes' },
    }))
    const config: RequestConfig = { url: 'https://example.com', method: 'GET' }
    const result = await interceptor.interceptRequest(config)
    expect(result.headers?.['X-Added']).toBe('yes')
  })

  it('拦截响应', async () => {
    const interceptor = new RequestInterceptor()
    interceptor.useResponse((response) => ({
      ...response,
      status: 200,
    }))
    const response: ResponseData = {
      status: 500,
      data: 'error',
      headers: {},
      url: 'https://example.com',
      duration: 0,
    }
    const result = await interceptor.interceptResponse(response)
    expect(result.status).toBe(200)
  })

  it('拦截错误', async () => {
    const interceptor = new RequestInterceptor()
    interceptor.useError((error) => {
      // String(error) 对 Error 对象返回 "Error: original"
      return new Error('handled: ' + String(error))
    })
    const error = new Error('original')
    const result = await interceptor.interceptError(error)
    expect(result).toBeInstanceOf(Error)
    // 修复预期：String(error) 返回 "Error: original"
    expect((result as Error).message).toBe('handled: Error: original')
  })

  it('拦截器异常不阻断', async () => {
    const interceptor = new RequestInterceptor()
    interceptor.useRequest(() => {
      throw new Error('interceptor error')
    })
    interceptor.useRequest((config) => ({
      ...config,
      headers: { ...config.headers, 'X-After': 'ok' },
    }))
    const config: RequestConfig = { url: 'https://example.com', method: 'GET' }
    const result = await interceptor.interceptRequest(config)
    expect(result.headers?.['X-After']).toBe('ok')
  })

  it('clear 清空所有拦截器', async () => {
    const interceptor = new RequestInterceptor()
    interceptor.useRequest((config) => ({
      ...config,
      headers: { ...config.headers, 'X-Test': '1' },
    }))
    interceptor.clear()
    const config: RequestConfig = { url: 'https://example.com', method: 'GET' }
    const result = await interceptor.interceptRequest(config)
    expect(result.headers?.['X-Test']).toBeUndefined()
  })
})

describe('HttpClient', () => {
  it('无 adapter 时抛异常', async () => {
    const client = new HttpClient()
    await expect(client.request({ url: 'https://example.com', method: 'GET' }))
      .rejects.toThrow('未设置适配器')
  })

  it('设置 adapter 后正常请求', async () => {
    const mockAdapter: HttpClientAdapter = {
      request: async (config: RequestConfig): Promise<ResponseData> => ({
        status: 200,
        data: 'mock data',
        headers: {},
        url: config.url,
        duration: 10,
      }),
    }
    const client = new HttpClient()
    client.setAdapter(mockAdapter)
    const response = await client.request({ url: 'https://example.com', method: 'GET' })
    expect(response.status).toBe(200)
    expect(response.data).toBe('mock data')
  })

  it('默认 User-Agent header 存在', async () => {
    const capturedHeaders: Record<string, string>[] = []
    const mockAdapter: HttpClientAdapter = {
      request: async (config: RequestConfig): Promise<ResponseData> => {
        capturedHeaders.push(config.headers || {})
        return {
          status: 200,
          data: '',
          headers: {},
          url: config.url,
          duration: 0,
        }
      },
    }
    const client = new HttpClient()
    client.setAdapter(mockAdapter)
    await client.request({ url: 'https://example.com', method: 'GET' })
    expect(capturedHeaders[0]?.['User-Agent']).toContain('Mozilla')
  })

  it('Cookie 自动添加到 header', async () => {
    const capturedHeaders: Record<string, string>[] = []
    const mockAdapter: HttpClientAdapter = {
      request: async (config: RequestConfig): Promise<ResponseData> => {
        capturedHeaders.push(config.headers || {})
        return {
          status: 200,
          data: '',
          headers: {},
          url: config.url,
          duration: 0,
        }
      },
    }
    const client = new HttpClient()
    client.setAdapter(mockAdapter)
    client.setCookie('https://example.com', 'session=abc123')
    await client.request({ url: 'https://example.com/page', method: 'GET' })
    expect(capturedHeaders[0]?.['Cookie']).toBe('session=abc123')
  })

  it('响应 Set-Cookie 自动保存', async () => {
    const mockAdapter: HttpClientAdapter = {
      request: async (config: RequestConfig): Promise<ResponseData> => ({
        status: 200,
        data: '',
        headers: { 'Set-Cookie': 'newCookie=xyz' },
        url: config.url,
        duration: 0,
      }),
    }
    const client = new HttpClient()
    client.setAdapter(mockAdapter)
    await client.request({ url: 'https://example.com/page', method: 'GET' })
    expect(client.getCookieString('https://example.com/page')).toBe('newCookie=xyz')
  })

  it('get / post 辅助方法', async () => {
    const calls: string[] = []
    const mockAdapter: HttpClientAdapter = {
      request: async (config: RequestConfig): Promise<ResponseData> => {
        calls.push(config.method || 'GET')
        return { status: 200, data: '', headers: {}, url: config.url, duration: 0 }
      },
    }
    const client = new HttpClient()
    client.setAdapter(mockAdapter)
    await client.get('https://example.com')
    await client.post('https://example.com', { a: 1 })
    expect(calls).toEqual(['GET', 'POST'])
  })

  it('getGlobalHttpClient 返回单例', () => {
    resetGlobalHttpClient()
    const client1 = getGlobalHttpClient()
    const client2 = getGlobalHttpClient()
    expect(client1).toBe(client2)
  })
})
