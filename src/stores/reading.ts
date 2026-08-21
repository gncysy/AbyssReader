import { defineStore } from 'pinia'
import { ref } from 'vue'
import { store } from '@/services'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const useReadingStore = defineStore('reading', () => {
  const theme = ref('dark')
  const loaded = ref(false)

  async function loadSettings(): Promise<void> {
    try {
      const settingsRaw = await store.get('appSettings')
      if (isRecord(settingsRaw) && typeof settingsRaw.theme === 'string') {
        theme.value = settingsRaw.theme
      }
    } catch {
      // ignore
    }
    loaded.value = true
  }

  async function saveSettings(): Promise<void> {
    await store.set('appSettings', {
      theme: theme.value,
    })
  }

  function setTheme(val: string): void { theme.value = val; saveSettings() }

  return {
    theme, loaded,
    loadSettings, saveSettings,
    setTheme,
  }
})
