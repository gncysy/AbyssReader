// ============================================
// InfoMap — 发现页筛选状态存储
// ============================================

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { InfoMapEntry } from '@/types/info-map.js'

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useInfoMapStore = defineStore('infoMap', () => {
  const maps = ref<Record<string, InfoMapEntry>>({})

  function getMap(sourceUrl: string): InfoMapEntry {
    const existing = maps.value[sourceUrl]
    if (existing) return existing

    let savedData: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(`infoMap_${sourceUrl}`)
      if (raw) savedData = JSON.parse(raw)
    } catch {
      // ignore
    }

    const newEntry: InfoMapEntry = { data: savedData, needSave: false, saveTime: 0 }
    // 修复：通过重新赋值触发响应式更新
    maps.value = { ...maps.value, [sourceUrl]: newEntry }
    return newEntry
  }

  function get(sourceUrl: string, key: string): string {
    return getMap(sourceUrl).data[key] || ''
  }

  function set(sourceUrl: string, key: string, value: string, saveTime = 0): void {
    const map = getMap(sourceUrl)
    map.data[key] = value
    map.needSave = true
    map.saveTime = saveTime

    // 清除之前的计时器
    const timerKey = sourceUrl
    const existing = saveTimers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      saveTimers.delete(timerKey)
    }

    if (saveTime === 0) {
      saveNow(sourceUrl)
    } else {
      const timer = setTimeout(() => {
        saveNow(sourceUrl)
        saveTimers.delete(timerKey)
      }, saveTime * 1000)
      saveTimers.set(timerKey, timer)
    }
  }

  function saveNow(sourceUrl: string): void {
    const map = maps.value[sourceUrl]
    if (!map || !map.needSave) return
    try {
      localStorage.setItem(`infoMap_${sourceUrl}`, JSON.stringify(map.data))
      map.needSave = false
    } catch {
      // ignore
    }
  }

  function saveAll(): void {
    // 先清除所有计时器
    for (const [key, timer] of saveTimers) {
      clearTimeout(timer)
      saveTimers.delete(key)
    }
    for (const key of Object.keys(maps.value)) saveNow(key)
  }

  function clear(sourceUrl: string): void {
    const timer = saveTimers.get(sourceUrl)
    if (timer) {
      clearTimeout(timer)
      saveTimers.delete(sourceUrl)
    }
    // 修复：通过重新赋值触发响应式更新
    const next = { ...maps.value }
    delete next[sourceUrl]
    maps.value = next
    try {
      localStorage.removeItem(`infoMap_${sourceUrl}`)
    } catch {
      // ignore
    }
  }

  return { maps, getMap, get, set, saveNow, saveAll, clear }
})
