// src/renderer/utils/index.ts

// ===== IPC 通信 =====
export { ipcInvoke, ipcOn, ipcSend } from './ipc'

// ===== 通用工具函数 =====
export {
  debounce,
  throttle,
  formatDate,
  timeAgo,
  formatFileSize,
  truncate,
  isValidUrl,
  getDomain,
  generateId,
  safeJsonParse,
  stripHtml,
  deepClone,
  isEmptyObject,
  getFileExtension,
  isLocalBook,
  isNetworkBook,
  sleep,
  retry,
  concurrentLimit,
  getRandomColor,
  getInitials,
} from './helpers'

// ===== 错误处理 =====
export { showError, showNotification, handleApiError, withErrorHandler } from './error'
