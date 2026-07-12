import type { BookSource } from '../../shared/types.js'

// 浏览器版本：通过 IPC 调用主进程执行 JS 书源
export function isJsSource(source: BookSource): boolean {
  return !!(source.code && source.code.trim())
}

async function executeJsViaIPC(
  source: BookSource,
  context: Record<string, any> = {}
): Promise<any> {
  const api = (window as any).electronAPI
  if (!api) {
    console.warn('[JS Source] electronAPI 不可用')
    return null
  }

  try {
    const result = await api.executeJs?.(source.code || '', context, 5000)
    if (result && result.success) {
      try {
        return JSON.parse(result.result)
      } catch {
        return null
      }
    }
    return null
  } catch (error: any) {
    console.error('[JS Source] IPC 执行失败:', error.message)
    return null
  }
}

export async function executeJsSource(
  source: BookSource,
  context: Record<string, any> = {}
): Promise<Record<string, any> | null> {
  if (!source.code) return null
  return await executeJsViaIPC(source, context)
}

export async function executeJsSearch(
  source: BookSource,
  keyword: string,
  page: number = 1
): Promise<any> {
  const jsModule = await executeJsSource(source, { keyword, page })
  if (!jsModule || typeof jsModule.search !== 'function') {
    return null
  }
  try {
    return await jsModule.search(keyword, page)
  } catch (error: any) {
    console.error('[JS Source] 搜索失败:', error.message)
    return null
  }
}

export async function executeJsBookInfo(
  source: BookSource,
  bookUrl: string
): Promise<any> {
  const jsModule = await executeJsSource(source, { bookUrl })
  if (!jsModule || typeof jsModule.getBookInfo !== 'function') {
    return null
  }
  try {
    return await jsModule.getBookInfo(bookUrl)
  } catch (error: any) {
    console.error('[JS Source] 获取书籍详情失败:', error.message)
    return null
  }
}

export async function executeJsToc(
  source: BookSource,
  tocUrl: string
): Promise<any> {
  const jsModule = await executeJsSource(source, { tocUrl })
  if (!jsModule || typeof jsModule.getToc !== 'function') {
    return null
  }
  try {
    return await jsModule.getToc(tocUrl)
  } catch (error: any) {
    console.error('[JS Source] 获取目录失败:', error.message)
    return null
  }
}

export async function executeJsContent(
  source: BookSource,
  chapterUrl: string
): Promise<any> {
  const jsModule = await executeJsSource(source, { chapterUrl })
  if (!jsModule || typeof jsModule.getContent !== 'function') {
    return null
  }
  try {
    return await jsModule.getContent(chapterUrl)
  } catch (error: any) {
    console.error('[JS Source] 获取正文失败:', error.message)
    return null
  }
}
