// ============================================
// 登录 — 纯接口定义，由 services/ 层注入实现
// ============================================

import type { EngineBookSource } from '../types.js'

export interface LoginConfig {
  loginUrl: string
  loginUi?: string
  loginCheckJs?: string
  sourceKey: string
}

export interface LoginResult {
  success: boolean
  cookies?: Record<string, string>
  error?: string
}

export interface LoginExecutor {
  executeLogin(source: EngineBookSource): Promise<LoginResult>
  checkLoginStatus(source: EngineBookSource): Promise<boolean>
}

let loginExecutor: LoginExecutor | null = null

export function setLoginExecutor(executor: LoginExecutor): void {
  loginExecutor = executor
}

export function getLoginExecutor(): LoginExecutor | null {
  return loginExecutor
}

export async function executeLoginJs(source: EngineBookSource): Promise<LoginResult> {
  if (!loginExecutor) {
    return { success: false, error: '登录执行器未注入' }
  }
  return loginExecutor.executeLogin(source)
}

export async function checkLoginStatus(source: EngineBookSource): Promise<boolean> {
  if (!loginExecutor) {
    return false
  }
  return loginExecutor.checkLoginStatus(source)
}
