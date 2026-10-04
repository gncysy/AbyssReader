// ============================================
// 窗口管理服务 — 封装 Tauri window API
// ============================================

import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

interface RssDownloadPayload {
  url: string
  fileName: string
  fileSize: number
  resourceType: string
  count: number
  savedPath: string | null
  error?: boolean
  message?: string
}

interface VerificationRequestPayload {
  svg?: string
}

interface ShowPhotoPayload {
  src?: string
}

interface JsSearchBookPayload {
  keyword?: string
  source?: string
}

interface JavaToastPayload {
  message: string
  isLong: boolean
}

interface LoginDataUpdatePayload {
  info: string
}

interface ReLoginViewPayload {
  deltaUp: boolean
}

export const windowApi = {
  minimize: async (): Promise<void> => {
    await getCurrentWindow().minimize()
  },

  maximize: async (): Promise<void> => {
    await getCurrentWindow().maximize()
  },

  unmaximize: async (): Promise<void> => {
    await getCurrentWindow().unmaximize()
  },

  isMaximized: async (): Promise<boolean> => {
    return getCurrentWindow().isMaximized()
  },

  toggleMaximize: async (): Promise<boolean> => {
    const win = getCurrentWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
      return false
    }
    await win.maximize()
    return true
  },

  close: async (): Promise<void> => {
    await getCurrentWindow().close()
  },

  cleanupWebviews: (): Promise<void> => invoke('cleanup_webviews'),

  listenRssDownload: async (handler: (payload: RssDownloadPayload) => void): Promise<UnlistenFn> => {
    return listen('rss-download', (event: unknown) => {
      const payload = (event as { payload: RssDownloadPayload }).payload
      handler(payload)
    })
  },

  // ─── 验证码 ───

  listenVerificationCodeRequest: async (handler: (svg: string) => void): Promise<UnlistenFn> => {
    return listen('verification-code-request', (event: unknown) => {
      const payload = (event as { payload: string | VerificationRequestPayload }).payload
      const svg = typeof payload === 'string' ? payload : (payload?.svg || '')
      handler(svg)
    })
  },

  submitVerificationCode: (code: string): Promise<string> => {
    return invoke('submit_verification_code', { code })
  },

  cancelVerificationCode: (): Promise<string> => {
    return invoke('cancel_verification_code')
  },

  // ─── show-photo ───

  listenShowPhoto: async (handler: (src: string) => void): Promise<UnlistenFn> => {
    return listen('show-photo', (event: unknown) => {
      const payload = (event as { payload: string | ShowPhotoPayload }).payload
      const src = typeof payload === 'string' ? payload : (payload?.src || '')
      handler(src)
    })
  },

  // ─── refresh-explore / refresh-book-info ───

  listenRefreshExplore: async (handler: () => void): Promise<UnlistenFn> => {
    return listen('refresh-explore', () => {
      handler()
    })
  },

  listenRefreshBookInfo: async (handler: () => void): Promise<UnlistenFn> => {
    return listen('refresh-book-info', () => {
      handler()
    })
  },

  // ─── js-search-book ───

  listenJsSearchBook: async (handler: (payload: { keyword: string; source: string }) => void): Promise<UnlistenFn> => {
    return listen('js-search-book', (event: unknown) => {
      const payload = (event as { payload: JsSearchBookPayload }).payload || {}
      handler({
        keyword: payload.keyword || '',
        source: payload.source || '',
      })
    })
  },

  // ─── java-toast（书源 JS 调用 java.toast / java.longToast）───

  listenJavaToast: async (handler: (payload: JavaToastPayload) => void): Promise<UnlistenFn> => {
    return listen('java-toast', (event: unknown) => {
      const payload = (event as { payload: JavaToastPayload }).payload
      handler(payload)
    })
  },

  // ─── login-data-update（书源 JS 调用 java.upLoginData）───

  listenLoginDataUpdate: async (handler: (info: string) => void): Promise<UnlistenFn> => {
    return listen('login-data-update', (event: unknown) => {
      const payload = (event as { payload: LoginDataUpdatePayload }).payload
      handler(payload?.info || '')
    })
  },

  // ─── re-login-view（书源 JS 调用 java.reLoginView）───

  listenReLoginView: async (handler: (deltaUp: boolean) => void): Promise<UnlistenFn> => {
    return listen('re-login-view', (event: unknown) => {
      const payload = (event as { payload: ReLoginViewPayload }).payload
      handler(!!payload?.deltaUp)
    })
  },
}
