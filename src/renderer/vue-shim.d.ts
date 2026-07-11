// 确保全局类型声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<void>
        delete: (key: string) => Promise<void>
        getAll: () => Promise<any>
      }
      minimizeWindow: () => Promise<void>
      toggleMaximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      fetch: (url: string, options: any) => Promise<any>
      readFile: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      showOpenDialog: (options: any) => Promise<any>
      getAppPath: () => Promise<string>
      executeJs: (code: string, context: any, timeout?: number) => Promise<any>
      openVerificationWindow: (url: string, title?: string) => Promise<void>
      closeVerificationWindow: () => Promise<void>
      addBookSource: (jsonStr: string) => Promise<string>
      importSourcesFromUrl: (url: string) => Promise<string>
      testSource: (sourceId: string) => Promise<string>
      testAllSources: () => Promise<any>
      deleteFailedSources: () => Promise<number>
      getExploreCategories: (sourceId: string) => Promise<any>
      importTxt: (name: string, content: string) => Promise<any>
      getLocalBookChapters: (bookId: string) => Promise<any>
      getLocalChapterContent: (bookId: string, chapterId: number) => Promise<string>
      engineSearch: (source: any, keyword: string, page?: number) => Promise<{ success: boolean; data?: any[]; error?: string }>
      engineBatchSearch: (sources: any[], keyword: string, page?: number) => Promise<{ success: boolean; data?: Record<string, any[]>; error?: string }>
      engineGetToc: (source: any, tocUrl: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
      engineGetContent: (source: any, chapterUrl: string) => Promise<{ success: boolean; data?: string; error?: string }>
      engineGetBookInfo: (source: any, bookUrl: string) => Promise<{ success: boolean; data?: any; error?: string }>
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      off: (channel: string, callback: (...args: any[]) => void) => void
    }
    electron: {
      versions: NodeJS.ProcessVersions
      platform: string
      isDev: boolean
    }
  }
}

// 导出空对象使文件成为模块
export {}
