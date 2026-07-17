<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>阅读</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">字体大小</span>
          <span class="label-desc">{{ fontSize }}px</span>
        </div>
        <div class="setting-control">
          <button class="size-btn" @click="decreaseFontSize" aria-label="减小字体">A−</button>
          <span class="size-value">{{ fontSize }}</span>
          <button class="size-btn" @click="increaseFontSize" aria-label="增大字体">A+</button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">行间距</span>
          <span class="label-desc">{{ lineHeight.toFixed(1) }}</span>
        </div>
        <div class="setting-control">
          <button class="size-btn" @click="decreaseLineHeight" aria-label="减小行间距">−</button>
          <span class="size-value">{{ lineHeight.toFixed(1) }}</span>
          <button class="size-btn" @click="increaseLineHeight" aria-label="增大行间距">+</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReadingStore } from '@/store'

const readingStore = useReadingStore()

const fontSize = computed({
  get: () => readingStore.fontSize,
  set: (val: number) => readingStore.setFontSize(val),
})

const lineHeight = computed({
  get: () => readingStore.lineHeight,
  set: (val: number) => readingStore.setLineHeight(val),
})

function increaseFontSize() { readingStore.increaseFontSize() }
function decreaseFontSize() { readingStore.decreaseFontSize() }
function increaseLineHeight() { readingStore.increaseLineHeight() }
function decreaseLineHeight() { readingStore.decreaseLineHeight() }
</script>

<style scoped>
.size-btn {
  padding: 6px 14px;
  font-size: 15px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out), background 0.2s var(--ease-out);
  min-width: 42px;
  min-height: 34px;
  font-weight: var(--font-medium);
}

.size-btn:hover {
  border-color: var(--brand);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.size-btn:active {
  background: var(--bg-active);
}

.size-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.size-value {
  font-size: 15px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
  font-weight: var(--font-medium);
}
</style>