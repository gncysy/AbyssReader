const { contextBridge, ipcRenderer } = require('electron')

// 白名单通道
const validChannels = [
  'verification-complete',
  'verification-cancel',
  'search-progress', 'update-title-bar-overlay', 'engine-batch-search-stream',
  'store-changed',
  'source-test-result',
  'source-test-progress',
  'delete-failed-progress',
  'delete-failed-complete',
]

// 安全暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  // ===== 通用 invoke（用于流式搜索等） =====
  invoke: (channel, ...args) => {
    if (!validChannels.includes(channel)) {
      console.warn(`[Preload] 拒绝调用未授权的通道: ${channel}`)
      return Promise.reject(new Error(`Channel ${channel} not allowed`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  // ===== 存储 =====
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    getAll: () => ipcRenderer.invoke('store-get-all'),
  },

  // ===== 窗口控制 =====
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // ===== 网络请求（仅 HTTP/HTTPS） =====
  fetch: (url, options) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('仅支持 HTTP/HTTPS')
      }
    } catch {
      throw new Error('无效的 URL')
    }
    return ipcRenderer.invoke('fetch', url, options)
  },

  // ===== 文件操作 =====
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // ===== JS 执行（安全沙箱） =====
  executeJs: (code, context, timeout) => ipcRenderer.invoke('execute-js', code, context, timeout),

  // ===== 验证码窗口 =====
  openVerificationWindow: (url, title) => ipcRenderer.invoke('open-verification', url, title),
  closeVerificationWindow: () => ipcRenderer.invoke('close-verification'),

  // ===== 书源管理 =====
  addBookSource: (jsonStr) => ipcRenderer.invoke('add-book-source', jsonStr),
  importSourcesFromUrl: (url) => ipcRenderer.invoke('import-sources-from-url', url),
  testSource: (sourceId) => ipcRenderer.invoke('test-source', sourceId),
  testAllSources: () => ipcRenderer.invoke('test-all-sources'),
  deleteFailedSources: () => ipcRenderer.invoke('delete-failed-sources'),
  getExploreCategories: (sourceId) => ipcRenderer.invoke('get-explore-categories', sourceId),

  // ===== TXT 导入 =====
  importTxt: (name, content) => ipcRenderer.invoke('import-txt', name, content),
  getLocalBookChapters: (bookId) => ipcRenderer.invoke('get-local-book-chapters', bookId),
  getLocalChapterContent: (bookId, chapterId) => ipcRenderer.invoke('get-local-chapter-content', bookId, chapterId),

  // ===== 引擎 API =====
  engineSearch: (source, keyword, page) => ipcRenderer.invoke('engine-search', source, keyword, page),
  engineBatchSearch: (sources, keyword, page) => ipcRenderer.invoke('engine-batch-search', sources, keyword, page),
  engineGetToc: (source, tocUrl) => ipcRenderer.invoke('engine-get-toc', source, tocUrl),
  engineGetContent: (source, chapterUrl) => ipcRenderer.invoke('engine-get-content', source, chapterUrl),
  engineGetBookInfo: (source, bookUrl) => ipcRenderer.invoke('engine-get-book-info', source, bookUrl),

  // ===== 事件监听（白名单） =====
  on: (channel, callback) => {
    if (!validChannels.includes(channel)) {
      console.warn(`[Preload] 拒绝监听未授权的通道: ${channel}`)
      return () => {}
    }
    const handler = (event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },

  off: (channel, callback) => {
    if (!validChannels.includes(channel)) {
      console.warn(`[Preload] 拒绝移除未授权的通道: ${channel}`)
      return
    }
    ipcRenderer.off(channel, callback)
  },
})

// 暴露只读环境信息（安全）
contextBridge.exposeInMainWorld('electron', {
  versions: process.versions,
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development',
})


