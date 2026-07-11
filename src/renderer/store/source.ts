import { defineStore } from 'pinia'
import { store, source as sourceApi } from '@/api'
import type { BookSource } from '@shared/types'

export const useSourceStore = defineStore('source', {
  state: () => ({
    sources: [] as BookSource[],
    loading: false,
    selectedIds: [] as string[],
    testResults: {} as Record<string, string>,
  }),

  getters: {
    enabledSources: (state) => state.sources.filter((s) => s.enabled),
    totalCount: (state) => state.sources.length,
    enabledCount: (state) => state.sources.filter((s) => s.enabled).length,
  },

  actions: {
    async loadSources() {
      this.loading = true
      try {
        const data = await store.get('sources')
        this.sources = data || []
      } catch (error) {
        console.error('[SourceStore] 加载失败:', error)
      } finally {
        this.loading = false
      }
    },

    async addSource(source: BookSource) {
      const exists = this.sources.find((s) => s.id === source.id)
      if (exists) {
        const idx = this.sources.findIndex((s) => s.id === source.id)
        this.sources[idx] = { ...this.sources[idx], ...source }
      } else {
        this.sources.push(source)
      }
      await this.saveSources()
      return true
    },

    async removeSource(sourceId: string) {
      this.sources = this.sources.filter((s) => s.id !== sourceId)
      await this.saveSources()
    },

    async toggleSource(sourceId: string) {
      const idx = this.sources.findIndex((s) => s.id === sourceId)
      if (idx === -1) return
      this.sources[idx].enabled = !this.sources[idx].enabled
      await this.saveSources()
    },

    async updateSource(sourceId: string, updates: Partial<BookSource>) {
      const idx = this.sources.findIndex((s) => s.id === sourceId)
      if (idx === -1) return
      this.sources[idx] = { ...this.sources[idx], ...updates }
      await this.saveSources()
    },

    async saveSources() {
      await store.set('sources', this.sources)
    },

    setTestResult(sourceId: string, result: string) {
      this.testResults[sourceId] = result
    },

    clearTestResults() {
      this.testResults = {}
    },

    toggleSelect(sourceId: string) {
      const idx = this.selectedIds.indexOf(sourceId)
      if (idx >= 0) {
        this.selectedIds.splice(idx, 1)
      } else {
        this.selectedIds.push(sourceId)
      }
    },

    selectAll() {
      this.selectedIds = this.sources.map((s) => s.id)
    },

    selectNone() {
      this.selectedIds = []
    },

    selectEnabled() {
      this.selectedIds = this.sources.filter((s) => s.enabled).map((s) => s.id)
    },

    async importSources(jsonStr: string) {
      const result = await sourceApi.add(jsonStr)
      await this.loadSources()
      return result
    },

    async importFromUrl(url: string) {
      const result = await sourceApi.importFromUrl(url)
      await this.loadSources()
      return result
    },

    async testSource(sourceId: string) {
      try {
        const result = await sourceApi.test(sourceId)
        this.testResults[sourceId] = result
        return result
      } catch (err: any) {
        this.testResults[sourceId] = '失败: ' + err.message
        throw err
      }
    },

    async testAllSources() {
      for (const source of this.sources) {
        await this.testSource(source.id)
      }
    },

    async deleteFailedSources() {
      const count = await sourceApi.deleteFailed()
      await this.loadSources()
      return count
    },
  },
})
