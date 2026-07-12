import { network } from "./modules/network.js";
import * as cryptoModule from "./modules/crypto.js";
import { dom } from "./modules/dom.js";
import { storage } from "./modules/storage.js";
import { ui } from "./modules/ui.js";
import { webview } from "./modules/webview.js";
import { context } from "./modules/context.js";
import { utils } from "./modules/utils.js";

// 构建完整的 java API 对象（兼容 Legado/阅读3 JS 书源）
export function buildJavaAPI(): any {
  // 创建基础对象
  const java = {
    // ===== 网络与Cookie =====
    ajax: network.ajax,
    ajaxAll: async (urls: string[]) => {
      const results = [];
      for (const url of urls) {
        try {
          const result = await network.ajax(url);
          results.push(result);
        } catch {
          results.push(null);
        }
      }
      return results;
    },
    post: network.post,
    get: network.httpGet,
    connect: network.connect,
    getStrResponse: network.getStrResponse,
    getByteResponse: network.getByteResponse,
    cookie: network.cookie,

    // ===== 加密与编码 =====
    base64Encode: cryptoModule.base64Encode,
    base64Decode: cryptoModule.base64Decode,
    base64DecodeToByteArray: cryptoModule.base64DecodeToByteArray,
    getByteArray: cryptoModule.getByteArray,
    hexDecodeToString: cryptoModule.hexDecodeToString,
    hexEncode: cryptoModule.hexEncode,
    md5Encode: cryptoModule.md5Encode,
    md5Encode16: (str: string) => cryptoModule.md5Encode(str).substring(8, 24),
    digestHex: cryptoModule.digestHex,
    HMacHex: cryptoModule.HMacHex,
    aesBase64DecodeToString: cryptoModule.aesBase64DecodeToString,
    desEncodeToBase64String: cryptoModule.desEncodeToBase64String,
    createSymmetricCrypto: cryptoModule.createSymmetricCrypto,
    createAsymmetricCrypto: cryptoModule.createAsymmetricCrypto,
    randomUUID: cryptoModule.randomUUID,

    // ===== DOM解析 =====
    getElements: dom.getElements,
    getString: dom.getString,
    getStringList: dom.getStringList,
    getElement: dom.getElement,
    setContent: dom.setContent,

    // ===== 存储 =====
    getVariable: storage.getVariable,
    setVariable: storage.setVariable,
    getLoginInfoMap: storage.getLoginInfoMap,
    putLoginHeader: storage.putLoginHeader,
    getLoginHeader: storage.getLoginHeader,

    // ===== 上下文 =====
    put: context.put,
    clear: context.clear,

    // ===== UI =====
    toast: ui.toast,
    longToast: ui.longToast,
    startBrowserAwait: ui.startBrowserAwait,

    // ===== WebView =====
    webView: webview.webView,
    initUrl: webview.initUrl,
    refreshBookUrl: webview.refreshBookUrl,

    // ===== 工具 =====
    timeFormat: utils.timeFormat,
    timeFormatUTC: utils.timeFormatUTC,
    toNumChapter: utils.toNumChapter,
    t2s: utils.t2s,
    encodeURI: utils.encodeURI,
    decodeURI: utils.decodeURI,
    escape: utils.escape,
    unescape: utils.unescape,
    log: utils.log,
    importScript: utils.importScript,
    random: utils.random,

    // ===== 缓存 =====
    cacheFile: async (url: string, saveTime: number = 0): Promise<string | null> => {
      try {
        const response = await network.ajax(url);
        if (response && typeof response === 'string') {
          return response;
        }
        return null;
      } catch {
        return null;
      }
    },

    // ===== 文件操作 =====
    readFile: async (path: string): Promise<string> => {
      try {
        const fs = await import('fs/promises');
        return await fs.readFile(path, 'utf-8');
      } catch {
        return '';
      }
    },

    readTxtFile: async (path: string, charset: string = 'utf-8'): Promise<string> => {
      try {
        const fs = await import('fs/promises');
        const buffer = await fs.readFile(path);
        if (charset.toLowerCase() === 'utf-8') {
          return buffer.toString('utf-8');
        }
        try {
          const iconv = await import('iconv-lite');
          return iconv.decode(buffer, charset);
        } catch {
          return buffer.toString('utf-8');
        }
      } catch {
        return '';
      }
    },

    deleteFile: async (path: string): Promise<void> => {
      try {
        const fs = await import('fs/promises');
        await fs.unlink(path);
      } catch {}
    },

    // ===== 其他工具 =====
    htmlFormat: (str: string): string => {
      if (!str) return '';
      return str.replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },
  };

  // ===== org 命名空间（兼容 JS 书源） =====
  const orgHandler = {
    get: function(target: any, prop: string) {
      if (prop === 'jsoup') {
        return {
          connect: function(url: string) {
            return {
              get: function() {
                return network.ajax(url, { method: 'GET' });
              },
              post: function() {
                return network.ajax(url, { method: 'POST' });
              }
            };
          }
        };
      }
      return new Proxy({}, orgHandler);
    }
  };

  // ===== java 对象 Proxy =====
  const javaProxy = new Proxy(java, {
    get: function(target: any, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      if (prop === 'org') {
        return new Proxy({}, orgHandler);
      }
      return function() {
        console.warn('[JavaBridge] 调用了未实现的 java.' + prop);
        return null;
      };
    }
  });

  return javaProxy;
}
