import { defineStore } from 'pinia'
import { store } from '@/api'
import type { ReplaceRule } from '@shared/types'

export const useReplaceRuleStore = defineStore('replaceRules', {
  state: () => ({
    rules: [] as ReplaceRule[],
    loading: false,
  }),

  actions: {
    async loadRules() {
      this.loading = true
      try {
        this.rules = await store.get('replaceRules') || []
      } catch { this.rules = [] }
      finally { this.loading = false }
    },

    async addRule(rule: ReplaceRule) {
      this.rules.push(rule)
      await this.saveRules()
    },

    async updateRule(id: string, updates: Partial<ReplaceRule>) {
      const idx = this.rules.findIndex(r => r.id === id)
      if (idx >= 0) {
        this.rules[idx] = { ...this.rules[idx], ...updates }
        await this.saveRules()
      }
    },

    async removeRule(id: string) {
      this.rules = this.rules.filter(r => r.id !== id)
      await this.saveRules()
    },

    async toggleRule(id: string) {
      const idx = this.rules.findIndex(r => r.id === id)
      if (idx >= 0) {
        this.rules[idx].isEnabled = !this.rules[idx].isEnabled
        await this.saveRules()
      }
    },

    async saveRules() {
      await store.set('replaceRules', this.rules)
    },
  },
})
