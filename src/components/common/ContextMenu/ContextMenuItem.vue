<template>
  <button
    class="context-menu-item"
    :class="{ 'cm-danger': danger }"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot name="icon" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; danger?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ click: [] }>()

function handleClick(): void { if (!props.disabled) emit('click') }
</script>

<style>
.context-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 16px; font-size: 13px;
  color: var(--text-secondary);
  background: transparent; border: none; cursor: pointer;
  text-align: left; transition: background 0.1s, color 0.1s; font-family: inherit;
}
.context-menu-item:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.context-menu-item:disabled { opacity: 0.35; cursor: not-allowed; }
/* 修复：危险色统一走 CSS 变量 */
.context-menu-item.cm-danger { color: var(--danger); }
.context-menu-item.cm-danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-hover); }
</style>
