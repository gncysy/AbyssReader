<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>外观</h2>
    </header>

    <div class="subpage-body">
      <div class="theme-grid">
        <div
          v-for="theme in themeOptions"
          :key="theme.value"
          class="theme-card"
          :class="{ active: currentTheme === theme.value }"
          @click="setTheme(theme.value)"
        >
          <div class="theme-preview" :class="theme.value"></div>
          <span>{{ theme.label }}</span>
        </div>
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
.settings-subpage { padding: 24px 32px; max-width: 640px; }
.subpage-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}
.subpage-header h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.btn-back {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}
.btn-back:hover { color: var(--text-primary); }

.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.theme-card {
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}
.theme-card:hover .theme-preview { transform: translateY(-2px); }
.theme-card.active .theme-preview {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand);
}
.theme-card span {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 8px;
  display: block;
}
.theme-card.active span { color: var(--brand); }

.theme-preview {
  height: 72px;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.2s;
  overflow: hidden;
}
.theme-preview.dark { background: #1a1a1a; }
.theme-preview.light { background: #f0ede8; }
.theme-preview.sepia { background: #e8dcc8; }
.theme-preview.system {
  background: linear-gradient(135deg, #1a1a1a 50%, #f0ede8 50%);
}
</style>
