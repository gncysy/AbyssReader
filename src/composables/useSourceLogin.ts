// ============================================
// useSourceLogin — 书源登录入口组合式函数
// ============================================
//
// 全局单例：同一个 SourceLoginDialog 实例
// 从任何地方（BookDetail / sources 列表）调用 openLogin

import { ref } from 'vue'
import type { BookSource } from '@/types'

/**
 * 全局对话框实例引用（由 App.vue 或某个根组件注册）。
 */
const loginDialogRef = ref<{ open: (s: BookSource, b?: Record<string, unknown> | null, c?: Record<string, unknown> | null) => Promise<void> } | null>(null)

export function registerLoginDialog(ref: typeof loginDialogRef): void {
  loginDialogRef.value = ref.value
}

export function useSourceLogin() {
  function openLogin(
    source: BookSource,
    book?: Record<string, unknown> | null,
    chapter?: Record<string, unknown> | null,
  ): Promise<void> {
    const dlg = loginDialogRef.value
    if (!dlg) {
      // 没注册 dialog 时降级
      return Promise.resolve()
    }
    return dlg.open(source, book || null, chapter || null)
  }

  return { openLogin }
}
