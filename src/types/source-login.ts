// ============================================
// 书源登录类型
// ============================================

/**
 * loginUi 里的单个控件定义。
 * 对齐 Legado 的 RowUi。
 */
export interface SourceLoginRowUi {
  /** 控件名（同时是 formData 的键） */
  name: string
  /** 控件类型 */
  type: 'text' | 'password' | 'button' | 'toggle' | 'select'
  /** 按钮/开关显示的文本。以单引号包裹时当字符串常量，否则当 JS 表达式 */
  viewName?: string | null
  /** 点击时执行的 JS（button/toggle） */
  action?: string | null
  /** toggle 的选项列表 */
  chars?: string[] | null
  /** 默认值 */
  default?: string | null
  /** 布局样式 */
  style?: {
    layout_flexGrow?: number
    layout_flexShrink?: number
    layout_alignSelf?: string
    layout_flexBasisPercent?: number
    layout_wrapBefore?: boolean
    layout_justifySelf?: string
  } | null
}

/**
 * 打开登录对话框时需要的上下文。
 */
export interface SourceLoginContext {
  /** 书源（含 bookSourceUrl / loginUrl / loginUi / loginCheckJs 等） */
  source: Record<string, unknown>
  /** 当前书籍（可为空） */
  book?: Record<string, unknown> | null
  /** 当前章节（可为空） */
  chapter?: Record<string, unknown> | null
}

/**
 * loginUi 解析结果。
 */
export interface ParsedLoginUi {
  rows: SourceLoginRowUi[]
  /** 初始表单值（每个 name 对应一个字符串值） */
  formData: Record<string, string>
}

/**
 * execute_login_js 的返回。
 */
export interface LoginJsResult {
  success: boolean
  result: string
  error?: string
}
