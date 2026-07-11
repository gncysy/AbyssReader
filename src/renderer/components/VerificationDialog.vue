<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :title="title"
    :show-icon="false"
    :closable="false"
    :close-on-esc="false"
    :mask-closable="false"
    style="width: 600px; max-width: 90vw;"
  >
    <div class="verification-container">
      <div class="verification-hint">
        <p>请在下方完成验证后，点击「完成验证」按钮</p>
      </div>

      <!-- WebView 容器 -->
      <div class="webview-wrapper">
        <webview
          ref="webviewRef"
          :src="url"
          class="webview"
          :partition="`persist:verification-${Date.now()}`"
          webpreferences="contextIsolation=true,sandbox=true"
        />
      </div>

      <div class="verification-actions">
        <button class="btn-secondary" @click="handleCancel">取消</button>
        <button class="btn-primary" @click="handleConfirm">完成验证</button>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { NModal } from 'naive-ui'

const props = defineProps<{
  show: boolean
  url: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const visible = ref(false)
const webviewRef = ref<HTMLElement | null>(null)

watch(() => props.show, (val) => {
  visible.value = val
  if (val) {
    nextTick(() => {
      // WebView 会在 DOM 更新后加载
    })
  }
})

watch(visible, (val) => {
  if (!val) {
    emit('update:show', false)
  }
})

function handleConfirm() {
  // 从 WebView 获取 Cookie
  const webview = webviewRef.value as any
  if (webview) {
    webview.getWebContents().session.cookies.get({})
      .then((cookies: any[]) => {
        // 同步 Cookie 到引擎
        console.log('[Verification] Cookies:', cookies)
        // TODO: 同步到 tough-cookie
      })
      .catch(console.error)
  }
  emit('confirm')
  visible.value = false
}

function handleCancel() {
  emit('cancel')
  visible.value = false
}

onMounted(() => {
  visible.value = props.show
})
</script>

<style scoped>
.verification-container {
  padding: 8px 0;
}

.verification-hint {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-hover);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}
.verification-hint p { margin: 0; }

.webview-wrapper {
  width: 100%;
  height: 400px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.webview {
  width: 100%;
  height: 100%;
  border: none;
}

.verification-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
