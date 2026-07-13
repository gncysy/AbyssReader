<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-message-provider>
      <n-notification-provider>
        <n-dialog-provider>
          <div class="app-shell" :data-theme="currentTheme" @dblclick="toggleMaximize">
            <!-- 标题栏 -->
            <div class="titlebar" :data-theme="currentTheme" @dblclick="toggleMaximize">
              <div class="titlebar-drag"></div>
              <div class="titlebar-actions">
                <button class="titlebar-btn" @click="minimize">─</button>
                <button class="titlebar-btn" @click="toggleMaximize">☐</button>
                <button class="titlebar-btn close" @click="closeWindow">✕</button>
              </div>
            </div>

            <!-- 主体 -->
            <div class="app-body">
              <nav class="app-sidebar">
                <div class="sidebar-logo">
                  <span class="logo-icon">墨</span>
                  <span class="logo-text">墨阅</span>
                </div>

                <div class="sidebar-menu">
                  <div
                    v-for="item in navItems"
                    :key="item.route"
                    class="nav-item"
                    :class="{ active: currentRoute === item.route }"
                    @click="navigate(item.route)"
                  >
                    <n-icon :size="20" class="nav-icon">
                      <component :is="item.icon" />
                    </n-icon>
                    <span class="nav-label">{{ item.label }}</span>
                  </div>
                </div>

                <div class="sidebar-footer">
                  <div class="footer-version">v{{ appVersion }}</div>
                </div>
              </nav>

              <main class="app-main">
                <div class="main-glow"></div>
                <router-view v-slot="{ Component }">
                  <transition name="page" mode="out-in">
                    <component :is="Component" />
                  </transition>
                </router-view>
              </main>
            </div>
          </div>

          <!-- 书籍详情浮窗（全局） -->
          <BookDetail
            v-if="bookshelfStore.showDetail"
            :book="bookshelfStore.detailBook!"
            :source="bookshelfStore.detailSource"
            @close="bookshelfStore.closeDetail()"
          />

          <!-- 阅读器（全屏） -->
          <Reader
            v-if="bookshelfStore.showReader"
            :book="bookshelfStore.readerBook!"
            :source="bookshelfStore.readerSource"
            @close="bookshelfStore.closeReader()"
          />
        </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, provide, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { darkTheme, lightTheme, zhCN, dateZhCN, NIcon } from 'naive-ui'
import {
  BookOutline,
  SearchOutline,
  CompassOutline,
  CloudOutline,
  SettingsOutline,
  AppsOutline,
} from '@vicons/ionicons5'
import { useBookshelfStore, useReadingStore } from '@/store'
import { ROUTES, APP_VERSION } from '@shared/constants'
import BookDetail from '@/components/BookDetail.vue'
import Reader from '@/components/Reader.vue'

const route = useRoute()
const router = useRouter()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()
const currentRoute = computed(() => route.name)

// ===== 从 Pinia 获取主题 =====
const currentTheme = computed({
  get: () => readingStore.theme,
  set: (val: string) => readingStore.setTheme(val),
})

const appVersion = APP_VERSION

