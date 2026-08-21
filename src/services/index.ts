// ============================================
// 服务层统一导出 + 依赖注入
// ============================================

import { getGlobalHttpClient } from '@engine/network/client.js'
import { tauriHttpAdapter } from './http-adapter.js'
import { logInfo, logError, setLogBridge, initLogBridge as engineInitLogBridge } from '@engine/log/index.js'
import { setLoginExecutor } from '@engine/login/index.js'
import { setWebJsExecutor } from '@engine/parser/index.js'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { initDomProvider } from './dom-provider.js'
import type { LoginExecutor, LoginResult } from '@engine/login/index.js'

const WEBJS_TIMEOUT_SECS = 10

// ─── 注入 DomProvider ───
initDomProvider()

// ─── 注入 Tauri 适配器 ───
getGlobalHttpClient().setAdapter(tauriHttpAdapter)

// ─── 注入 WebJsExecutor ───
setWebJsExecutor(async (_html, jsCode, baseUrl) => {
  try {
    const result: string = await invoke('fetch_url', {
      url: baseUrl || 'about:blank',
      method: 'GET',
      body: null,
      headers: {},
      charset: null,
      useWebview: true,
      webJs: jsCode,
      timeoutSecs: WEBJS_TIMEOUT_SECS,
      sourceType: 0,
      preserveStyle: false,
    })
    return result
  } catch {
    return ''
  }
})

// ─── 注入 HTTP 日志拦截器 ───
const http = getGlobalHttpClient()
const interceptor = http.getInterceptor()
interceptor.useRequest((config) => {
  logInfo('network', 'frontend', `→ ${config.method || 'GET'} ${config.url}`)
  return config
})
interceptor.useResponse((response) => {
  const dataLen = typeof response.data === 'string' ? response.data.length : 0
  logInfo('network', 'frontend', `← ${response.status} ${response.url} (${response.duration}ms, ${dataLen}B)`)
  return response
})
interceptor.useError((error) => {
  const msg = error instanceof Error ? error.message : String(error)
  logError('network', 'frontend', `✗ ${msg}`)
  throw error
})

// ─── 日志桥接（幂等初始化） ───
let logBridgeInitialized = false
let logUnlisten: UnlistenFn | null = null

setLogBridge({
  async init(): Promise<void> {
    if (logBridgeInitialized) return
    logBridgeInitialized = true
    try {
      logUnlisten = await listen('global-log', async (event: unknown) => {
        const payload = (event as { payload: { level: string; module: string; source: string; message: string; tag?: string } }).payload
        const { emitLog } = await import('@engine/log/index.js')
        emitLog(
          (payload.level || 'info') as Parameters<typeof emitLog>[0],
          (payload.module || 'unknown') as Parameters<typeof emitLog>[1],
          (payload.source || 'rust') as Parameters<typeof emitLog>[2],
          payload.message || '',
          payload.tag,
        )
      })
    } catch {
      // ignore
    }
  },
})

engineInitLogBridge().catch(() => {})

// ─── 注入登录执行器 ───
const loginExecutor: LoginExecutor = {
  async executeLogin(source: unknown): Promise<LoginResult> {
    try {
      const src = source as Record<string, unknown>
      const loginUrl = typeof src.loginUrl === 'string' ? src.loginUrl : ''
      if (!loginUrl) {
        return { success: false, error: '书源未配置 loginUrl' }
      }
      const code = loginUrl
        .trimStart()
        .replace(/^@js:\s*/, '')
        .replace(/^<js>/, '')
        .replace(/<\/js>$/, '')
        .trim()
      const context = {
        source,
        result: '',
        baseUrl: typeof src.bookSourceUrl === 'string' ? src.bookSourceUrl : '',
      }
      const response = await invoke('execute_js_rule', {
        code,
        context,
        timeoutMs: 30000,
      })
      const resp = response as Record<string, unknown>
      if (resp.success === true) {
        return { success: true }
      }
      return { success: false, error: typeof resp.error === 'string' ? resp.error : '未知错误' }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  },

  async checkLoginStatus(source: unknown): Promise<boolean> {
    try {
      const src = source as Record<string, unknown>
      const checkJs = typeof src.loginCheckJs === 'string' ? src.loginCheckJs : ''
      if (!checkJs) return false
      const code = checkJs
        .replace(/^@js:\s*/, '')
        .replace(/^<js>/, '')
        .replace(/<\/js>$/, '')
        .trim()
      const context = {
        source,
        result: '',
        baseUrl: typeof src.bookSourceUrl === 'string' ? src.bookSourceUrl : '',
      }
      const response = await invoke('execute_js_rule', {
        code,
        context,
        timeoutMs: 10000,
      })
      const resp = response as Record<string, unknown>
      return resp.success === true && resp.result === 'true'
    } catch {
      return false
    }
  },
}

setLoginExecutor(loginExecutor)

// ─── 导出服务 ───
export { store } from './store.js'
export { network, loginWebview } from './network.js'
export { source } from './source.js'
export { reader } from './reader.js'
export { engine } from './engine.js'
export { rss } from './rss.js'
export { getContent } from './content.js'
export {
  cache,
  getPreloadedContent,
  setPreloadedContent,
  clearPreloadedContents,
  getRawContent,
  setRawContent,
  hasPreloadedContent,
  getCachedContent,
  setCachedContent,
} from './cache.js'
export { loadSingleImage, loadComicImages, prefetchComicImages } from './comic.js'
export {
  DEFAULT_WEBDAV_CONFIG,
  encryptConfig,
  decryptConfig,
  getDeviceName,
  webdavRequest,
  listBackups,
  getLatestBackup,
  restoreBackup,
  fullSync,
} from './webdav.js'
export { search, batchSearch } from './search.js'

// ─── 清理函数 ───
export function cleanupServices(): void {
  if (logUnlisten) {
    logUnlisten()
    logUnlisten = null
  }
  logBridgeInitialized = false
}
