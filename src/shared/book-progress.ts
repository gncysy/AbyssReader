export interface BookProgress {
  author: string
  durChapterIndex: number
  durChapterPos: number
  durChapterTime: number
  durChapterTitle: string
  name: string
}

export function createBookProgress(
  name: string,
  author: string,
  chapterIndex: number,
  chapterPos: number,
  chapterTitle: string,
): BookProgress {
  return {
    name,
    author,
    durChapterIndex: chapterIndex,
    durChapterPos: chapterPos,
    durChapterTime: Date.now(),
    durChapterTitle: chapterTitle,
  }
}

export function getProgressFileName(name: string, author: string): string {
  const safeName = (name + '_' + author).replace(/[\\/:*?"<>|]/g, '_')
  return safeName + '.json'
}
