<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>关于</h2>
    </header>

    <div class="subpage-body">
      <div class="about-content">
        <div class="about-logo">
          <img src="/icons/icon.svg" alt="墨阅" class="logo-icon" />
          <span class="logo-name">墨阅</span>
        </div>
        <p class="about-version">v{{ appVersion }}</p>
        <p class="about-desc">桌面端小说阅读器 · 兼容开源阅读书源</p>
        <p class="about-license">GPL-3.0</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { APP_VERSION } from '@shared/constants'

const appVersion = APP_VERSION
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

.about-content {
  padding: 40px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-align: center;
}
.about-logo { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
.logo-icon { width: 48px; height: 48px; display: block; }
.logo-name { font-size: 24px; font-weight: 600; color: var(--text-primary); }
.about-version { font-size: 14px; color: var(--text-secondary); margin: 4px 0; }
.about-desc { font-size: 14px; color: var(--text-muted); margin: 4px 0; }
.about-license { font-size: 12px; color: var(--text-muted); opacity: 0.5; margin-top: 8px; }
</style>
