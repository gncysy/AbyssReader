/**
 * AndroidApi - 纯包装层
 * 所有功能实现在 modules/ 中，这里只做组装
 */

import { network } from './modules/network.js';
import { cryptoApi } from './modules/crypto.js';
import { dom } from './modules/dom.js';
import { storage } from './modules/storage.js';
import { ui } from './modules/ui.js';
import { webview } from './modules/webview.js';
import { context } from './modules/context.js';
import { utils } from './modules/utils.js';
import { getGlobalStore } from '../context/store.js';

export class AndroidApi {
  private store = getGlobalStore();

  // ============================================================
  // network
  // ============================================================
  ajax = network.ajax.bind(network);
  post = network.post.bind(network);
  httpGet = network.httpGet.bind(network);
  connect = network.connect.bind(network);
  ajaxAll = network.ajaxAll.bind(network);
  getStrResponse = network.getStrResponse.bind(network);
  getByteResponse = network.getByteResponse.bind(network);
  cookie = network.cookie;

  // ============================================================
  // crypto
  // ============================================================
  base64Encode = cryptoApi.base64Encode.bind(cryptoApi);
  base64Decode = cryptoApi.base64Decode.bind(cryptoApi);
  base64DecodeToByteArray = cryptoApi.base64DecodeToByteArray.bind(cryptoApi);
  getByteArray = cryptoApi.getByteArray.bind(cryptoApi);
  hexDecodeToString = cryptoApi.hexDecodeToString.bind(cryptoApi);
  hexEncode = cryptoApi.hexEncode.bind(cryptoApi);
  md5Encode = cryptoApi.md5Encode.bind(cryptoApi);
  digestHex = cryptoApi.digestHex.bind(cryptoApi);
  HMacHex = cryptoApi.HMacHex.bind(cryptoApi);
  aesBase64DecodeToString = cryptoApi.aesBase64DecodeToString.bind(cryptoApi);
  desEncodeToBase64String = cryptoApi.desEncodeToBase64String.bind(cryptoApi);
  createSymmetricCrypto = cryptoApi.createSymmetricCrypto.bind(cryptoApi);
  createAsymmetricCrypto = cryptoApi.createAsymmetricCrypto.bind(cryptoApi);
  randomUUID = cryptoApi.randomUUID.bind(cryptoApi);

  // ============================================================
  // dom
  // ============================================================
  getElements = dom.getElements.bind(dom);
  getString = dom.getString.bind(dom);
  getStringList = dom.getStringList.bind(dom);
  getElement = dom.getElement.bind(dom);
  setContent = dom.setContent.bind(dom);
  getContent = dom.getContent.bind(dom);
  getContentBaseUrl = dom.getContentBaseUrl.bind(dom);
  clearContentCache = dom.clearContentCache.bind(dom);

  // ============================================================
  // storage
  // ============================================================
  getVariable = storage.getVariable.bind(storage);
  setVariable = storage.setVariable.bind(storage);
  getLoginInfoMap = storage.getLoginInfoMap.bind(storage);
  putLoginHeader = storage.putLoginHeader.bind(storage);
  getLoginHeader = storage.getLoginHeader.bind(storage);
  // Legado 兼容
  putBookVariable = storage.putBookVariable.bind(storage);
  getBookVariable = storage.getBookVariable.bind(storage);
  putChapterVariable = storage.putChapterVariable.bind(storage);
  getChapterVariable = storage.getChapterVariable.bind(storage);
  setReverseToc = storage.setReverseToc.bind(storage);
  getReverseToc = storage.getReverseToc.bind(storage);

  // ============================================================
  // ui
  // ============================================================
  toast = ui.toast.bind(ui);
  longToast = ui.longToast.bind(ui);
  startBrowserAwait = ui.startBrowserAwait.bind(ui);

  // ============================================================
  // webview
  // ============================================================
  webView = webview.webView.bind(webview);
  initUrl = webview.initUrl.bind(webview);
  refreshBookUrl = webview.refreshBookUrl.bind(webview);

  // ============================================================
  // context
  // ============================================================
  put = context.put.bind(context);
  get = context.get.bind(context);
  clear = context.clear.bind(context);

  // ============================================================
  // utils
  // ============================================================
  timeFormat = utils.timeFormat.bind(utils);
  timeFormatUTC = utils.timeFormatUTC.bind(utils);
  toNumChapter = utils.toNumChapter.bind(utils);
  t2s = utils.t2s.bind(utils);
  encodeURI = utils.encodeURI.bind(utils);
  decodeURI = utils.decodeURI.bind(utils);
  escape = utils.escape.bind(utils);
  unescape = utils.unescape.bind(utils);
  log = utils.log.bind(utils);
  importScript = utils.importScript.bind(utils);
  random = utils.random.bind(utils);
}

// ============================================================
// 单例
// ============================================================

let instance: AndroidApi | null = null;

export function getGlobalAndroidApi(): AndroidApi {
  if (!instance) instance = new AndroidApi();
  return instance;
}

export function resetGlobalAndroidApi(): void {
  instance = null;
}

export function createAndroidApi(): AndroidApi {
  return new AndroidApi();
}
