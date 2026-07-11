// ============================================
// Android API 模拟 - 使用平台适配器
// ============================================

import CryptoJS from 'crypto-js'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { toSimplified } from 'chinese-simple2traditional'
import { getGlobalHttpClient, type RequestConfig } from '../network/index.js'
import { getGlobalStore, type ContextStore } from '../context/index.js'
import { getPlatformAdapter } from './adapter.js'

dayjs.extend(utc)

export class AndroidApi {
  private store: ContextStore
  private httpClient: ReturnType<typeof getGlobalHttpClient>

  constructor(store?: ContextStore) {
    this.store = store || getGlobalStore()
    this.httpClient = getGlobalHttpClient()
  }

  // ========================================
  // 网络请求
  // ========================================

  async ajax(url: string, options: any = {}): Promise<any> {
    const config: RequestConfig = {
      url: url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      charset: options.charset || 'utf-8',
      timeout: options.timeout || 30000,
    }

    try {
      const response = await this.httpClient.request(config)
      if (response.status >= 200 && response.status < 300) {
        return response.data
      }
      throw new Error(`HTTP ${response.status}`)
    } catch (error: any) {
      console.error('[AndroidApi.ajax] 请求失败:', {
        url,
        method: config.method,
        status: error.status,
        message: error.message,
        stack: error.stack,
      })
      throw error
    }
  }

  async ajaxAll(urls: string[]): Promise<any[]> {
    try {
      const requests = urls.map((url: string) => this.httpClient.request({ url }))
      const responses = await Promise.all(requests)
      return responses.map((res: any) => {
        if (res.status >= 200 && res.status < 300) {
          return res.data
        }
        throw new Error(`HTTP ${res.status}`)
      })
    } catch (error: any) {
      console.error('[AndroidApi.ajaxAll] 批量请求失败:', {
        urls,
        message: error.message,
        stack: error.stack,
      })
      throw error
    }
  }

