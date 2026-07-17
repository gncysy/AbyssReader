import { defineStore } from 'pinia'
import { store, source as sourceApi } from '@/api'
import type { BookSource } from '@shared/types'

export const useSourceStore = defineStore('source', {
  state: () => ({
    sources: [] as BookSource[],
    loading: false,
    testResults: {} as Record<number, string>,
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
      this.sources.push(source)
      await this.saveSources()
      return true
    },

    async removeSource(index: number) {
      this.sources.splice(index, 1)
      await this.saveSources()
    },

    async toggleSource(index: number) {
      if (index < 0 || index >= this.sources.length) return
      this.sources[index].enabled = !this.sources[index].enabled
      this.sources = [...this.sources]
      await this.saveSources()
    },

    async updateSource(index: number, updates: Partial<BookSource>) {
      if (index < 0 || index >= this.sources.length) return
      this.sources[index] = { ...this.sources[index], ...updates }
      this.sources = [...this.sources]
      await this.saveSources()
    },

    async saveSources() {
      await store.set('sources', this.sources)
    },

    setTestResult(index: number, result: string) {
      this.testResults = { ...this.testResults, [index]: result }
    },

    clearTestResults() {
      this.testResults = {}
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

    async testSource(index: number) {
      try {
        const result = await sourceApi.test(index)
        this.setTestResult(index, result)
        return result
      } catch (err: any) {
        this.setTestResult(index, '失败: ' + err.message)
        throw err
      }
    },

    async testAllSources() {
      this.clearTestResults()
      for (let i = 0; i < this.sources.length; i++) {
        await this.testSource(i)
      }
    },

    async deleteFailedSources() {
      const count = await sourceApi.deleteFailed()
      await this.loadSources()
      return count
    },
  },
})
