// ============================================
// useRssSourceManager — 订阅源管理逻辑（从 rss/index.vue 提取）
// ============================================

import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import type { RssSource } from '@/types'

const DEFAULT_RSS_SOURCES: RssSource[] = [
  {
    sourceName: '乌云净化',
    sourceUrl: 'https://www.lanzoux.com/b0bw8jwoh',
    sourceIcon: null,
    sourceGroup: 'legado',
    sourceComment: '阅读规则净化',
    enabled: true,
    singleUrl: true,
    articleStyle: 0,
    customOrder: 5,
    enableJs: true,
    loadWithBaseUrl: true,
    enabledCookieJar: true,
    type: 0,
  },
]

export function useRssSourceManager() {
  const msg = useMessage()
  const sources = ref<RssSource[]>([])
  const selectedUrls = ref(new Set<string>())

  const selectedCount = computed(() => selectedUrls.value.size)

  function isSelected(url: string): boolean {
    return selectedUrls.value.has(url)
  }

  function toggleSelect(source: RssSource): void {
    const url = source.sourceUrl
    const next = new Set(selectedUrls.value)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    selectedUrls.value = next
  }

  function clearSelection(): void {
    selectedUrls.value = new Set()
  }

  function getSelectedSources(): RssSource[] {
    return sources.value.filter((s) => selectedUrls.value.has(s.sourceUrl))
  }

  async function loadSources(): Promise<void> {
    try {
      const data = await store.get('rssSources')
      sources.value = asArray<RssSource>(data)
    } catch {
      sources.value = []
    }
  }

  async function saveSources(newSources: RssSource[]): Promise<void> {
    await store.set('rssSources', newSources)
    sources.value = newSources
  }

  async function toggleEnabled(source: RssSource): Promise<void> {
    const arr = [...sources.value]
    const idx = arr.findIndex((s) => s.sourceUrl === source.sourceUrl)
    if (idx !== -1 && arr[idx]) {
      arr[idx]!.enabled = arr[idx]!.enabled !== false ? false : true
      await saveSources(arr)
    }
  }

  async function deleteSource(source: RssSource): Promise<void> {
    const arr = sources.value.filter((s) => s.sourceUrl !== source.sourceUrl)
    await saveSources(arr)
    const next = new Set(selectedUrls.value)
    next.delete(source.sourceUrl)
    selectedUrls.value = next
  }

  async function batchEnable(): Promise<number> {
    const selected = getSelectedSources()
    const urlSet = new Set(selected.map((s) => s.sourceUrl))
    const arr = [...sources.value]
    for (const s of arr) {
      if (urlSet.has(s.sourceUrl)) s.enabled = true
    }
    await saveSources(arr)
    clearSelection()
    return selected.length
  }

  async function batchDisable(): Promise<number> {
    const selected = getSelectedSources()
    const urlSet = new Set(selected.map((s) => s.sourceUrl))
    const arr = [...sources.value]
    for (const s of arr) {
      if (urlSet.has(s.sourceUrl)) s.enabled = false
    }
    await saveSources(arr)
    clearSelection()
    return selected.length
  }

  async function batchTop(): Promise<number> {
    const selected = getSelectedSources()
    const maxOrder = sources.value.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
    const urlSet = new Set(selected.map((s) => s.sourceUrl))
    const arr = [...sources.value]
    let offset = 0
    for (const s of arr) {
      if (urlSet.has(s.sourceUrl)) {
        s.customOrder = maxOrder + offset + 1
        offset++
      }
    }
    await saveSources(arr)
    clearSelection()
    return selected.length
  }

  async function batchBottom(): Promise<number> {
    const selected = getSelectedSources()
    const minOrder = sources.value.reduce((min, s) => Math.min(min, s.customOrder || 999), 999)
    const urlSet = new Set(selected.map((s) => s.sourceUrl))
    const arr = [...sources.value]
    let offset = 0
    for (const s of arr) {
      if (urlSet.has(s.sourceUrl)) {
        s.customOrder = minOrder - offset - 1
        offset++
      }
    }
    await saveSources(arr)
    clearSelection()
    return selected.length
  }

  async function batchDelete(): Promise<number> {
    const selected = getSelectedSources()
    const urlSet = new Set(selected.map((s) => s.sourceUrl))
    const arr = sources.value.filter((s) => !urlSet.has(s.sourceUrl))
    await saveSources(arr)
    clearSelection()
    return selected.length
  }

  async function importFromJson(jsonStr: string): Promise<number> {
    const data = JSON.parse(jsonStr) as unknown
    const items = Array.isArray(data) ? data : [data]
    let count = 0
    const existing = new Set(sources.value.map((s) => s.sourceUrl))
    const newItems: RssSource[] = []
    for (const item of items) {
      const obj = item as RssSource
      if (obj.sourceUrl && !existing.has(obj.sourceUrl)) {
        newItems.push(obj)
        existing.add(obj.sourceUrl)
        count++
      }
    }
    if (count > 0) {
      await saveSources([...sources.value, ...newItems])
    }
    return count
  }

  async function importFromFile(file: File): Promise<number> {
    const text = await file.text()
    return importFromJson(text)
  }

  async function importDefault(): Promise<number> {
    const existing = new Set(sources.value.map((s) => s.sourceUrl))
    const toAdd = DEFAULT_RSS_SOURCES.filter((s) => !existing.has(s.sourceUrl))
    if (toAdd.length === 0) return 0
    const maxOrder = sources.value.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
    for (let i = 0; i < toAdd.length; i++) {
      toAdd[i]!.customOrder = maxOrder + i + 1
    }
    await saveSources([...sources.value, ...toAdd])
    return toAdd.length
  }

  return {
    sources,
    selectedUrls,
    selectedCount,
    isSelected,
    toggleSelect,
    clearSelection,
    getSelectedSources,
    loadSources,
    toggleEnabled,
    deleteSource,
    batchEnable,
    batchDisable,
    batchTop,
    batchBottom,
    batchDelete,
    importFromJson,
    importFromFile,
    importDefault,
  }
}
