import { network } from './modules/network.js';
import { cryptoApi } from './modules/crypto.js';
import { dom } from './modules/dom.js';
import { storage } from './modules/storage.js';
import { ui } from './modules/ui.js';
import { context } from './modules/context.js';
import { utils } from './modules/utils.js';
import { webview } from './modules/webview.js';
import { getGlobalHttpClient } from '../network/client.js';
import { getGlobalStore } from '../context/store.js';
import { getContext, putContext } from '../context/shared.js';
import { https, http } from 'atomics-http';

let _sourceKey = 'default';

export function setSourceKey(key: string): void {
  _sourceKey = key;
}

function syncGet(urlStr: string): string {
  try {
    const mod = urlStr.startsWith('https') ? https : http;
    const req = mod.request(urlStr);
    req.setTimeout(10000);
    const res = req.end();
    const body = res.body;
    if (Buffer.isBuffer(body)) return body.toString('utf-8');
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  } catch {
    return '';
  }
}

export function buildJavaAPI(): any {
  const store = getGlobalStore();

  const api: Record<string, any> = {
    ajax: (url: any): string | null => {
      const urlStr = Array.isArray(url) ? String(url[0]) : String(url);
      return syncGet(urlStr);
    },
    ajaxAll: (urlList: string[]): string[] => {
      return urlList.map(url => syncGet(url));
    },
    connect: (urlStr: string): any => {
      const body = syncGet(urlStr);
      return { body, url: urlStr, headers: {}, statusCode: () => 200 };
    },
    webView: async (html: string | null, url: string | null, js: string | null): Promise<string | null> => {
      try {
        const targetUrl = url || 'about:blank';
        return await webview.webView({}, targetUrl, js || undefined);
      } catch { return null; }
    },
    cookie: network.cookie,
    getCookie: async (tag: string, key?: string): Promise<string> => {
      try {
        if (key) return await network.cookie.getCookieValue(tag, key);
        return await network.cookie.getCookie(tag);
      } catch { return ''; }
    },
    base64Encode: cryptoApi.base64Encode.bind(cryptoApi),
    base64Decode: cryptoApi.base64Decode.bind(cryptoApi),
    base64DecodeToByteArray: cryptoApi.base64DecodeToByteArray.bind(cryptoApi),
    getByteArray: cryptoApi.getByteArray.bind(cryptoApi),
    hexDecodeToString: cryptoApi.hexDecodeToString.bind(cryptoApi),
    hexDecodeToByteArray: (hex: string): Uint8Array | null => {
      try {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
      } catch { return null; }
    },
    hexEncode: cryptoApi.hexEncode.bind(cryptoApi),
    hexEncodeToString: cryptoApi.hexEncode.bind(cryptoApi),
    md5Encode: cryptoApi.md5Encode.bind(cryptoApi),
    md5Encode16: (str: string): string => cryptoApi.md5Encode(str).substring(8, 24),
    digestHex: cryptoApi.digestHex.bind(cryptoApi),
    HMacHex: cryptoApi.HMacHex.bind(cryptoApi),
    aesBase64DecodeToString: cryptoApi.aesBase64DecodeToString.bind(cryptoApi),
    desEncodeToBase64String: cryptoApi.desEncodeToBase64String.bind(cryptoApi),
    createSymmetricCrypto: cryptoApi.createSymmetricCrypto.bind(cryptoApi),
    createAsymmetricCrypto: cryptoApi.createAsymmetricCrypto.bind(cryptoApi),
    randomUUID: cryptoApi.randomUUID.bind(cryptoApi),
    strToBytes: (str: string): Uint8Array => new TextEncoder().encode(str),
    bytesToStr: (bytes: Uint8Array, charset?: string): string => {
      try { return new TextDecoder(charset || 'utf-8').decode(bytes); }
      catch { return new TextDecoder().decode(bytes); }
    },
    getElements: dom.getElements.bind(dom),
    getString: dom.getString.bind(dom),
    getStringList: dom.getStringList.bind(dom),
    getElement: dom.getElement.bind(dom),
    setContent: dom.setContent.bind(dom),
    getContent: dom.getContent.bind(dom),
    getContentBaseUrl: dom.getContentBaseUrl.bind(dom),
    clearContentCache: dom.clearContentCache.bind(dom),
    put: (key: string, value: string): string => {
      putContext(_sourceKey, key, value);
      return value;
    },
    get: (key: string): string => {
      const val = getContext(_sourceKey, key);
      return val !== undefined && val !== null ? String(val) : '';
    },
    putBookVariable: storage.putBookVariable.bind(storage),
    getBookVariable: storage.getBookVariable.bind(storage),
    putChapterVariable: storage.putChapterVariable.bind(storage),
    getChapterVariable: storage.getChapterVariable.bind(storage),
    setReverseToc: storage.setReverseToc.bind(storage),
    getReverseToc: storage.getReverseToc.bind(storage),
    getLoginInfoMap: storage.getLoginInfoMap.bind(storage),
    putLoginHeader: storage.putLoginHeader.bind(storage),
    getLoginHeader: storage.getLoginHeader.bind(storage),
    cacheFile: async (url: string, _saveTime?: number): Promise<string> => {
      const key = `cache_${cryptoApi.md5Encode(url).substring(8, 24)}`;
      const cached = store.get(key);
      if (cached && typeof cached === 'string') return cached;
      try {
        const data = await network.ajax(url);
        const text = typeof data?.data === 'string' ? data.data : JSON.stringify(data?.data || data);
        store.put(key, text);
        return text;
      } catch { return ''; }
    },
    importScript: async (path: string): Promise<string> => {
      if (path.startsWith('http')) return api.cacheFile(path);
      return utils.importScript(path);
    },
    readTxtFile: async (path: string, charsetName?: string): Promise<string> => {
      try {
        const fs = await import('node:fs');
        const filePath = path.startsWith('/') ? path : `./cache/${path}`;
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, { encoding: (charsetName || 'utf-8') as BufferEncoding });
      } catch { return ''; }
    },
    deleteFile: async (path: string): Promise<boolean> => {
      try {
        const fs = await import('node:fs');
        const filePath = path.startsWith('/') ? path : `./cache/${path}`;
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
        return false;
      } catch { return false; }
    },
    toast: ui.toast.bind(ui),
    longToast: ui.longToast.bind(ui),
    startBrowserAwait: ui.startBrowserAwait.bind(ui),
    timeFormat: utils.timeFormat.bind(utils),
    timeFormatUTC: utils.timeFormatUTC.bind(utils),
    toNumChapter: (s: string): string => String(utils.toNumChapter(s)),
    t2s: utils.t2s.bind(utils),
    s2t: (str: string): string => str,
    encodeURI: utils.encodeURI.bind(utils),
    decodeURI: utils.decodeURI.bind(utils),
    escape: utils.escape.bind(utils),
    unescape: utils.unescape.bind(utils),
    htmlFormat: (str: string): string => str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    replaceFont: (text: string): string => text,
    queryTTF: async (): Promise<null> => null,
    toURL: (urlStr: string, baseUrl?: string): any => {
      try {
        const fullUrl = baseUrl ? new URL(urlStr, baseUrl).href : urlStr;
        const parsed = new URL(fullUrl);
        return {
          url: fullUrl, href: fullUrl,
          protocol: parsed.protocol, host: parsed.host, hostname: parsed.hostname,
          port: parsed.port, pathname: parsed.pathname, search: parsed.search,
          hash: parsed.hash, origin: parsed.origin,
          toString: () => fullUrl,
        };
      } catch { return { url: urlStr, toString: () => urlStr }; }
    },
    log: (msg: any): any => { console.log('[java-api]', msg); return msg; },
    logType: (v: any): void => {
      if (v === null) console.log('[java-api] type: null');
      else if (v === undefined) console.log('[java-api] type: undefined');
      else console.log('[java-api] type:', typeof v, Array.isArray(v) ? '(array)' : '');
    },
    androidId: (): string => 'abyss-reader-android-id',
    getWebViewUA: (): string => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    random: (min?: number, max?: number): number => {
      if (min === undefined) return Math.random();
      if (max === undefined) { max = min; min = 0; }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
  };

  return api;
}

export function buildJavaAPIForSource(sourceId: string): any {
  _sourceKey = sourceId;
  return buildJavaAPI();
}
