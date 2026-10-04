// ============================================
// Chapter 类型
// ============================================

export interface Chapter {
  id: number
  title: string
  url: string
  index: number
  isVip?: boolean
  isPay?: boolean
  content?: string | null
  /** 延迟 JS 求解的章节 URL 规则（部分书源章节 URL 需要额外 JS 解密） */
  _deferredJs?: string
  /** 延迟 JS 求解的原始结果 */
  _deferredResult?: unknown
  updateTime?: string
  wordCount?: string
}
