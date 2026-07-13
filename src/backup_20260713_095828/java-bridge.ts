import { network } from './modules/network.js'
import { cryptoApi } from './modules/crypto.js'
import { dom } from './modules/dom.js'
import { storage } from './modules/storage.js'
import { ui } from './modules/ui.js'
import { webview } from './modules/webview.js'
import { context } from './modules/context.js'
import { utils } from './modules/utils.js'
import { getGlobalHttpClient } from '../network/client.js'
import { getGlobalStore } from '../context/store.js'

export function buildJavaAPI(): any {
  const httpClient = getGlobalHttpClient()
  const store = getGlobalStore()

  return {
    // ===== 网络 =====
    ajax: network.ajax,
    post: network.post,
    get: network.httpGet,
    connect: network.connect,
    getStrResponse: network.getStrResponse,
    getByteResponse: network.getByteResponse,
    ajaxAll: network.ajaxAll,

    // ===== Cookie =====
    cookie: network.cookie,

    // ===== 编码/加密 =====
    base64Encode: cryptoApi.base64Encode,
    base64Decode: cryptoApi.base64Decode,
    base64DecodeToByteArray: cryptoApi.base64DecodeToByteArray,
    getByteArray: cryptoApi.getByteArray,
    hexDecodeToString: cryptoApi.hexDecodeToString,
    hexEncode: cryptoApi.hexEncode,
    md5Encode: cryptoApi.md5Encode,
    digestHex: cryptoApi.digestHex,
    HMacHex: cryptoApi.HMacHex,
    aesBase64DecodeToString: cryptoApi.aesBase64DecodeToString,
    desEncodeToBase64String: cryptoApi.desEncodeToBase64String,
    createSymmetricCrypto: cryptoApi.createSymmetricCrypto,
    createAsymmetricCrypto: cryptoApi.createAsymmetricCrypto,
    randomUUID: cryptoApi.randomUUID,

    // ===== DOM =====
    getElements: dom.getElements,
    getString: dom.getString,
    getStringList: dom.getStringList,
    getElement: dom.getElement,
    setContent: dom.setContent,

    // ===== 存储 =====
    getVariable: (key: string) => store.get(key),
    setVariable: (key: string, value: any) => store.put(key, value),
    getLoginInfoMap: storage.getLoginInfoMap,
    putLoginHeader: storage.putLoginHeader,
    getLoginHeader: storage.getLoginHeader,

    // ===== 上下文 =====
    put: context.put,
    get: context.get,
    clear: context.clear,

    // ===== UI =====
    toast: ui.toast,
    longToast: ui.longToast,
    startBrowserAwait: ui.startBrowserAwait,

    // ===== WebView =====
    webView: webview.webView,
    initUrl: webview.initUrl,
    refreshBookUrl: webview.refreshBookUrl,

    // ===== 时间 =====
    timeFormat: utils.timeFormat,
    timeFormatUTC: utils.timeFormatUTC,

    // ===== 工具 =====
    toNumChapter: utils.toNumChapter,
    t2s: utils.t2s,
    encodeURI: utils.encodeURI,
    decodeURI: utils.decodeURI,
    escape: utils.escape,
    unescape: utils.unescape,
    log: utils.log,
    importScript: utils.importScript,
    random: utils.random,

    // ===== 缓存文件 =====
    cacheFile: async (url: string, saveTime?: number): Promise<string | null> => {
      const key = `cache_${cryptoApi.md5Encode(url)}`
      const cached = store.get(key)
      if (cached && typeof cached === 'string') {
        return cached
      }
      try {
        const result = await network.ajax(url)
        if (result && typeof result === 'string') {
          store.put(key, result)
          return result
        }
        return null
      } catch {
        return null
      }
    },

    // ===== 获取 Cookie =====
    getCookie: async (tag: string, key?: string): Promise<string> => {
      const jar = httpClient.getCookieJar()
      try {
        const cookies = await jar.getCookies(tag)
        const cookieStr = cookies.map(c => c.toString()).join('; ')
        if (key) {
          const cookieMap: Record<string, string> = {}
          for (const c of cookies) {
            cookieMap[c.key] = c.value
          }
          return cookieMap[key] || ''
        }
        return cookieStr
      } catch {
        return ''
      }
    },

    androidId: (): string => {
      return 'abyss-reader-android-id'
    },
  }
}
