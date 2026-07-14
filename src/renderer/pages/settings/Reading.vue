<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>阅读</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">字体大小</span>
          <span class="label-desc">{{ fontSize }}px</span>
        </div>
        <div class="setting-control">
          <button class="size-btn" @click="decreaseFontSize">A−</button>
          <span class="size-value">{{ fontSize }}</span>
          <button class="size-btn" @click="increaseFontSize">A+</button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">行间距</span>
          <span class="label-desc">{{ lineHeight.toFixed(1) }}</span>
        </div>
        <div class="setting-control">
          <button class="size-btn" @click="decreaseLineHeight">−</button>
          <span class="size-value">{{ lineHeight.toFixed(1) }}</span>
          <button class="size-btn" @click="increaseLineHeight">+</button>
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

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}
.setting-item:last-child { border-bottom: none; }
.setting-label { display: flex; flex-direction: column; gap: 2px; }
.label-text { font-size: 15px; color: var(--text-primary); }
.label-desc { font-size: 13px; color: var(--text-muted); }

.setting-control { display: flex; align-items: center; gap: 8px; }
.size-btn {
  padding: 2px 12px;
  font-size: 15px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}
.size-btn:hover { border-color: var(--brand); }
.size-value {
  font-size: 15px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
}
</style>
