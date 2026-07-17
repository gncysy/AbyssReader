declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<void>
        delete: (key: string) => Promise<void>
        getAll: () => Promise<any>
      }
      minimizeWindow: () => void
      toggleMaximizeWindow: () => void
      closeWindow: () => void
      fetch: (url: string, options?: any) => Promise<any>
      readFile: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      showOpenDialog: (options: any) => Promise<any>
      getAppPath: () => Promise<string>
      executeJs: (code: string, context?: any, timeout?: number) => Promise<any>
      openVerificationWindow: (url: string, title?: string) => Promise<void>
      closeVerificationWindow: () => Promise<void>
      addBookSource: (jsonStr: string) => Promise<string>
      importSourcesFromUrl: (url: string) => Promise<string>
      testSource: (index: number) => Promise<string>
      testAllSources: () => Promise<any>
      deleteSource: (index: number) => Promise<any>
      toggleSource: (index: number) => Promise<any>
      deleteFailedSources: () => Promise<number>
      getExploreCategories: (index: number) => Promise<any>
      searchAbort: (searchId: string) => Promise<any>
      importTxt: (name: string, content: string) => Promise<any>
      getLocalBookChapters: (bookId: string) => Promise<any[]>
      getLocalChapterContent: (bookId: string, chapterId: number) => Promise<string>
      engineSearch: (source: any, keyword: string, page?: number) => Promise<any>
      engineBatchSearch: (sources: any[], keyword: string, page?: number) => Promise<any>
      engineBatchSearchStream: (sources: any[], keyword: string, page?: number) => Promise<any>
      engineGetToc: (source: any, tocUrl: string) => Promise<any>
      engineGetContent: (source: any, chapterUrl: string) => Promise<any>
      engineGetBookInfo: (source: any, bookUrl: string) => Promise<any>
      engineGetExploreBooks: (source: any, categoryUrl: string, page: number) => Promise<any>
      exploreBooksById: (index: number, categoryUrl: string, page: number) => Promise<any>
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      off: (channel: string, callback: (...args: any[]) => void) => void
    }
  }
}

export {}
