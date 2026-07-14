import { network } from './modules/network.js';
import { cryptoApi } from './modules/crypto.js';
import { dom } from './modules/dom.js';
import { storage } from './modules/storage.js';
import { ui } from './modules/ui.js';
import { context } from './modules/context.js';
import { utils } from './modules/utils.js';
import { getGlobalHttpClient } from '../network/client.js';
import { getGlobalStore } from '../context/store.js';

export function buildJavaAPI(): any {
  const httpClient = getGlobalHttpClient();
  const store = getGlobalStore();

  return {
    // ===== 网络 =====
    ajax: network.ajax.bind(network),
    post: network.post.bind(network),
    httpGet: network.httpGet.bind(network),
    connect: network.connect.bind(network),
    getStrResponse: network.getStrResponse.bind(network),
    getByteResponse: network.getByteResponse.bind(network),
    ajaxAll: network.ajaxAll.bind(network),

    // ===== Cookie =====
    cookie: network.cookie,

    // ===== 编码/加密 =====
    base64Encode: cryptoApi.base64Encode.bind(cryptoApi),
    base64Decode: cryptoApi.base64Decode.bind(cryptoApi),
    base64DecodeToByteArray: cryptoApi.base64DecodeToByteArray.bind(cryptoApi),
    getByteArray: cryptoApi.getByteArray.bind(cryptoApi),
    hexDecodeToString: cryptoApi.hexDecodeToString.bind(cryptoApi),
    hexEncode: cryptoApi.hexEncode.bind(cryptoApi),
    md5Encode: cryptoApi.md5Encode.bind(cryptoApi),
    digestHex: cryptoApi.digestHex.bind(cryptoApi),
    HMacHex: cryptoApi.HMacHex.bind(cryptoApi),
    aesBase64DecodeToString: cryptoApi.aesBase64DecodeToString.bind(cryptoApi),
    desEncodeToBase64String: cryptoApi.desEncodeToBase64String.bind(cryptoApi),
    createSymmetricCrypto: cryptoApi.createSymmetricCrypto.bind(cryptoApi),
    createAsymmetricCrypto: cryptoApi.createAsymmetricCrypto.bind(cryptoApi),
    randomUUID: cryptoApi.randomUUID.bind(cryptoApi),

    // ===== DOM =====
    getElements: dom.getElements.bind(dom),
    getString: dom.getString.bind(dom),
    getStringList: dom.getStringList.bind(dom),
    getElement: dom.getElement.bind(dom),
    setContent: dom.setContent.bind(dom),
    getContent: dom.getContent.bind(dom),
    getContentBaseUrl: dom.getContentBaseUrl.bind(dom),
    clearContentCache: dom.clearContentCache.bind(dom),

    // ===== 存储（含 Legado 兼容） =====
    getVariable: (key: string) => storage.getVariable(key),
    setVariable: (key: string, value: any) => storage.setVariable(key, value),
    getLoginInfoMap: storage.getLoginInfoMap.bind(storage),
    putLoginHeader: storage.putLoginHeader.bind(storage),
    getLoginHeader: storage.getLoginHeader.bind(storage),
    putBookVariable: storage.putBookVariable.bind(storage),
    getBookVariable: storage.getBookVariable.bind(storage),
    putChapterVariable: storage.putChapterVariable.bind(storage),
    getChapterVariable: storage.getChapterVariable.bind(storage),
    setReverseToc: storage.setReverseToc.bind(storage),
    getReverseToc: storage.getReverseToc.bind(storage),

    // ===== 上下文 =====
    put: context.put.bind(context),
    get: context.get.bind(context),
    clear: context.clear.bind(context),

    // ===== UI =====
    toast: ui.toast.bind(ui),
    longToast: ui.longToast.bind(ui),
    startBrowserAwait: ui.startBrowserAwait.bind(ui),

    // ===== 时间 =====
    timeFormat: utils.timeFormat.bind(utils),
    timeFormatUTC: utils.timeFormatUTC.bind(utils),

    // ===== 工具 =====
    toNumChapter: utils.toNumChapter.bind(utils),
    t2s: utils.t2s.bind(utils),
    encodeURI: utils.encodeURI.bind(utils),
    decodeURI: utils.decodeURI.bind(utils),
    escape: utils.escape.bind(utils),
    unescape: utils.unescape.bind(utils),
    log: utils.log.bind(utils),
    importScript: utils.importScript.bind(utils),
    random: utils.random.bind(utils),

    // ===== 缓存文件（Legado 兼容） =====
    cacheFile: async (url: string, saveTime?: number): Promise<string | null> => {
      const key = `cache_${cryptoApi.md5Encode(url)}`;
      const cached = store.get(key);
      if (cached && typeof cached === 'string') {
        return cached;
      }
      try {
        const result = await network.ajax(url);
        if (result && typeof result === 'string') {
          store.put(key, result);
          return result;
        }
        return null;
      } catch {
        return null;
      }
    },

    // ===== 获取 Cookie =====
    getCookie: async (tag: string, key?: string): Promise<string> => {
      const jar = httpClient.getCookieJar();
      try {
        const cookies = await jar.getCookies(tag);
        const cookieStr = cookies.map(c => c.toString()).join('; ');
        if (key) {
          const cookieMap: Record<string, string> = {};
          for (const c of cookies) {
            cookieMap[c.key] = c.value;
          }
          return cookieMap[key] || '';
        }
        return cookieStr;
      } catch {
        return '';
      }
    },

    androidId: (): string => {
      return 'abyss-reader-android-id';
    },
  };
}
