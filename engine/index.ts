// ============================================
// 引擎统一导出
// ============================================

export {
  AnalyzeRule,
  RuleAnalyzer,
  SourceRule,
  AnalyzeByCSS,
  AnalyzeByXPath,
  AnalyzeByJSONPath,
  setJsRuntime,
  getJsRuntime,
  clearJsCache,
  getElements,
  getString,
  getStringList,
  createAnalyzer,
  normalizeCssSelector,
  elementsSingle,
  getResultLast,
  getResultList,
  getElementsRecursive,
} from './parser/index.js'

export { analyzeUrl, resolveUrl, buildUrl } from './url/index.js'

export { getGlobalHttpClient, resetGlobalHttpClient, setGlobalHttpClient, HttpClient } from './network/client.js'

export {
  md5, md5Short, sha1, sha256, sha512,
  hmacSha256, hmacHex, digestHex,
  base64Encode, base64Decode, base64DecodeToBytes,
  aesEncrypt, aesDecrypt, aesBase64DecodeToString,
  desEncrypt, desDecrypt, desEncodeToBase64String,
  hexEncode, hexDecode,
  setRsaProvider, rsaEncrypt, rsaDecrypt,
  randomUUID, strToBytes, bytesToStr,
} from './crypto/index.js'

export type { RsaProvider } from './crypto/index.js'

export {
  emitLog, onLog, offLog, logDebug, logInfo, logWarn, logError, initLogBridge,
  recordDiagnostic, getDiagnostics, clearDiagnostics,
} from './log/index.js'

export type { LogEntry, LogLevel, LogModule, LogSource, LogFilter, DiagnosticSnapshot } from './log/index.js'

export {
  putContext, getContext, clearContext,
  putChapterVariable, getChapterVariable,
  putBookVariable, getBookVariable,
} from './context/store.js'

export { executeLoginJs, checkLoginStatus } from './login/index.js'
export type { LoginConfig, LoginResult } from './login/index.js'

export { backup, restore } from './sync/index.js'
export type { SyncConfig, SyncResult } from './sync/index.js'

export { getCachedRegex, clearRegexCache } from './utils/regex-cache.js'
export { cachedStringify, clearJsonCache } from './utils/json-cache.js'

export type {
  ParseContext, RuleMode, SourceRule as EngineSourceRule,
  UrlAnalysis, RequestConfig, ResponseData, JsRuntime, DomParser, DomNode, JsonPathQuery,
} from './types.js'
