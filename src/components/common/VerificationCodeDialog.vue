<template>
  <n-modal
v-model:show="visible" preset="dialog" title="验证码" positive-text="确认" negative-text="取消"
    :closable="false" :close-on-esc="false" :mask-closable="false" @positive-click="submit" @negative-click="cancel">
    <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
      <div v-if="svgData" style="display:flex;justify-content:center;background:var(--bg);border-radius:var(--radius-sm);padding:12px" v-html="sanitizedSvg"></div>
      <n-input v-model:value="code" placeholder="请输入验证码" @keyup.enter="submit" />
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NModal, NInput } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import { windowApi } from '@/services/window.js'

const visible = ref(false)
const svgData = ref('')
const code = ref('')
let resolvePromise: ((value: string) => void) | null = null

const sanitizedSvg = computed(() => {
  return DOMPurify.sanitize(svgData.value, {
    ALLOWED_TAGS: ['svg', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'g', 'defs', 'clipPath', 'pattern', 'image', 'style'],
    ALLOWED_ATTR: ['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'transform', 'font-size', 'font-family', 'text-anchor', 'dominant-baseline', 'href', 'xlink:href', 'style'],
  })
})

function open(svg: string): Promise<string> {
  svgData.value = svg
  code.value = ''
  visible.value = true
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function submit(): void {
  visible.value = false
  const result = code.value.trim()
  windowApi.submitVerificationCode(result)
  if (resolvePromise) {
    resolvePromise(result)
    resolvePromise = null
  }
}

function cancel(): void {
  visible.value = false
  windowApi.cancelVerificationCode()
  if (resolvePromise) {
    resolvePromise('')
    resolvePromise = null
  }
}

defineExpose({ open })
</script>
