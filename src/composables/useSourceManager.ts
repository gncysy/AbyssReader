// ============================================
// useSourceManager — 书源管理批量操作逻辑（从 sources/index.vue 提取）
// ============================================

import { ref, computed } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import type { BookSource } from '@/types'

export function useSourceManager() {
  const msg = useMessage()
  const dialog = useDialog()
  const sources = ref<BookSource[]>([])
  const selectedIndices = ref(new Set<number>())

  const safeSources = computed(() => Array.isArray(sources.value) ? sources.value : [])
  const selectedCount = computed(() => selectedIndices.value.size)

  async function loadSources(): Promise<void> {
    try {
      const raw = await store.get('bookSource')
      sources.value = asArray<BookSource>(raw)
    } catch {
      sources.value = []
    }
  }

  function toggleSelect(index: number): void {
    const next = new Set(selectedIndices.value)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    selectedIndices.value = next
  }

  function clearSelection(): void {
    selectedIndices.value = new Set()
  }

  async function batchEnable(): Promise<number> {
    const arr = [...safeSources.value]
    const indices = [...selectedIndices.value].sort((a, b) => a - b)
    for (const i of indices) {
      const item = arr[i]
      if (item) item.enabled = true
    }
    await store.set('bookSource', arr)
    sources.value = arr
    clearSelection()
    return indices.length
  }

  async function batchDisable(): Promise<number> {
    const arr = [...safeSources.value]
    const indices = [...selectedIndices.value].sort((a, b) => a - b)
    for (const i of indices) {
      const item = arr[i]
      if (item) item.enabled = false
    }
    await store.set('bookSource', arr)
    sources.value = arr
    clearSelection()
    return indices.length
  }

  async function batchDelete(onConfirm: () => void): Promise<void> {
    dialog.warning({
      title: '批量删除',
      content: `确定删除选中的 ${selectedIndices.value.size} 个书源？`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        const arr = [...safeSources.value]
        const toRemove = [...selectedIndices.value].sort((a, b) => a - b)
        const removeSet = new Set(toRemove)
        const filtered = arr.filter((_, i) => !removeSet.has(i))
        await store.set('bookSource', filtered)
        sources.value = filtered
        clearSelection()
        onConfirm()
      },
    })
  }

  async function deleteSourceByIndex(idx: number, onConfirm: () => void): Promise<void> {
    const source = safeSources.value[idx]
    if (!source) return
    dialog.warning({
      title: '确认删除',
      content: `删除「${source.bookSourceName}」？`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        const newArr = [...safeSources.value]
        newArr.splice(idx, 1)
        await store.set('bookSource', newArr)
        sources.value = newArr
        onConfirm()
      },
    })
  }

  async function toggleSourceByIndex(idx: number, force?: boolean): Promise<void> {
    try {
      const arr = [...safeSources.value]
      const source = arr[idx]
      if (source) {
        // 修复：force 为 undefined 时切换，force 为 true/false 时强制设置
        source.enabled = force !== undefined ? force : !source.enabled
        sources.value = arr
        await store.set('bookSource', arr)
      }
    } catch (err: unknown) {
      const e = err as Error
      msg.error('操作失败: ' + e.message)
    }
  }

  return {
    sources,
    selectedIndices,
    safeSources,
    selectedCount,
    loadSources,
    toggleSelect,
    clearSelection,
    batchEnable,
    batchDisable,
    batchDelete,
    deleteSourceByIndex,
    toggleSourceByIndex,
  }
}
