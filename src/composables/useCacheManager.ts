// ============================================
// useCacheManager — 缓存管理逻辑（从 settings/data.vue 提取）
// ============================================

import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { cache } from '@/services/cache.js'
import { CACHE } from '@/constants/index.js'

interface CacheCategoryInfo {
  key: string
  name: string
  size: number
  sizeFormatted: string
  count: number
}

interface CacheInfoData {
  path: string
  totalSize: number
  totalSizeFormatted: string
  totalFiles: number
  maxTotalBytes: number
  maxTotalFormatted: string
  categories: CacheCategoryInfo[]
}

function toCacheInfo(value: unknown): CacheInfoData | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const categories = Array.isArray(obj.categories)
    ? (obj.categories as Record<string, unknown>[]).map((c) => ({
        key: typeof c.key === 'string' ? c.key : '',
        name: typeof c.name === 'string' ? c.name : '',
        size: typeof c.size === 'number' ? c.size : 0,
        sizeFormatted: typeof c.sizeFormatted === 'string' ? c.sizeFormatted : '',
        count: typeof c.count === 'number' ? c.count : 0,
      }))
    : []
  return {
    path: typeof obj.path === 'string' ? obj.path : '',
    totalSize: typeof obj.totalSize === 'number' ? obj.totalSize : 0,
    totalSizeFormatted: typeof obj.totalSizeFormatted === 'string' ? obj.totalSizeFormatted : '',
    totalFiles: typeof obj.totalFiles === 'number' ? obj.totalFiles : 0,
    maxTotalBytes: typeof obj.maxTotalBytes === 'number' ? obj.maxTotalBytes : 0,
    maxTotalFormatted: typeof obj.maxTotalFormatted === 'string' ? obj.maxTotalFormatted : '',
    categories,
  }
}

export function useCacheManager() {
  const msg = useMessage()
  const cacheInfo = ref<CacheInfoData | null>(null)
  const loadingCache = ref(false)
  const clearingCategory = ref<string | null>(null)
  const clearingAll = ref(false)
  const cacheLimitMB = ref<number>(CACHE.DEFAULT_MAX_MB)
  const savingLimit = ref(false)
  const migrating = ref(false)
  const showMigrateDialog = ref(false)
  const migratePath = ref('')

  async function loadCacheInfo(): Promise<void> {
    loadingCache.value = true
    try {
      const info = await cache.getInfo()
      cacheInfo.value = toCacheInfo(info)
      cacheLimitMB.value = Math.round((cacheInfo.value?.maxTotalBytes || CACHE.DEFAULT_MAX_TOTAL_BYTES) / (1024 * 1024))
    } catch (err: unknown) {
      const e = err as Error
      msg.error('加载缓存信息失败: ' + (e?.message || String(err)))
    } finally {
      loadingCache.value = false
    }
  }

  async function saveCacheLimit(): Promise<void> {
    savingLimit.value = true
    try {
      await cache.setMaxSize(cacheLimitMB.value)
      await loadCacheInfo()
      msg.success('缓存上限已更新')
    } catch (err: unknown) {
      const e = err as Error
      msg.error('保存失败: ' + (e?.message || String(err)))
    } finally {
      savingLimit.value = false
    }
  }

  function openMigrateDialog(): void {
    migratePath.value = cacheInfo.value?.path || ''
    showMigrateDialog.value = true
  }

  async function doMigrate(): Promise<void> {
    if (!migratePath.value.trim()) return
    migrating.value = true
    try {
      await cache.migrate(migratePath.value.trim())
      await loadCacheInfo()
      showMigrateDialog.value = false
      msg.success('缓存目录已迁移')
    } catch (err: unknown) {
      const e = err as Error
      msg.error('迁移失败: ' + (e?.message || String(err)))
    } finally {
      migrating.value = false
    }
  }

  async function clearCategory(key: string): Promise<void> {
    clearingCategory.value = key
    try {
      const result = await cache.clearCategory(key)
      msg.success(`已清理 ${result.removed} 个文件`)
      await loadCacheInfo()
    } catch (err: unknown) {
      const e = err as Error
      msg.error('清理失败: ' + (e?.message || String(err)))
    } finally {
      clearingCategory.value = null
    }
  }

  async function clearAllCache(): Promise<void> {
    clearingAll.value = true
    try {
      const result = await cache.clearAll()
      msg.success(`已清空 ${result.removed} 个缓存文件`)
      await loadCacheInfo()
    } catch (err: unknown) {
      const e = err as Error
      msg.error('清空失败: ' + (e?.message || String(err)))
    } finally {
      clearingAll.value = false
    }
  }

  onMounted(() => { loadCacheInfo() })

  return {
    cacheInfo,
    loadingCache,
    clearingCategory,
    clearingAll,
    cacheLimitMB,
    savingLimit,
    migrating,
    showMigrateDialog,
    migratePath,
    loadCacheInfo,
    saveCacheLimit,
    openMigrateDialog,
    doMigrate,
    clearCategory,
    clearAllCache,
  }
}
