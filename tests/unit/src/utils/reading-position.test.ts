import { describe, expect, it } from 'vitest'
import {
  SCROLL_PERCENT_MULTIPLIER,
  chapterPosToPercent,
  clampScrollPercent,
  scrollPercentToChapterPos,
} from '../../../../src/utils/reading-position.js'

describe('reading-position', () => {
  it('clamps percentages into 0..1', () => {
    expect(clampScrollPercent(-0.5)).toBe(0)
    expect(clampScrollPercent(0.42)).toBe(0.42)
    expect(clampScrollPercent(1.5)).toBe(1)
    expect(clampScrollPercent(Number.NaN)).toBe(0)
  })

  it('converts persisted chapterPos to scroll percent', () => {
    expect(chapterPosToPercent(0)).toBe(0)
    expect(chapterPosToPercent(5000)).toBe(0.5)
    expect(chapterPosToPercent(SCROLL_PERCENT_MULTIPLIER)).toBe(1)
    expect(chapterPosToPercent(20000)).toBe(1)
    expect(chapterPosToPercent(-100)).toBe(0)
    expect(chapterPosToPercent(undefined)).toBe(0)
    expect(chapterPosToPercent(null)).toBe(0)
    expect(chapterPosToPercent(Number.NaN)).toBe(0)
  })

  it('converts scroll percent back to the persisted chapterPos', () => {
    expect(scrollPercentToChapterPos(0)).toBe(0)
    expect(scrollPercentToChapterPos(0.5)).toBe(5000)
    expect(scrollPercentToChapterPos(1)).toBe(SCROLL_PERCENT_MULTIPLIER)
    expect(scrollPercentToChapterPos(2)).toBe(SCROLL_PERCENT_MULTIPLIER)
    expect(scrollPercentToChapterPos(-1)).toBe(0)
    expect(scrollPercentToChapterPos(Number.NaN)).toBe(0)
  })

  it('round-trips persisted positions without losing visible precision', () => {
    for (const pos of [0, 1, 123, 4999, 5000, 9876, SCROLL_PERCENT_MULTIPLIER]) {
      expect(scrollPercentToChapterPos(chapterPosToPercent(pos))).toBe(pos)
    }
  })
})
