<template>
  <div class="settings-page">
    <header class="page-header">
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">偏好与配置</p>
    </header>

    <div class="settings-list">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="settings-item"
        @click="navigateTo(item.path)"
      >
        <div class="item-left">
          <span class="item-label">{{ item.label }}</span>
          <span class="item-desc">{{ item.desc }}</span>
        </div>
        <span class="item-arrow">›</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const menuItems = [
  { path: '/settings/appearance', label: '外观', desc: '深色 · 浅色 · 护眼 · 跟随系统' },
  { path: '/settings/reading', label: '阅读', desc: '字体大小 · 行间距' },
  { path: '/settings/data', label: '数据', desc: '本地备份 · 恢复 · 清空' },
  { path: '/settings/webdav', label: 'WebDAV 同步', desc: '与 Legado 无缝衔接' },
  { path: '/settings/about', label: '关于', desc: '版本信息' },
]

function navigateTo(path: string) {
  router.push(path).catch(() => {})
}
</script>

<style scoped>
.settings-page { padding: 24px 32px; max-width: 640px; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 600; color: var(--text-primary); margin: 0; }
.page-subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border-color);
}
.settings-item:last-child { border-bottom: none; }
.settings-item:hover { background: var(--bg-hover); }

.item-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}
.item-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  flex-shrink: 0;
  min-width: 90px;
}
.item-desc {
  font-size: 13px;
  color: var(--text-muted);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-arrow {
  font-size: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 8px;
}
</style>


