import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BookSource } from '../api/tauri'

export const useSourceStore = defineStore('source', () => {
  const sources = ref<BookSource[]>([])
  const currentSourceId = ref<string>('')

  function setSources(newSources: BookSource[]) {
    sources.value = newSources
    if (newSources.length > 0 && !currentSourceId.value) {
      currentSourceId.value = newSources[0].id
    }
  }

  function addSource(source: BookSource) {
    if (!sources.value.find(s => s.id === source.id)) {
      sources.value.push(source)
    }
  }

  function removeSource(sourceId: string) {
    sources.value = sources.value.filter(s => s.id !== sourceId)
    if (currentSourceId.value === sourceId) {
      currentSourceId.value = sources.value[0]?.id || ''
    }
  }

  function setCurrentSource(sourceId: string) {
    currentSourceId.value = sourceId
  }

  function getCurrentSource(): BookSource | undefined {
    return sources.value.find(s => s.id === currentSourceId.value)
  }

  return {
    sources,
    currentSourceId,
    setSources,
    addSource,
    removeSource,
    setCurrentSource,
    getCurrentSource,
  }
})
