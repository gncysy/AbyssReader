<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>外观</h2>
    </header>

    <div class="subpage-body">
      <div class="theme-grid">
        <button
          v-for="theme in themeOptions"
          :key="theme.value"
          class="theme-card"
          :class="{ active: currentTheme === theme.value }"
          @click="setTheme(theme.value)"
        >
          <div class="theme-preview" :class="theme.value"></div>
          <span>{{ theme.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReadingStore } from '@/store'
import { THEME_OPTIONS } from '@shared/constants'

const readingStore = useReadingStore()
const currentTheme = computed({
  get: () => readingStore.theme,
  set: (val: string) => readingStore.setTheme(val),
})
const themeOptions = THEME_OPTIONS

function setTheme(value: string) {
  readingStore.setTheme(value)
  const root = document.documentElement
  if (value === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', value)
  }
  window.electronAPI?.invoke?.('update-title-bar-overlay', value).catch(() => {})
}
</script>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.theme-card {
  cursor: pointer;
  text-align: center;
  background: transparent;
  border: none;
  padding: 0;
  color: var(--text-secondary);
  transition: color 0.2s var(--ease-out);
}

.theme-card:hover .theme-preview {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.theme-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.theme-card.active .theme-preview {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.theme-card span {
  font-size: 13px;
  display: block;
  margin-top: 10px;
  font-weight: var(--font-medium);
  transition: color 0.2s var(--ease-out);
}

.theme-card.active span {
  color: var(--brand);
}

.theme-preview {
  height: 80px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-color);
  transition: transform 0.25s var(--ease-out), border-color 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
  overflow: hidden;
}

.theme-preview.dark {
  background: #1a1a1a;
}

.theme-preview.light {
  background: #f5f5f5;
}

.theme-preview.sepia {
  background: #f4ecd8;
}

.theme-preview.system {
  background: linear-gradient(to right, #1a1a1a 50%, #f5f5f5 50%);
  position: relative;
}

.theme-preview.system::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--brand);
  transform: translateX(-50%);
  border-radius: 1px;
}

@media (max-width: 480px) {
  .theme-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>