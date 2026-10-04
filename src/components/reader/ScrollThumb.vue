<template>
  <div
    v-show="visible"
    ref="thumbRef"
    class="scroll-thumb"
    :style="thumbStyle"
    @mousedown="onMouseDown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, onWatcherCleanup, nextTick } from 'vue'

const props = defineProps<{ containerRef: { value: HTMLElement | null } | null }>()
const thumbRef = ref<HTMLElement | null>(null)
const thumbStyle = ref<Record<string, string>>({ top: '0px', height: '24px' })
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null
let dragging = false
let hovering = false

function cancelHideTimer(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
}

function scheduleHide(): void {
  cancelHideTimer()
  if (!dragging && !hovering) {
    hideTimer = setTimeout(() => { visible.value = false }, 1500)
  }
}

function update(): void {
  const el = props.containerRef?.value
  if (!el) return
  const totalH = el.scrollHeight
  const viewH = el.clientHeight
  if (totalH <= viewH) { visible.value = false; return }
  const thumbH = Math.max(24, (viewH / totalH) * viewH)
  const maxTop = viewH - thumbH
  const scrollPercent = el.scrollTop / (totalH - viewH)
  thumbStyle.value = { top: (scrollPercent * maxTop) + 'px', height: thumbH + 'px' }
  visible.value = true
  scheduleHide()
}

watch(
  () => props.containerRef?.value,
  (el) => {
    if (el) {
      el.addEventListener('scroll', update)
      onWatcherCleanup(() => {
        el.removeEventListener('scroll', update)
      })
      nextTick(() => update())
      setTimeout(() => update(), 100)
    }
  },
  { immediate: true }
)

function onScrollThumbMouseMove(e: MouseEvent): void {
  if (!dragging || !props.containerRef?.value || !thumbRef.value) return
  const el = props.containerRef.value
  const totalH = el.scrollHeight
  const viewH = el.clientHeight
  const thumbH = thumbRef.value.clientHeight
  const maxTop = viewH - thumbH
  const rect = el.getBoundingClientRect()
  const mouseY = Math.max(rect.top, Math.min(rect.bottom, e.clientY))
  const newTop = Math.max(0, Math.min(maxTop, mouseY - rect.top - thumbH / 2))
  el.scrollTop = (newTop / maxTop) * (totalH - viewH)
}

function onScrollThumbMouseUp(): void {
  dragging = false
  document.removeEventListener('mousemove', onScrollThumbMouseMove)
  document.removeEventListener('mouseup', onScrollThumbMouseUp)
  if (thumbRef.value) thumbRef.value.classList.remove('dragging')
  scheduleHide()
}

function onMouseDown(e: MouseEvent): void {
  e.preventDefault(); e.stopPropagation()
  dragging = true
  cancelHideTimer()
  document.addEventListener('mousemove', onScrollThumbMouseMove)
  document.addEventListener('mouseup', onScrollThumbMouseUp)
  if (thumbRef.value) thumbRef.value.classList.add('dragging')
  visible.value = true
}

function onMouseEnter(): void {
  hovering = true
  cancelHideTimer()
}

function onMouseLeave(): void {
  hovering = false
  scheduleHide()
}

defineExpose({ update })

onUnmounted(() => {
  cancelHideTimer()
  document.removeEventListener('mousemove', onScrollThumbMouseMove)
  document.removeEventListener('mouseup', onScrollThumbMouseUp)
  const el = props.containerRef?.value
  if (el) el.removeEventListener('scroll', update)
})
</script>

<style scoped>
.scroll-thumb {
  position: absolute;
  right: 2px;
  width: 4px;
  border-radius: 2px;
  background: rgba(128,128,128,0.35);
  z-index: 1;
  cursor: pointer;
  transition: width 0.15s, right 0.15s, background 0.15s;
  user-select: none;
  -webkit-user-select: none;
}
.scroll-thumb:hover {
  width: 8px;
  right: 0;
  background: rgba(128,128,128,0.55);
}
.scroll-thumb.dragging {
  width: 8px;
  right: 0;
  background: rgba(128,128,128,0.7);
  cursor: grabbing;
}
</style>
