import vm from 'node:vm'
import { buildJavaAPI } from '../platform/java-bridge.js'
import type { BookSource } from '../../shared/types.js'

export function isJsSource(source: BookSource): boolean {
  return !!(source.code && source.code.trim())
}

export function executeJsSource(
  source: BookSource,
  context: Record<string, any> = {}
): Record<string, any> | null {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    console.warn('[JS Source] 在浏览器环境中跳过执行')
    return null
  }

  if (!source.code) return null

  const sandbox: any = {
    Math: Math,
    JSON: JSON,
    Date: Date,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    encodeURI: encodeURIComponent,
    decodeURI: decodeURIComponent,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    source: source,
    context: context,
    result: null,
    // 注入 java API
    java: buildJavaAPI(),
    console: {
      log: (...args: any[]) => console.log('[JS Source]', ...args),
      error: (...args: any[]) => console.error('[JS Source]', ...args),
      warn: (...args: any[]) => console.warn('[JS Source]', ...args),
    },
  }

  Object.freeze(sandbox.Math)
  Object.freeze(sandbox.JSON)
  Object.freeze(sandbox.Date)
  Object.freeze(sandbox)

  try {
    const script = new vm.Script(
      `
      (function() {
        const source = this.source;
        const context = this.context;
        const console = this.console;
        const Math = this.Math;
        const JSON = this.JSON;
        const Date = this.Date;
        const encodeURI = this.encodeURI;
        const decodeURI = this.decodeURI;
        const parseInt = this.parseInt;
        const parseFloat = this.parseFloat;
        const isNaN = this.isNaN;
        const isFinite = this.isFinite;
        const java = this.java;

        ${source.code}

        return {
          search: typeof search === 'function' ? search : null,
          getBookInfo: typeof getBookInfo === 'function' ? getBookInfo : null,
          getToc: typeof getToc === 'function' ? getToc : null,
          getContent: typeof getContent === 'function' ? getContent : null,
          explore: typeof explore === 'function' ? explore : null,
          login: typeof login === 'function' ? login : null,
        };
      })()
      `,
      { timeout: 5000 } as any
    )

    const result = script.runInContext(vm.createContext(sandbox), {
      timeout: 5000,
      displayErrors: true,
    })

    return result || null
  } catch (error: any) {
    console.error('[JS Source] 执行失败:', error.message)
    return null
  }
}

export async function executeJsSearch(
  source: BookSource,
  keyword: string,
  page: number = 1
): Promise<any> {
  const jsModule = executeJsSource(source, { keyword, page })
  if (!jsModule || typeof jsModule.search !== 'function') {
    return null
  }

  try {
    const result = await jsModule.search(keyword, page)
    return result
  } catch (error: any) {
    console.error('[JS Source] 搜索失败:', error.message)
    return null
  }
}

export async function executeJsBookInfo(
  source: BookSource,
  bookUrl: string
): Promise<any> {
  const jsModule = executeJsSource(source, { bookUrl })
  if (!jsModule || typeof jsModule.getBookInfo !== 'function') {
    return null
  }

  try {
    const result = await jsModule.getBookInfo(bookUrl)
    return result
  } catch (error: any) {
    console.error('[JS Source] 获取书籍详情失败:', error.message)
    return null
  }
}

export async function executeJsToc(
  source: BookSource,
  tocUrl: string
): Promise<any> {
  const jsModule = executeJsSource(source, { tocUrl })
  if (!jsModule || typeof jsModule.getToc !== 'function') {
    return null
  }

  try {
    const result = await jsModule.getToc(tocUrl)
    return result
  } catch (error: any) {
    console.error('[JS Source] 获取目录失败:', error.message)
    return null
  }
}

export async function executeJsContent(
  source: BookSource,
  chapterUrl: string
): Promise<any> {
  const jsModule = executeJsSource(source, { chapterUrl })
  if (!jsModule || typeof jsModule.getContent !== 'function') {
    return null
  }

  try {
    const result = await jsModule.getContent(chapterUrl)
    return result
  } catch (error: any) {
    console.error('[JS Source] 获取正文失败:', error.message)
    return null
  }
}
