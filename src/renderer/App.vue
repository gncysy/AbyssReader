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
          <div class="app-shell" :data-theme="effectiveTheme" @dblclick="toggleMaximize">
            <div class="titlebar" :data-theme="effectiveTheme">
              <div class="titlebar-drag"></div>
            </div>

            <div class="app-body">
              <nav class="app-sidebar" aria-label="主导航">
                <div class="sidebar-logo">
                  <img src="/icons/icon.svg" alt="墨阅" class="logo-icon" />
                  <span class="logo-text">墨阅</span>
                </div>
                <div class="sidebar-menu" role="navigation">
                  <div
                    v-for="item in navItems"
                    :key="item.route"
                    class="nav-item"
                    :class="{ active: currentRoute === item.route }"
                    role="button"
                    :tabindex="currentRoute === item.route ? -1 : 0"
                    :aria-current="currentRoute === item.route ? 'page' : undefined"
                    @click="navigate(item.route)"
                    @keydown.enter="navigate(item.route)"
                    @keydown.space.prevent="navigate(item.route)"
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

          <BookDetail
            v-if="bookshelfStore.showDetail"
            :book="bookshelfStore.detailBook!"
            :source="bookshelfStore.detailSource"
            @close="bookshelfStore.closeDetail()"
          />
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
  BookOutline, SearchOutline, CompassOutline, CloudOutline,
  SettingsOutline, AppsOutline,
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

const currentTheme = computed({
  get: () => readingStore.theme,
  set: (val: string) => readingStore.setTheme(val),
})

const appVersion = APP_VERSION
const effectiveTheme = ref('dark')

function resolveEffectiveTheme(theme: string): string {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return theme
}

function applyThemeToDOM(theme: string) {
  const resolved = resolveEffectiveTheme(theme)
  document.documentElement.setAttribute('data-theme', resolved)
  effectiveTheme.value = resolved
}

function setTheme(theme: string) {
  readingStore.setTheme(theme)
  applyThemeToDOM(theme)
  updateTitleBar(theme)
}

function updateTitleBar(theme: string) {
  try {
    const api = window.electronAPI
    if (api && typeof api.invoke === 'function') {
      nextTick(() => {
        const style = getComputedStyle(document.documentElement)
        const bgCard = style.getPropertyValue('--bg-card').trim()
        const textPrimary = style.getPropertyValue('--text-primary').trim()
        
        api.invoke('update-title-bar-overlay', {
          theme: theme,
          backgroundColor: bgCard,
          symbolColor: textPrimary,
        }).catch(() => {})
      })
    }
  } catch {}
}

provide('theme', { current: currentTheme, set: setTheme })

const theme = computed(() => {
  if (currentTheme.value === 'dark' || currentTheme.value === 'system') return darkTheme
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

function toggleMaximize() { window.electronAPI?.toggleMaximizeWindow?.() }

function handleSystemThemeChange() {
  if (currentTheme.value === 'system') {
    applyThemeToDOM('system')
    updateTitleBar('system')
  }
}

let mediaQuery: MediaQueryList | null = null

async function initializeApp() {
  await readingStore.loadSettings()
  applyThemeToDOM(currentTheme.value)
  await nextTick()
  setTimeout(() => updateTitleBar(currentTheme.value), 100)
  setTimeout(() => updateTitleBar(currentTheme.value), 300)
}

onMounted(() => {
  initializeApp()
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleSystemThemeChange)
})

onUnmounted(() => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleSystemThemeChange)
    mediaQuery = null
  }
})

watch(currentTheme, (val) => {
  applyThemeToDOM(val)
  updateTitleBar(val)
})
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background 0.3s var(--ease-out), color 0.3s var(--ease-out);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.titlebar {
  display: flex;
  align-items: center;
  height: 40px;
  min-height: 40px;
  background: var(--bg-card);
  flex-shrink: 0;
  z-index: 20;
  transition: background 0.3s var(--ease-out);
  -webkit-app-region: drag;
}

.titlebar-drag {
  flex: 1;
  -webkit-app-region: drag;
  height: 100%;
  user-select: none;
}

.app-body {
  display: flex;
  flex: 1;
  height: calc(100vh - 40px);
  overflow: hidden;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  min-width: 200px;
  padding: 20px 16px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  height: 100%;
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 28px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
  transition: border-color 0.3s var(--ease-out);
}

.logo-icon { width: 28px; height: 28px; display: block; flex-shrink: 0; }
.logo-text { font-size: 16px; font-weight: var(--font-semibold); color: var(--text-primary); letter-spacing: 0.04em; }

.sidebar-menu { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out);
  color: var(--text-muted); min-height: 44px;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-secondary); }
.nav-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.nav-item.active { background: var(--bg-active); color: var(--brand); font-weight: var(--font-medium); }
.nav-item.active .nav-icon { color: var(--brand); }
.nav-icon { flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: var(--font-medium); }

.sidebar-footer { padding-top: 16px; border-top: 1px solid var(--border-color); margin-top: auto; transition: border-color 0.3s var(--ease-out); }
.footer-version { font-size: 12px; color: var(--text-muted); opacity: 0.45; letter-spacing: 0.04em; text-align: center; }

.app-main {
  flex: 1; position: relative; overflow-y: auto;
  padding: 32px 40px 40px; background: var(--bg); min-width: 0; height: 100%;
  transition: background 0.3s var(--ease-out);
}
.main-glow {
  position: absolute; top: -120px; left: 50%; transform: translateX(-50%);
  width: 600px; height: 300px;
  background: radial-gradient(ellipse, rgba(212,160,23,0.06) 0%, transparent 70%);
  pointer-events: none; z-index: 0;
}

.page-enter-active, .page-leave-active {
  transition: opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out);
}
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-6px); }
</style>