// ===== 应用主题到 DOM =====
function applyThemeToDOM(theme: string) {
  const root = document.documentElement
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

function setTheme(theme: string) {
  readingStore.setTheme(theme)
  applyThemeToDOM(theme)
  updateTitleBar(theme)
}

// ===== 更新标题栏颜色 =====
function updateTitleBar(theme: string) {
  try {
    const api = window.electronAPI
    if (api && typeof api.invoke === 'function') {
      api.invoke('update-title-bar-overlay', theme).catch(() => {})
    }
  } catch {
    // 忽略错误
  }
}

provide('theme', {
  current: currentTheme,
  set: setTheme,
})

// ===== Naive UI 主题 =====
const theme = computed(() => {
  if (currentTheme.value === 'dark' || currentTheme.value === 'system') {
    return darkTheme
  }
  return lightTheme
})

const themeOverrides = {
  common: {
    primaryColor: '#d4a017',
    primaryColorHover: '#e8c547',
    primaryColorPressed: '#b8860b',
    primaryColorSuppl: '#d4a017',
  },
}

const navItems = [
  { route: ROUTES.BOOKSHELF, icon: BookOutline, label: '书架' },
  { route: ROUTES.SEARCH, icon: SearchOutline, label: '搜索' },
  { route: ROUTES.EXPLORE, icon: CompassOutline, label: '发现' },
  { route: ROUTES.MARKET, icon: CloudOutline, label: '书源市场' },
  { route: ROUTES.SOURCES, icon: AppsOutline, label: '书源管理' },
  { route: ROUTES.SETTINGS, icon: SettingsOutline, label: '设置' },
]

function navigate(routeName: string) {
  if (routeName !== currentRoute.value) {
    router.push({ name: routeName }).catch((err) => {
      console.error('[App] 导航错误:', err)
    })
  }
}

function minimize() {
  window.electronAPI?.minimizeWindow?.()
}

function toggleMaximize() {
  window.electronAPI?.toggleMaximizeWindow?.()
}

function closeWindow() {
  window.electronAPI?.closeWindow?.()
}

function handleSystemThemeChange(e: MediaQueryListEvent) {
  if (currentTheme.value === 'system') {
    applyThemeToDOM('system')
    updateTitleBar('system')
  }
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

// ===== 初始化 =====
async function initializeApp() {
  // 1. 加载设置
  await readingStore.loadSettings()
  
  // 2. 应用主题到 DOM
  applyThemeToDOM(currentTheme.value)
  
  // 3. 等待 DOM 渲染完成
  await nextTick()
  
  // 4. 延迟更新标题栏（确保 electronAPI 就绪）
  setTimeout(() => {
    updateTitleBar(currentTheme.value)
  }, 100)
  
  // 5. 再次延迟确保生效
  setTimeout(() => {
    updateTitleBar(currentTheme.value)
  }, 300)
}

onMounted(() => {
  initializeApp()

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  mediaListener = handleSystemThemeChange
  media.addEventListener('change', mediaListener)
})

onUnmounted(() => {
  if (mediaListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaListener)
    mediaListener = null
  }
})

watch(currentTheme, (val) => {
  applyThemeToDOM(val)
  updateTitleBar(val)
})
</script>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
  color: var(--text-primary);
  transition: background 0.3s, color 0.3s;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 36px;
  min-height: 36px;
  background: var(--bg);
  flex-shrink: 0;
  z-index: 20;
  transition: background 0.3s, color 0.3s;
  -webkit-app-region: drag;
  padding-right: 12px;
  position: relative;
}

.titlebar-drag {
  flex: 1;
  -webkit-app-region: drag;
  height: 100%;
  user-select: none;
}

.titlebar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  color: var(--text-secondary);
  -webkit-app-region: no-drag;
}
.titlebar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.titlebar-btn.close:hover {
  background: #e74c3c !important;
  color: white !important;
}

.app-body {
  display: flex;
  flex: 1;
  height: calc(100vh - 36px);
  overflow: hidden;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  min-width: 200px;
  padding: 24px 16px 20px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  height: 100%;
  transition: background 0.3s, border-color 0.3s;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 32px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
  transition: border-color 0.3s;
}

.logo-icon {
  font-size: 20px;
  font-weight: 700;
  color: var(--brand);
}
.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.08em;
}

.sidebar-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-menu .nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-muted);
}
.sidebar-menu .nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.sidebar-menu .nav-item.active {
  background: var(--bg-active);
  color: var(--brand);
}
.sidebar-menu .nav-item.active .nav-icon { color: var(--brand); }

.nav-icon { flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: 500; }

.sidebar-footer {
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
  transition: border-color 0.3s;
}
.footer-version {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.4;
  letter-spacing: 0.08em;
  text-align: center;
}

.app-main {
  flex: 1;
  position: relative;
  overflow-y: auto;
  padding: 32px 40px 40px;
  background: var(--bg);
  min-width: 0;
  height: 100%;
  transition: background 0.3s;
}

.main-glow {
  position: absolute;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, var(--brand-glow) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.page-enter-active, .page-leave-active {
  transition: opacity 0.28s cubic-bezier(0.2,0,0,1), transform 0.28s cubic-bezier(0.2,0,0,1);
}
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }

.app-main::-webkit-scrollbar { width: 4px; }
.app-main::-webkit-scrollbar-track { background: transparent; }
.app-main::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
.app-main::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>
