// ============================================
// 阅读位置换算
//
// readingProgress.chapterPos 以 0~10000 的整数保存章节内进度，
// 这样旧数据（整数字段）也能直接复用。
// ============================================

export const SCROLL_PERCENT_MULTIPLIER = 10000

/** 小于该比例的位置视为「章节开头」，不做恢复，避免刚打开就跳动。 */
export const MIN_RESTORE_PERCENT = 0.001

export function clampScrollPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(1, Math.max(0, percent))
}

export function chapterPosToPercent(pos: number | null | undefined): number {
  if (typeof pos !== 'number' || !Number.isFinite(pos)) return 0
  return clampScrollPercent(pos / SCROLL_PERCENT_MULTIPLIER)
}

export function scrollPercentToChapterPos(percent: number): number {
  return Math.round(clampScrollPercent(percent) * SCROLL_PERCENT_MULTIPLIER)
}
