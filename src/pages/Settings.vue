<template>
  <div class="p-10">
    <div class="mb-10">
      <h2 class="font-display text-3xl font-bold text-ink dark:text-parchment">设置</h2>
      <p class="text-parchment-muted text-sm mt-2 tracking-wide">偏好与配置</p>
    </div>

    <div class="max-w-xl space-y-8">
      <!-- 外观 -->
      <section>
        <h3 class="font-display text-lg text-ink dark:text-parchment mb-4">外观</h3>
        <div class="surface-inset p-4 flex items-center justify-between">
          <span class="text-sm text-parchment-dim">主题模式</span>
          <div class="flex gap-1">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              @click="setTheme(option.value)"
              :class="[
                'text-xs px-3 py-1 tracking-wider transition-colors',
                currentTheme === option.value ? 'bg-amber/15 text-amber' : 'text-parchment-muted hover:text-parchment'
              ]"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <!-- 阅读设置 -->
      <section>
        <h3 class="font-display text-lg text-ink dark:text-parchment mb-4">阅读</h3>
        <div class="surface-inset divide-y divide-ink-border/20 dark:divide-ink-border/50">
          <div class="p-4 flex justify-between items-center">
            <span class="text-sm text-parchment-dim">字体大小</span>
            <div class="flex items-center gap-3">
              <button @click="decreaseFontSize" class="btn-secondary text-xs px-2 py-1">A-</button>
              <span class="text-sm w-10 text-center tabular-nums">{{ fontSize }}px</span>
              <button @click="increaseFontSize" class="btn-secondary text-xs px-2 py-1">A+</button>
            </div>
          </div>
          <div class="p-4 flex justify-between items-center">
            <span class="text-sm text-parchment-dim">行间距</span>
            <div class="flex items-center gap-3">
              <button @click="decreaseLineHeight" class="btn-secondary text-xs px-2 py-1">-</button>
              <span class="text-sm w-8 text-center tabular-nums">{{ lineHeight.toFixed(1) }}</span>
              <button @click="increaseLineHeight" class="btn-secondary text-xs px-2 py-1">+</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section>
        <h3 class="font-display text-lg text-ink dark:text-parchment mb-4">关于</h3>
        <div class="surface-inset p-4">
          <p class="text-sm text-parchment-dim">AbyssReader <span class="text-amber">v0.1.0</span></p>
          <p class="text-xs text-parchment-muted mt-2">桌面端小说阅读器 · 兼容开源阅读书源</p>
          <p class="text-[10px] text-rust/60 mt-3">本工具仅用于学习研究，请勿用于商业用途</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const fontSize = ref(16)
function increaseFontSize() { fontSize.value = Math.min(32, fontSize.value + 1) }
function decreaseFontSize() { fontSize.value = Math.max(12, fontSize.value - 1) }

const lineHeight = ref(16)
function increaseLineHeight() { lineHeight.value = Math.min(30, lineHeight.value + 1) }
function decreaseLineHeight() { lineHeight.value = Math.max(12, lineHeight.value - 1) }

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' }
]
const currentTheme = ref('system')

function setTheme(value: string) {
  currentTheme.value = value
  localStorage.setItem('theme', value)
  if (value === 'dark') {
    document.documentElement.classList.add('dark')
  } else if (value === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
}

onMounted(() => {
  const saved = localStorage.getItem('theme')
  currentTheme.value = saved || 'system'
})
</script>
