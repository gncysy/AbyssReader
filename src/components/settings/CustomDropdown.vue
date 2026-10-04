<template>
  <div ref="dropdownRef" class="custom-dropdown" :class="{ open: isOpen }">
    <div class="custom-dropdown-trigger" tabindex="0" @click="toggle" @keydown.enter="toggle" @keydown.space.prevent="toggle">
      <span>{{ selectedLabel || placeholder }}</span>
      <span class="custom-dropdown-arrow">▼</span>
    </div>
    <div v-if="isOpen" class="custom-dropdown-menu">
      <div
        v-for="opt in options"
        :key="String(opt.value)"
        class="custom-dropdown-item"
        :class="{ active: String(modelValue) === String(opt.value) }"
        tabindex="0"
        @click="select(opt.value)"
        @keydown.enter="select(opt.value)"
      >{{ opt.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string | number
  options: { label: string; value: string | number }[]
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [v: string | number] }>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const opt = props.options.find((o) => String(o.value) === String(props.modelValue))
  return opt ? opt.label : null
})

function toggle(): void { isOpen.value = !isOpen.value }

function select(value: string | number): void {
  emit('update:modelValue', value)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent): void {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as HTMLElement)) isOpen.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>
