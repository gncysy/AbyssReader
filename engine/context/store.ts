// ============================================
// T6 - 变量存储（按 sourceId 隔离）
// ============================================

const contextStore = new Map<string, Map<string, unknown>>()
const chapterStore = new Map<string, Map<string, unknown>>()
const bookStore = new Map<string, Map<string, unknown>>()

function getSourceMap(sourceId: string): Map<string, unknown> {
  if (!contextStore.has(sourceId)) {
    contextStore.set(sourceId, new Map())
  }
  return contextStore.get(sourceId)!
}

export function putContext(sourceId: string, key: string, value: unknown): void {
  getSourceMap(sourceId).set(key, value)
}

export function getContext(sourceId: string, key: string): unknown {
  return getSourceMap(sourceId).get(key)
}

export function clearContext(sourceId?: string): void {
  if (sourceId) {
    contextStore.delete(sourceId)
    chapterStore.delete(sourceId)
    bookStore.delete(sourceId)
  } else {
    contextStore.clear()
    chapterStore.clear()
    bookStore.clear()
  }
}

function getChapterMap(sourceId: string): Map<string, unknown> {
  if (!chapterStore.has(sourceId)) {
    chapterStore.set(sourceId, new Map())
  }
  return chapterStore.get(sourceId)!
}

export function putChapterVariable(sourceId: string, chapterKey: string, key: string, value: unknown): void {
  getChapterMap(sourceId).set(`${chapterKey}::${key}`, value)
}

export function getChapterVariable(sourceId: string, chapterKey: string, key: string): unknown {
  return getChapterMap(sourceId).get(`${chapterKey}::${key}`)
}

function getBookMap(sourceId: string): Map<string, unknown> {
  if (!bookStore.has(sourceId)) {
    bookStore.set(sourceId, new Map())
  }
  return bookStore.get(sourceId)!
}

export function putBookVariable(sourceId: string, key: string, value: unknown): void {
  getBookMap(sourceId).set(key, value)
}

export function getBookVariable(sourceId: string, key: string): unknown {
  return getBookMap(sourceId).get(key)
}
