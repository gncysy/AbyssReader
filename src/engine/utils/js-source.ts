import type { BookSource } from '../../shared/types.js'

// 检测是否在浏览器环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

let impl: any = null
let implLoaded = false

// 懒加载实现
async function getImpl() {
  if (implLoaded) return impl
  
  try {
    if (isBrowser) {
      // 浏览器环境：使用 IPC 版本
      const module = await import('./js-source.browser.js')
      impl = module
    } else {
      // Node.js 环境：使用 vm 版本
      const module = await import('./js-source.node.js')
      impl = module
    }
    implLoaded = true
  } catch (error) {
    console.error('[JS Source] 加载实现失败:', error)
    impl = null
    implLoaded = true
  }
  return impl
}

export function isJsSource(source: BookSource): boolean {
  return !!(source.code && source.code.trim())
}

export async function executeJsSource(
  source: BookSource,
  context: Record<string, any> = {}
): Promise<Record<string, any> | null> {
  if (!source.code) return null
  const mod = await getImpl()
  if (!mod || typeof mod.executeJsSource !== 'function') {
    console.warn('[JS Source] 实现不可用')
    return null
  }
  return await mod.executeJsSource(source, context)
}

export async function executeJsSearch(
  source: BookSource,
  keyword: string,
  page: number = 1
): Promise<any> {
  const mod = await getImpl()
  if (!mod || typeof mod.executeJsSearch !== 'function') {
    console.warn('[JS Source] 实现不可用')
    return null
  }
  return await mod.executeJsSearch(source, keyword, page)
}

export async function executeJsBookInfo(
  source: BookSource,
  bookUrl: string
): Promise<any> {
  const mod = await getImpl()
  if (!mod || typeof mod.executeJsBookInfo !== 'function') {
    console.warn('[JS Source] 实现不可用')
    return null
  }
  return await mod.executeJsBookInfo(source, bookUrl)
}

export async function executeJsToc(
  source: BookSource,
  tocUrl: string
): Promise<any> {
  const mod = await getImpl()
  if (!mod || typeof mod.executeJsToc !== 'function') {
    console.warn('[JS Source] 实现不可用')
    return null
  }
  return await mod.executeJsToc(source, tocUrl)
}

export async function executeJsContent(
  source: BookSource,
  chapterUrl: string
): Promise<any> {
  const mod = await getImpl()
  if (!mod || typeof mod.executeJsContent !== 'function') {
    console.warn('[JS Source] 实现不可用')
    return null
  }
  return await mod.executeJsContent(source, chapterUrl)
}
