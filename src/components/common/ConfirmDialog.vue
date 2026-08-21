<template>
  <n-modal
    :show="visible"
    preset="dialog"
    :title="title || ''"
    :positive-text="confirmText || ''"
    :negative-text="cancelText || ''"
    :bordered="false"
    @update:show="(val: boolean) => $emit('update:visible', val)"
    @positive-click="handleConfirm"
    @negative-click="handleCancel"
    :closable="false"
    :close-on-esc="false"
    :mask-closable="false"
  >
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;white-space:pre-wrap">{{ content }}</p>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal } from 'naive-ui'

const props = withDefaults(defineProps<{
  visible: boolean
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
}>(), {
  title: '确认',
  content: '',
  confirmText: '确认',
  cancelText: '取消',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: []
  cancel: []
}>()

function handleConfirm(): void { emit('confirm'); emit('update:visible', false) }
function handleCancel(): void { emit('cancel'); emit('update:visible', false) }
</script>
