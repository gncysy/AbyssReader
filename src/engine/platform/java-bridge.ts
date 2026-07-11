import { network } from "./modules/network.js";
import { crypto } from "./modules/crypto.js";
import { dom } from "./modules/dom.js";
import { storage } from "./modules/storage.js";
import { ui } from "./modules/ui.js";
import { webview } from "./modules/webview.js";
import { context } from "./modules/context.js";
import { utils } from "./modules/utils.js";

export function buildJavaAPI(): any {
  return {
    // 网络与Cookie
    ajax: network.ajax,
    post: network.post,
    get: network.httpGet,  // 使用 httpGet 避免与 context.get 冲突
    connect: network.connect,
    getStrResponse: network.getStrResponse,
    getByteResponse: network.getByteResponse,
    cookie: network.cookie,

    // 加密与编码
    base64Encode: crypto.base64Encode,
    base64Decode: crypto.base64Decode,
    base64DecodeToByteArray: crypto.base64DecodeToByteArray,
    getByteArray: crypto.getByteArray,
    hexDecodeToString: crypto.hexDecodeToString,
    hexEncode: crypto.hexEncode,
    md5Encode: crypto.md5Encode,
    digestHex: crypto.digestHex,
    HMacHex: crypto.HMacHex,
    aesBase64DecodeToString: crypto.aesBase64DecodeToString,
    desEncodeToBase64String: crypto.desEncodeToBase64String,
    createSymmetricCrypto: crypto.createSymmetricCrypto,
    createAsymmetricCrypto: crypto.createAsymmetricCrypto,
    randomUUID: crypto.randomUUID,

    // DOM解析
    getElements: dom.getElements,
    getString: dom.getString,
    getStringList: dom.getStringList,
    getElement: dom.getElement,
    setContent: dom.setContent,

    // 存储
    getVariable: storage.getVariable,
    setVariable: storage.setVariable,
    getLoginInfoMap: storage.getLoginInfoMap,
    putLoginHeader: storage.putLoginHeader,
    getLoginHeader: storage.getLoginHeader,

    // 上下文
    put: context.put,
    clear: context.clear,

    // UI
    toast: ui.toast,
    longToast: ui.longToast,
    startBrowserAwait: ui.startBrowserAwait,

    // WebView
    webView: webview.webView,
    initUrl: webview.initUrl,
    refreshBookUrl: webview.refreshBookUrl,

    // 工具
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
  };
}



