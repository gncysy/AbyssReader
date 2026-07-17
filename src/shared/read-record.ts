export interface ReadRecord {
  deviceId: string
  bookName: string
  author: string
  bookUrl: string
  readTime: number
  chapterIndex: number
  chapterTitle: string
}

export function createReadRecord(
  bookName: string,
  author: string,
  bookUrl: string,
  chapterIndex: number,
  chapterTitle: string,
): ReadRecord {
  return {
    deviceId: 'desktop',
    bookName,
    author,
    bookUrl,
    readTime: Date.now(),
    chapterIndex,
    chapterTitle,
  }
}

export function mergeReadRecords(existing: ReadRecord[], incoming: ReadRecord[]): ReadRecord[] {
  const map = new Map<string, ReadRecord>()
  for (const r of existing) {
    const key = r.bookUrl + '|' + r.bookName
    const old = map.get(key)
    if (!old || r.readTime > old.readTime) map.set(key, r)
  }
  for (const r of incoming) {
    const key = r.bookUrl + '|' + r.bookName
    const old = map.get(key)
    if (!old || r.readTime > old.readTime) map.set(key, r)
  }
  return Array.from(map.values()).sort((a, b) => b.readTime - a.readTime)
}