  async post(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    const response = await this.httpClient.request({
      url,
      method: 'POST',
      body,
      headers,
    })
    if (response.status >= 200 && response.status < 300) {
      return response.data
    }
    throw new Error(`HTTP ${response.status}`)
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<any> {
    const response = await this.httpClient.request({
      url,
      method: 'GET',
      headers,
    })
    if (response.status >= 200 && response.status < 300) {
      return response.data
    }
    throw new Error(`HTTP ${response.status}`)
  }

  // ========================================
  // Base64
  // ========================================

  base64Encode(str: string): string {
    return Buffer.from(str, 'utf-8').toString('base64')
  }

  base64Decode(str: string): string {
    return Buffer.from(str, 'base64').toString('utf-8')
  }

  base64DecodeToByteArray(str: string): Uint8Array {
    return new Uint8Array(Buffer.from(str, 'base64'))
  }

  getByteArray(data: any): Uint8Array {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data)
    }
    if (Buffer.isBuffer(data)) {
      return new Uint8Array(data)
    }
    if (data instanceof Uint8Array) {
      return data
    }
    return new Uint8Array()
  }

  // ========================================
  // 哈希 - 使用 crypto-js
  // ========================================

  md5Encode(str: string): string {
    return CryptoJS.MD5(str).toString()
  }

  digestHex(str: string, algorithm: string = 'sha256'): string {
    const map: Record<string, any> = {
      'sha1': CryptoJS.SHA1,
      'sha256': CryptoJS.SHA256,
      'sha384': CryptoJS.SHA384,
      'sha512': CryptoJS.SHA512,
    }
    return map[algorithm] ? map[algorithm](str).toString() : CryptoJS.SHA256(str).toString()
  }

  HMacHex(str: string, key: string, algorithm: string = 'sha256'): string {
    const map: Record<string, any> = {
      'sha1': CryptoJS.HmacSHA1,
      'sha256': CryptoJS.HmacSHA256,
      'sha384': CryptoJS.HmacSHA384,
      'sha512': CryptoJS.HmacSHA512,
    }
    return map[algorithm] ? map[algorithm](str, key).toString() : CryptoJS.HmacSHA256(str, key).toString()
  }

  hexDecodeToString(hex: string): string {
    return Buffer.from(hex, 'hex').toString('utf-8')
  }

  // ========================================
  // AES/DES 加密 - 使用 crypto-js
  // ========================================

  aesDecode(data: string, key: string, iv?: string, mode: string = 'CBC'): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined
    const encrypted = CryptoJS.enc.Base64.parse(data)

    const decrypted = (CryptoJS.AES.decrypt as any)(
      { ciphertext: encrypted },
      keyWord,
      {
        mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivWord,
      }
    )
    return decrypted.toString(CryptoJS.enc.Utf8)
  }

  aesBase64DecodeToString(data: string, key: string, iv?: string, mode: string = 'CBC'): string {
    return this.aesDecode(data, key, iv, mode)
  }

  desEncode(data: string, key: string, iv?: string, mode: string = 'CBC'): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined

    const encrypted = (CryptoJS.DES.encrypt as any)(data, keyWord, {
      mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return encrypted.toString()
  }

  desEncodeToBase64String(data: string, key: string, iv?: string, mode: string = 'CBC'): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined

    const encrypted = (CryptoJS.DES.encrypt as any)(data, keyWord, {
      mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    })
    return encrypted.toString(CryptoJS.enc.Base64)
  }

  createSymmetricCrypto(
    algorithm: string,
    key: string,
    iv?: string
  ): {
    encryptStr: (data: string) => string
    decryptStr: (data: string) => string
  } {
    const alg = algorithm.toLowerCase()
    const keyWord = CryptoJS.enc.Utf8.parse(key)
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined

    let mode: any = CryptoJS.mode.CBC
    if (alg.includes('/ecb/')) {
      mode = CryptoJS.mode.ECB
    }

    let cipher: any = CryptoJS.AES
    if (alg.includes('des')) {
      cipher = CryptoJS.DES
    }

    return {
      encryptStr: (data: string): string => {
        const encrypted = (cipher.encrypt as any)(data, keyWord, {
          mode: mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        })
        return encrypted.toString()
      },
      decryptStr: (data: string): string => {
        const decrypted = (cipher.decrypt as any)(data, keyWord, {
          mode: mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        })
        return decrypted.toString(CryptoJS.enc.Utf8)
      },
    }
  }

  // ========================================
  // 时间
  // ========================================

  timeFormat(timestamp: number | string, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    const date = typeof timestamp === 'number' ? timestamp : parseInt(timestamp)
    return dayjs(date).format(format)
  }

  timeFormatUTC(timestamp: number | string, format: string = 'YYYY-MM-DD HH:mm:ss', offset: number = 0): string {
    const date = typeof timestamp === 'number' ? timestamp : parseInt(timestamp)
    return dayjs(date).utcOffset(offset).format(format)
  }

  // ========================================
  // URL 编码
  // ========================================

  escape(str: string): string {
    return encodeURIComponent(str)
  }

  unescape(str: string): string {
    return decodeURIComponent(str)
  }

  encodeURI(str: string): string {
    return encodeURIComponent(str)
  }

  decodeURI(str: string): string {
    return decodeURIComponent(str)
  }

  // ========================================
  // 变量存储
  // ========================================

  getVariable(key: string): any {
    return this.store.get(key)
  }

  setVariable(key: string, value: any): void {
    this.store.put(key, value)
  }

  putLoginHeader(headers: Record<string, string>): void {
    this.store.put('loginHeaders', headers)
  }

  getLoginInfoMap(): Record<string, any> {
    return this.store.getAll()
  }

  put(key: string, value: any): void {
    this.store.put(key, value)
  }

  getString(key: string): string {
    const value = this.store.get(key)
    return value !== undefined && value !== null ? String(value) : ''
  }

  // ========================================
  // WebView（使用平台适配器）
  // ========================================

  webView(url: string): void {
    const adapter = getPlatformAdapter()
    adapter.createWebViewWindow(url, '验证').catch(() => {})
  }

  initUrl(): void {
    console.warn('[AndroidApi] initUrl is a UI operation, use platform adapter instead.')
  }

  refreshBookUrl(): void {
    console.warn('[AndroidApi] refreshBookUrl is a UI operation, use platform adapter instead.')
  }

  async startBrowserAwait(url: string): Promise<string | void> {
    const adapter = getPlatformAdapter()
    return adapter.createWebViewWindow(url, '登录')
  }

  // ========================================
  // 工具
  // ========================================

  randomUUID(): string {
    return CryptoJS.lib.WordArray.random(16).toString()
  }

  log(...args: any[]): void {
    console.log('[AndroidApi]', ...args)
  }

  toast(message: string): void {
    const adapter = getPlatformAdapter()
    adapter.showNotification('墨阅', message)
  }

  toNumChapter(str: string): number {
    const match = str.match(/\d+/)
    return match ? parseInt(match[0], 10) : 0
  }

  t2s(str: string): string {
    if (!str || typeof str !== 'string') return str
    try {
      return toSimplified(str)
    } catch {
      return str
    }
  }

  importScript(path: string): string {
    const fs = require('fs')
    try {
      return fs.readFileSync(path, 'utf-8')
    } catch {
      return ''
    }
  }
}

export function createAndroidApi(store?: ContextStore): AndroidApi {
  return new AndroidApi(store)
}

let globalAndroidApi: AndroidApi | null = null

export function getGlobalAndroidApi(): AndroidApi {
  if (!globalAndroidApi) {
    globalAndroidApi = new AndroidApi()
  }
  return globalAndroidApi
}

export function resetGlobalAndroidApi(): void {
  globalAndroidApi = null
}
