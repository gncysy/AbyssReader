<template>
  <Teleport to="body">
    <Transition
      enter-active-class="cm-enter-active"
      leave-active-class="cm-leave-active"
      enter-from-class="cm-enter-from"
      leave-to-class="cm-leave-to"
      @enter="onEnter"
    >
      <div v-if="visible" ref="menuRef" class="context-menu" :style="menuStyle" @click.stop>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = reactive<Record<string, string>>({ left: '0px', top: '0px' })

let observer: MutationObserver | null = null
let isMouseDownListenerActive = false

onMounted(() => {
  observer = new MutationObserver(() => {
    if (menuRef.value && document.documentElement.hasAttribute('data-theme')) {
      menuRef.value.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'dark')
    }
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  removeMouseDownListener()
})

function onMouseDown(e: MouseEvent): void {
  if (!visible.value) return
  const target = e.target as HTMLElement
  if (menuRef.value && menuRef.value.contains(target)) return
  close()
}

function addMouseDownListener(): void {
  if (isMouseDownListenerActive) return
  document.addEventListener('mousedown', onMouseDown)
  isMouseDownListenerActive = true
}

function removeMouseDownListener(): void {
  if (!isMouseDownListenerActive) return
  document.removeEventListener('mousedown', onMouseDown)
  isMouseDownListenerActive = false
}

function open(_items: unknown[], x: number, y: number): void {
  visible.value = true
  menuStyle.left = x + 'px'
  menuStyle.top = y + 'px'
  if (menuRef.value) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark'
    menuRef.value.setAttribute('data-theme', theme)
  }
  // 修复：通过标志防止重复添加监听器
  addMouseDownListener()
}

function close(): void {
  visible.value = false
  removeMouseDownListener()
}

function onEnter(el: Element): void {
  const menu = el as HTMLElement
  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const padding = 8

  const currentLeft = parseFloat(menuStyle.left || '0')
  const currentTop = parseFloat(menuStyle.top || '0')

  if (rect.right > vw - padding) {
    menuStyle.left = (currentLeft - rect.width) + 'px'
    if (parseFloat(menuStyle.left || '0') < padding) menuStyle.left = padding + 'px'
  }
  if (parseFloat(menuStyle.left || '0') < padding) menuStyle.left = padding + 'px'

  if (rect.bottom > vh - padding) {
    menuStyle.top = (currentTop - rect.height) + 'px'
    if (parseFloat(menuStyle.top || '0') < padding) menuStyle.top = padding + 'px'
  }

  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  menu.setAttribute('data-theme', theme)
}

defineExpose({ open, close })
</script>

<style>
.context-menu {
  position: fixed; z-index: 50000;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  padding: 4px 0; min-width: 140px;
}
.cm-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.cm-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.cm-enter-from { opacity: 0; transform: scale(0.92); }
.cm-leave-to { opacity: 0; transform: scale(0.95); }
</style>
