<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-notification-provider>
        <n-dialog-provider>
          <div class="app-shell" :data-theme="effectiveTheme">
            <div class="titlebar" :data-theme="effectiveTheme" @dblclick="toggleMaximize">
              <div class="titlebar-drag"><div class="titlebar-brand"><img src="/icons/icon.svg" alt="墨阅" class="titlebar-logo" /><span class="titlebar-name">墨阅</span></div></div>
              <div class="titlebar-controls">
                <button class="titlebar-btn" @click="minimizeWindow" title="最小化"><svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
                <button class="titlebar-btn" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
                  <svg v-if="!isMaximized" width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 14 14"><rect x="4.5" y="2" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="var(--bg-card)"/><rect x="2" y="4.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="var(--bg-card)"/></svg>
                </button>
                <button class="titlebar-btn titlebar-btn-close" @click="closeWindow" title="关闭"><svg width="14" height="14" viewBox="0 0 14 14"><line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="10.5" y1="3.5" x2="3.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
              </div>
            </div>
            <div class="app-body">
              <nav class="app-sidebar" aria-label="主导航">
                <div class="sidebar-menu" role="navigation">
                  <div v-for="item in navItems" :key="item.route" class="nav-item" :class="{ active: currentRoute === item.route }" role="button" @click="navigate(item.route)"><n-icon :size="20" class="nav-icon"><component :is="item.icon" /></n-icon><span class="nav-label">{{ item.label }}</span></div>
                </div>
                <div class="sidebar-spacer"></div>
                <SidebarCharacters :books-count="bookshelfStore.books.length" :today-read-count="readerStore.todayReadCount" :theme="readingStore.theme" @toggle-theme="(v: string) => readingStore.setTheme(v)" @open-book="openRandomBook" />
                <div class="sidebar-footer"><div class="footer-version">v{{ appVersion }}</div></div>
              </nav>
              <main class="app-main">
                <router-view v-slot="{ Component }">
                  <transition name="page" mode="out-in"><component :is="Component" /></transition>
                </router-view>
                <DownloadConfirm ref="downloadConfirm" />
              </main>
            </div>
            <VerificationCodeDialog ref="verificationDialog" />
            <PhotoViewer ref="photoViewer" />
          </div>
        </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onErrorCaptured } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NConfigProvider, NMessageProvider, NNotificationProvider, NDialogProvider, NIcon, zhCN, dateZhCN } from 'naive-ui'
import { BookOutline, SearchOutline, CompassOutline, ShareSocialOutline, SettingsOutline, AppsOutline } from '@vicons/ionicons5'
import { useBookshelfStore, useReadingStore, useReaderStore } from '@/stores'
import { ROUTES, APP_VERSION, UI } from '@/constants/index.js'
import { initLogBridge } from '@engine/log/index.js'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import SidebarCharacters from '@/components/characters/SidebarCharacters.vue'
import DownloadConfirm from '@/components/rss/DownloadConfirm.vue'
import VerificationCodeDialog from '@/components/common/VerificationCodeDialog.vue'
import PhotoViewer from '@/components/photo/PhotoViewer.vue'
import { windowApi } from '@/services/window.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import type { Book } from '@/types'

const route = useRoute()
const router = useRouter()
const bookshelfStore = useBookshelfStore()
const readingStore = useReadingStore()
const readerStore = useReaderStore()
const currentRoute = computed(() => route.name)
const { handleSilent } = useErrorHandler()

const { naiveTheme, themeOverrides } = useNaiveTheme()

onErrorCaptured((err, _instance, info) => {
  handleSilent(err, {
    module: 'ui',
    operation: `render:${info}`,
    userMessage: '页面渲染异常，请刷新重试',
  })
  return false
})

function resolveEffectiveTheme(theme: string): string {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return theme
}

const initialResolved = resolveEffectiveTheme(readingStore.theme)
document.documentElement.setAttribute('data-theme', initialResolved)

const appVersion = APP_VERSION
const effectiveTheme = ref(initialResolved)
const isMaximized = ref(false)
const downloadConfirm = ref<InstanceType<typeof DownloadConfirm> | null>(null)
const verificationDialog = ref<InstanceType<typeof VerificationCodeDialog> | null>(null)
const photoViewer = ref<InstanceType<typeof PhotoViewer> | null>(null)

function applyThemeToDOM(theme: string): void {
  const resolved = resolveEffectiveTheme(theme)
  document.documentElement.setAttribute('data-theme', resolved)
  effectiveTheme.value = resolved
}

const navItems = [
  { route: ROUTES.BOOKSHELF, icon: BookOutline, label: '书架' }, { route: ROUTES.SEARCH, icon: SearchOutline, label: '搜索' },
  { route: ROUTES.EXPLORE, icon: CompassOutline, label: '发现' }, { route: 'rss', icon: ShareSocialOutline, label: '订阅' },
  { route: ROUTES.SOURCES, icon: AppsOutline, label: '书源管理' }, { route: ROUTES.SETTINGS, icon: SettingsOutline, label: '设置' },
]

