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

      <div class="webview-wrapper">
        <webview
          ref="webviewRef"
          :src="url"
          class="webview"
          :partition="`persist:verification-${partitionId}`"
          webpreferences="contextIsolation=true,sandbox=true"
        />
      </div>

      <div class="verification-actions">
        <button class="btn-cancel" @click="handleCancel">取消</button>
        <button class="btn-confirm" @click="handleConfirm">完成验证</button>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
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
const partitionId = ref(Date.now())

watch(() => props.show, (val) => {
  visible.value = val
})

watch(visible, (val) => {
  if (!val) {
    emit('update:show', false)
  }
})

function handleConfirm() {
  const webview = webviewRef.value as any
  if (webview && webview.getWebContents) {
    webview.getWebContents().session.cookies.get({})
      .then((cookies: any[]) => {
        console.log('[Verification] Cookies:', cookies)
      })
      .catch((err: any) => {
        console.error('[Verification] Cookie 获取失败:', err)
      })
  }
  emit('confirm')
  visible.value = false
}

function handleCancel() {
  emit('cancel')
  visible.value = false
}
</script>

<style scoped>
.verification-container { padding: 8px 0; }

.verification-hint {
  margin-bottom: 14px; padding: 10px 14px;
  background: var(--bg-hover); border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-secondary); line-height: 1.5;
  border: 1px solid var(--border-color);
}

.verification-hint p { margin: 0; }

.webview-wrapper {
  width: 100%; height: 400px; border: 1px solid var(--border-color);
  border-radius: var(--radius-md); overflow: hidden; background: #ffffff;
}

.webview { width: 100%; height: 100%; border: none; }

.verification-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }

.btn-cancel {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 8px 20px; font-size: 14px; font-weight: var(--font-medium);
  color: var(--text-secondary); background: transparent;
  border: 1px solid var(--border-color); border-radius: var(--radius-md);
  cursor: pointer;
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out), border-color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}
.btn-cancel:hover { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); transform: translateY(-1px); }
.btn-cancel:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }

.btn-confirm {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 8px 20px; font-size: 14px; font-weight: var(--font-medium);
  color: #0f0f0f; background: var(--brand); border: none;
  border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.btn-confirm:hover { background: var(--brand-hover); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(212, 160, 23, 0.3); }
.btn-confirm:active { transform: translateY(0); }
.btn-confirm:focus-visible { outline: 2px solid var(--brand-hover); outline-offset: 2px; }
</style>