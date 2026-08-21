// ============================================
// 章节智能匹配 — 对齐 Legado BookHelp
// ============================================

function fullToHalf(str: string): string {
  return str.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  )
}

const CHAPTER_NUM_PATTERN1 = /.*?第([\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)[章节篇回集话]/
const CHAPTER_NUM_PATTERN2 = /^(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+[,:、])*([\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)(?:[,:、]|\.[^\d])/

const CN_NUM_MAP: Record<string, number> = {
  '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '百': 100, '千': 1000, '万': 10000,
  '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5,
  '陆': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
  '佰': 100, '仟': 1000,
}

function chineseToNumber(str: string): number {
  if (/^\d+$/.test(str)) return parseInt(str, 10)

  let result = 0
  let temp = 0

  for (let i = str.length - 1; i >= 0; i--) {
    const ch = str[i]
    if (ch === undefined) return -1
    const num = CN_NUM_MAP[ch]
    if (num === undefined) return -1

    if (num >= 10) {
      if (temp === 0) temp = 1
      result += temp * num
      temp = 0
    } else {
      temp = num
    }
  }

  if (temp > 0) result += temp
  if (str.startsWith('十')) result += 10

  return result
}

function getChapterNum(chapterName: string | null | undefined): number {
  if (!chapterName) return -1
  const name1 = fullToHalf(chapterName).replace(/\s/g, '')
  const match1 = CHAPTER_NUM_PATTERN1.exec(name1)
  if (match1) {
    const m1 = match1[1]
    if (m1 !== undefined) {
      const num = chineseToNumber(m1)
      if (num >= 0) return num
    }
  }
  const match2 = CHAPTER_NUM_PATTERN2.exec(name1)
  if (match2) {
    const m2 = match2[1]
    if (m2 !== undefined) {
      const num = chineseToNumber(m2)
      if (num >= 0) return num
    }
  }
  return -1
}

function getPureChapterName(chapterName: string | null | undefined): string {
  if (!chapterName) return ''
  const name = fullToHalf(chapterName).replace(/\s/g, '')
  const withoutNum = name
    .replace(/^.*?第(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)[章节篇回集话](?!$)/, '')
    .replace(/^(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+[,:、])*(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)(?:[,:、](?!$)|\\.(?=[^\d]))/, '')
  const withoutBrackets = withoutNum
    .replace(/(?!^)(?:[〖【《〔\[{(][^〖【《〔\[{()〕》】〗\]]}+)?[)〕》】〗\]}]$/, '')
    .replace(/^[〖【《〔\[{(](?:[^〖【《〔\[{()〕》】〗\]]}+[〕》】〗\]})])?(?!$)/, '')
  return withoutBrackets.replace(/[^\w\u4E00-\u9FEF\u3400-\u4DBF\u20000-\u2A6DF\u2A700-\u2EBEF\uF900-\uFAFF]/g, '')
}

function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0

  const aBigrams = new Set<string>()
  const bBigrams = new Set<string>()

  for (let i = 0; i < a.length - 1; i++) aBigrams.add(a.substring(i, i + 2))
  for (let i = 0; i < b.length - 1; i++) bBigrams.add(b.substring(i, i + 2))

  let intersection = 0
  aBigrams.forEach((bg) => { if (bBigrams.has(bg)) intersection++ })

  const union = aBigrams.size + bBigrams.size - intersection
  if (union === 0) return 0
  return intersection / union
}

const SEARCH_RANGE = 10
const NAME_SIMILARITY_THRESHOLD = 0.96

export function findChapterIndex(
  oldIndex: number,
  oldTitle: string | null | undefined,
  newChapterList: { title: string }[],
  oldChapterListSize = 0,
): number {
  if (oldIndex <= 0) return 0
  if (newChapterList.length === 0) return oldIndex

  const oldChapterNum = getChapterNum(oldTitle)
  const oldName = getPureChapterName(oldTitle)
  const newSize = newChapterList.length

  const estimatedIndex = oldChapterListSize === 0
    ? oldIndex
    : Math.floor(oldIndex * newSize / oldChapterListSize)

  const min = Math.max(0, Math.min(oldIndex, estimatedIndex) - SEARCH_RANGE)
  const max = Math.min(newSize - 1, Math.max(oldIndex, estimatedIndex) + SEARCH_RANGE)

  let nameSim = 0
  let newIndex = 0
  let newNum = 0

  if (oldName.length > 0) {
    for (let i = min; i <= max; i++) {
      const item = newChapterList[i]
      if (!item) continue
      const newName = getPureChapterName(item.title)
      const sim = jaccardSimilarity(oldName, newName)
      if (sim > nameSim) { nameSim = sim; newIndex = i }
    }
  }

  if (nameSim < NAME_SIMILARITY_THRESHOLD && oldChapterNum > 0) {
    for (let i = min; i <= max; i++) {
      const item = newChapterList[i]
      if (!item) continue
      const temp = getChapterNum(item.title)
      if (temp === oldChapterNum) { newIndex = i; break }
      if (Math.abs(temp - oldChapterNum) < Math.abs(newNum - oldChapterNum)) {
        newNum = temp
        newIndex = i
      }
    }
  }

  if (nameSim > NAME_SIMILARITY_THRESHOLD || Math.abs(newNum - oldChapterNum) < 1) return newIndex
  return Math.min(Math.max(0, newChapterList.length - 1), oldIndex)
}
