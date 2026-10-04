<template>
  <span v-show="false" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { windowApi } from '@/services/window.js'

const message = useMessage()

let unlistenJavaToast: (() => void) | null = null

onMounted(async () => {
  unlistenJavaToast = await windowApi.listenJavaToast((payload) => {
    if (!payload.message) return
    const duration = payload.isLong ? 3500 : 2000
    if (payload.isLong) {
      message.warning(payload.message, { duration, closable: true })
    } else {
      message.info(payload.message, { duration })
    }
  })
})

onUnmounted(() => {
  if (unlistenJavaToast) {
    try { unlistenJavaToast() } catch { /* ignore */ }
    unlistenJavaToast = null
  }
})
</script>