function openRandomBook(): void {
  const books = bookshelfStore.books
  if (books.length > 0) {
    const idx = Math.floor(Math.random() * books.length)
    const book = books[idx]
    if (book) {
      bookshelfStore.openDetail(book as Book, null)
    }
  }
}
function navigate(routeName: string): void { if (routeName !== currentRoute.value) router.push({ name: routeName }).catch(() => {}) }
function minimizeWindow(): void { windowApi.minimize() }
async function toggleMaximize(): Promise<void> { isMaximized.value = await windowApi.toggleMaximize() }
async function updateMaximizedState(): Promise<void> { isMaximized.value = await windowApi.isMaximized() }
function closeWindow(): void { windowApi.close() }
function handleSystemThemeChange(): void { if (readingStore.theme === 'system') applyThemeToDOM('system') }

let mediaQuery: MediaQueryList | null = null
let unlistenRss: (() => void) | null = null
let unlistenVerification: (() => void) | null = null
let unlistenShowPhoto: (() => void) | null = null
let unlistenRefreshExplore: (() => void) | null = null
let unlistenRefreshBookInfo: (() => void) | null = null
let unlistenJsSearchBook: (() => void) | null = null

onMounted(async () => {
  await initLogBridge()
  await readingStore.loadSettings()
  await readerStore.loadSettings()
  applyThemeToDOM(readingStore.theme)
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)'); mediaQuery.addEventListener('change', handleSystemThemeChange)
  await updateMaximizedState(); window.addEventListener('resize', updateMaximizedState)

  unlistenRss = await windowApi.listenRssDownload((payload) => {
    if (payload.error) {
      downloadConfirm.value?.show({ url: '', resourceType: 'error', message: payload.message } as Parameters<typeof downloadConfirm.value.show>[0])
    } else {
      downloadConfirm.value?.show(payload as unknown as Parameters<typeof downloadConfirm.value.show>[0])
    }
  })

  unlistenVerification = await windowApi.listenVerificationCodeRequest((svg) => {
    verificationDialog.value?.open(svg)
  })

  unlistenShowPhoto = await windowApi.listenShowPhoto((src) => {
    photoViewer.value?.open(src)
  })

  unlistenRefreshExplore = await windowApi.listenRefreshExplore(() => {
    if (currentRoute.value === ROUTES.EXPLORE) {
      window.dispatchEvent(new CustomEvent('refresh-explore-event'))
    }
  })

  unlistenRefreshBookInfo = await windowApi.listenRefreshBookInfo(() => {
    window.dispatchEvent(new CustomEvent('refresh-book-info-event'))
  })

  unlistenJsSearchBook = await windowApi.listenJsSearchBook((payload) => {
    if (payload?.keyword) {
      router.push({ name: ROUTES.SEARCH, query: { keyword: payload.keyword } }).catch(() => {})
    }
  })
})

onUnmounted(() => {
  if (mediaQuery) mediaQuery.removeEventListener('change', handleSystemThemeChange)
  window.removeEventListener('resize', updateMaximizedState)
  if (unlistenRss) unlistenRss()
  if (unlistenVerification) unlistenVerification()
  if (unlistenShowPhoto) unlistenShowPhoto()
  if (unlistenRefreshExplore) unlistenRefreshExplore()
  if (unlistenRefreshBookInfo) unlistenRefreshBookInfo()
  if (unlistenJsSearchBook) unlistenJsSearchBook()
})
watch(() => readingStore.theme, (val) => applyThemeToDOM(val))
</script>

<style scoped>
.app-shell { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--bg-card); color: var(--text-primary); transition: background 0.3s ease, color 0.3s ease; }
.titlebar { display: flex; align-items: stretch; height: 40px; min-height: 40px; background: var(--bg-card); flex-shrink: 0; z-index: 20; }
.titlebar-drag { flex: 1; height: 100%; user-select: none; -webkit-app-region: drag; }
.titlebar-brand { display: flex; align-items: center; gap: 10px; height: 100%; padding-left: 12px; }
.titlebar-logo { width: 26px; height: 26px; flex-shrink: 0; }
.titlebar-name { font-size: 15px; font-weight: 600; color: var(--text-primary); letter-spacing: 0.04em; }
.titlebar-controls { display: flex; gap: 0; flex-shrink: 0; height: 100%; -webkit-app-region: no-drag; }
.titlebar-btn { width: 46px; height: 100%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.titlebar-btn svg { opacity: 0.7; }
.titlebar-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.titlebar-btn-close:hover { background: #c0392b; color: #fff; }
.app-body { display: flex; flex: 1; height: calc(100vh - 40px); overflow: hidden; }
.app-sidebar { display: flex; flex-direction: column; width: 200px; min-width: 200px; padding: 4px 16px 20px 16px; background: var(--bg-card); border-right: 1px solid var(--border-color); flex-shrink: 0; height: 100%; box-sizing: border-box; }
.sidebar-menu { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 12px; border-radius: var(--radius-md); cursor: pointer; min-height: 48px; transition: background 0.2s, color 0.2s; color: var(--text-muted); }
.nav-item:hover { background: var(--bg-hover); color: var(--text-secondary); }
.nav-item.active { background: var(--bg-active); color: var(--brand); font-weight: 500; }
.nav-icon { flex-shrink: 0; }
.nav-label { font-size: 14px; font-weight: 500; }
.sidebar-spacer { flex: 1; }
.sidebar-footer { padding: 12px 0 0 0; border-top: 1px solid var(--border-color); text-align: center; flex-shrink: 0; }
.footer-version { font-size: 12px; color: var(--text-muted); opacity: 0.45; }
.app-main { flex: 1; position: relative; overflow-y: auto; padding: 32px 40px 40px; background: var(--bg); min-width: 0; height: 100%; box-sizing: border-box; }
.page-enter-active, .page-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
