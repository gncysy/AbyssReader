<template>
  <div class="sync-status text-sm" v-if="lastSyncTime">
    <span class="text-gray-400">📡 上次同步：{{ formatTime(lastSyncTime) }}</span>
  </div>
</template>

<script setup lang="ts">
import { useSyncStore } from '../stores/sync'
import { storeToRefs } from 'pinia'

const syncStore = useSyncStore()
const { lastSyncTime } = storeToRefs(syncStore)

const formatTime = (date: Date) => {
  return date.toLocaleString()
}
</script>
