const { contextBridge, ipcRenderer } = require('electron')

const validChannels = [
  'store-get', 'store-set', 'store-delete', 'store-get-all',
  'minimize-window', 'maximize-window', 'close-window',
  'fetch', 'download-binary', 'read-file', 'write-file', 'show-open-dialog', 'get-app-path',
  'execute-js',
  'open-verification', 'close-verification',
  'add-book-source', 'import-sources-from-url', 'test-source', 'test-all-sources',
  'delete-source', 'toggle-source', 'delete-failed-sources', 'get-explore-categories',
  'import-txt', 'get-local-book-chapters', 'get-local-chapter-content',
  'engine-search', 'engine-batch-search', 'engine-batch-search-stream',
  'engine-get-toc', 'engine-get-content', 'engine-get-book-info',
  'engine-get-explore-books', 'explore-books-by-id', 'parse-rule',
  'search-abort',
  'ui:toast', 'ui:longToast', 'ui:startBrowserAwait',
  'webview:open', 'webview:init', 'webview:refresh',
  'crypto:rsaEncrypt', 'crypto:rsaDecrypt', 'crypto:randomUUID',
  'verification-complete', 'verification-cancel', 'search-progress',
  'update-title-bar-overlay', 'store-changed',
  'source-test-result', 'source-test-progress',
  'delete-failed-progress', 'delete-failed-complete',
]

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    if (!validChannels.includes(channel)) {
      console.warn('[Preload] 拒绝调用未授权的通道:', channel)
      return Promise.reject(new Error(`Channel ${channel} not allowed`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    getAll: () => ipcRenderer.invoke('store-get-all'),
  },

  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  fetch: (url, options) => {
    try { const p = new URL(url); if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error('仅支持 HTTP/HTTPS') } catch { throw new Error('无效的 URL') }
    return ipcRenderer.invoke('fetch', url, options)
  },

  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  executeJs: (code, context, timeout) => ipcRenderer.invoke('execute-js', code, context, timeout),

  openVerificationWindow: (url, title) => ipcRenderer.invoke('open-verification', url, title),
  closeVerificationWindow: () => ipcRenderer.invoke('close-verification'),

  addBookSource: (jsonStr) => ipcRenderer.invoke('add-book-source', jsonStr),
  importSourcesFromUrl: (url) => ipcRenderer.invoke('import-sources-from-url', url),
  testSource: (index) => ipcRenderer.invoke('test-source', index),
  testAllSources: () => ipcRenderer.invoke('test-all-sources'),
  deleteSource: (index) => ipcRenderer.invoke('delete-source', index),
  toggleSource: (index) => ipcRenderer.invoke('toggle-source', index),
  deleteFailedSources: () => ipcRenderer.invoke('delete-failed-sources'),
  getExploreCategories: (index) => ipcRenderer.invoke('get-explore-categories', index),

  searchAbort: (searchId) => ipcRenderer.invoke('search-abort', searchId),

  importTxt: (name, content) => ipcRenderer.invoke('import-txt', name, content),
  getLocalBookChapters: (bookId) => ipcRenderer.invoke('get-local-book-chapters', bookId),
  getLocalChapterContent: (bookId, chapterId) => ipcRenderer.invoke('get-local-chapter-content', bookId, chapterId),

  engineSearch: (source, keyword, page) => ipcRenderer.invoke('engine-search', source, keyword, page),
  engineBatchSearch: (sources, keyword, page) => ipcRenderer.invoke('engine-batch-search', sources, keyword, page),
  engineBatchSearchStream: (sources, keyword, page) => ipcRenderer.invoke('engine-batch-search-stream', sources, keyword, page),
  engineGetToc: (source, tocUrl, options) => ipcRenderer.invoke('engine-get-toc', source, tocUrl, options),
  engineGetContent: (source, chapterUrl) => ipcRenderer.invoke('engine-get-content', source, chapterUrl),
  engineGetBookInfo: (source, bookUrl) => ipcRenderer.invoke('engine-get-book-info', source, bookUrl),
  engineGetExploreBooks: (source, categoryUrl, page) => ipcRenderer.invoke('engine-get-explore-books', source, categoryUrl, page),
  exploreBooksById: (index, categoryUrl, page) => ipcRenderer.invoke('explore-books-by-id', index, categoryUrl, page),

  on: (channel, callback) => {
    if (!validChannels.includes(channel)) { console.warn('[Preload] 拒绝监听未授权的通道:', channel); return () => {} }
    const handler = (event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },
  off: (channel, callback) => {
    if (!validChannels.includes(channel)) return
    ipcRenderer.off(channel, callback)
  },
})

contextBridge.exposeInMainWorld('electron', {
  versions: process.versions,
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development',
})



