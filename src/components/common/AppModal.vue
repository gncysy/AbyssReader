<template>
  <n-modal
    :show="visible"
    preset="card"
    :title="title"
    :style="mergedStyle"
    :bordered="false"
    @update:show="(val: boolean) => emit('update:visible', val)"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NModal } from 'naive-ui'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<{
  visible: boolean
  title?: string
  size?: ModalSize
  maxHeight?: string
}>(), {
  title: '',
  size: 'md',
  maxHeight: '',
})

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

/**
 * 尺寸规范：
 * - sm: 480px  —— 简单确认 / 单输入
 * - md: 650px  —— 通用弹窗（换源、封面选择）
 * - lg: 800px  —— 复杂列表（日志面板）
 * - xl: 90vw   —— 全屏级（调试面板）
 */
const SIZE_MAP: Record<ModalSize, string> = {
  sm: '480px',
  md: '650px',
  lg: '800px',
  xl: '90vw',
}

const mergedStyle = computed(() => {
  const parts: string[] = [`max-width: ${SIZE_MAP[props.size]}`]
  if (props.maxHeight) {
    parts.push(`max-height: ${props.maxHeight}`)
  }
  return parts.join('; ')
})
</script>
