<template>
  <div class="settings-page">
    <header class="page-header">
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">偏好与配置</p>
    </header>

    <div class="settings-list" role="list" aria-label="设置菜单">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="settings-item"
        role="listitem"
        tabindex="0"
        @click="navigateTo(item.path)"
        @keydown.enter="navigateTo(item.path)"
        @keydown.space.prevent="navigateTo(item.path)"
      >
        <div class="item-left">
          <span class="item-label">{{ item.label }}</span>
          <span class="item-desc">{{ item.desc }}</span>
        </div>
        <span class="item-arrow" aria-hidden="true">›</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const menuItems = [
  { path: '/settings/appearance', label: '外观', desc: '深色 / 浅色 / 护眼 / 跟随系统' },
  { path: '/settings/reading', label: '阅读', desc: '字体大小 / 行间距' },
  { path: '/settings/data', label: '数据', desc: '本地备份 / 恢复 / 清空' },
  { path: '/settings/webdav', label: 'WebDAV 同步', desc: '与 Legado 无缝衔接' },
  { path: '/settings/about', label: '关于', desc: '版本信息' },
  { path: '/settings/replaceRules', label: '替换规则', desc: '正则/文本替换净化正文' },
]

function navigateTo(path: string) {
  router.push(path).catch(() => {})
}
</script>

<style scoped>
.settings-page {
  padding: 28px 36px;
  max-width: 680px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s var(--ease-out);
  border-bottom: 1px solid var(--border-color);
  min-height: 52px;
  position: relative;
}

.settings-item:last-child {
  border-bottom: none;
}

.settings-item:hover {
  background: var(--bg-hover);
}

.settings-item:active {
  background: var(--bg-active);
}

.settings-item:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.item-label {
  font-size: 15px;
  font-weight: var(--font-medium);
  color: var(--text-primary);
  flex-shrink: 0;
  min-width: 90px;
  line-height: 1.4;
}

.item-desc {
  font-size: 13px;
  color: var(--text-muted);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.item-arrow {
  font-size: 20px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 12px;
  font-weight: 300;
  transition: color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.settings-item:hover .item-arrow {
  color: var(--brand);
  transform: translateX(2px);
}
</style>