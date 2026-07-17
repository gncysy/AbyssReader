import { executeJs as executeJsCode } from '../utils/js-source.js'
import { cryptoApi } from '../platform/modules/crypto.js'
import { putContext, getContext } from '../context/shared.js'

export interface JsContext {
  source?: any
  book?: any
  result?: any
  baseUrl?: string
  chapter?: any
  nextChapterUrl?: string
  src?: any
  cookie?: {
    getCookie: (url: string) => string
    getKey: (url: string, key: string) => string
  }
}

// 全局 CookieJar 引用，由 ipc-handlers 设置
let globalCookieJar: any = null

export function setCookieJar(jar: any) {
  globalCookieJar = jar
}

function getCookieSync(url: string): string {
  try {
    if (!globalCookieJar) return ''
    const cookies = globalCookieJar.getCookiesSync?.(url) || []
    return cookies.map((c: any) => c.toString()).join('; ')
  } catch { return '' }
}

function getCookieKeySync(url: string, key: string): string {
  try {
    if (!globalCookieJar) return ''
    const cookies = globalCookieJar.getCookiesSync?.(url) || []
    const found = cookies.find((c: any) => c.key === key)
    return found?.value || ''
  } catch { return '' }
}

export function executeJs(source: any, rule: string, context: JsContext = {}): any {
  const sourceKey = context.source?.bookSourceUrl || context.source?.url || 'default'

  const java = {
    put: (key: string, value: any) => { putContext(sourceKey, key, value); return value },
    get: (key: string) => getContext(sourceKey, key),
    createSymmetricCrypto: cryptoApi.createSymmetricCrypto.bind(cryptoApi),
    base64Encode: cryptoApi.base64Encode.bind(cryptoApi),
    base64Decode: cryptoApi.base64Decode.bind(cryptoApi),
    md5Encode: cryptoApi.md5Encode.bind(cryptoApi),
    digestHex: cryptoApi.digestHex.bind(cryptoApi),
  }

  const cookie = context.cookie || {
    getCookie: getCookieSync,
    getKey: getCookieKeySync,
  }

  return executeJsCode(source, rule, { ...context, java, cookie })
}
