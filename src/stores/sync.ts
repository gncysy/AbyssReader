import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSyncStore = defineStore('sync', () => {
  const isSyncing = ref(false)
  const lastSyncTime = ref<Date | null>(null)
  const syncError = ref<string | null>(null)

  async function syncNow() {
    isSyncing.value = true
    syncError.value = null
    await new Promise(resolve => setTimeout(resolve, 1000))
    lastSyncTime.value = new Date()
    isSyncing.value = false
  }

  return {
    isSyncing,
    lastSyncTime,
    syncError,
    syncNow,
  }
})
