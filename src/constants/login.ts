// ============================================
// 登录相关常量
// ============================================

export const LOGIN = {
  /** 执行 loginUrl + action 的默认超时（毫秒） */
  DEFAULT_TIMEOUT_MS: 60000,
  /** loginCheckJs 检测超时（毫秒） */
  CHECK_TIMEOUT_MS: 10000,
  /** WebView 登录默认超时（秒） */
  WEBVIEW_TIMEOUT_SECS: 300,
  /** 打开 dialog 时自动执行 loginCheckJs 的延迟（毫秒），等 JS 沙箱就绪 */
  AUTO_CHECK_DELAY_MS: 100,
} as const

/** loginUi 支持的控件类型 */
export const LOGIN_UI_TYPES = {
  TEXT: 'text',
  PASSWORD: 'password',
  BUTTON: 'button',
  TOGGLE: 'toggle',
  SELECT: 'select',
} as const
