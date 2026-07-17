import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/bookshelf',
  },
  {
    path: '/bookshelf',
    name: 'bookshelf',
    component: () => import('@/pages/Bookshelf.vue'),
    meta: { title: '书架' },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/pages/Search.vue'),
    meta: { title: '搜索' },
  },
  {
    path: '/explore',
    name: 'explore',
    component: () => import('@/pages/Explore.vue'),
    meta: { title: '发现' },
  },
  {
    path: '/market',
    name: 'market',
    component: () => import('@/pages/Market.vue'),
    meta: { title: '书源市场' },
  },
  {
    path: '/sources',
    name: 'sources',
    component: () => import('@/pages/SourceManager.vue'),
    meta: { title: '书源管理' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/Settings.vue'),
    meta: { title: '设置' },
  },
  // 设置子页面
  {
    path: '/settings/appearance',
    name: 'settings-appearance',
    component: () => import('@/pages/settings/Appearance.vue'),
    meta: { title: '外观' },
  },
  {
    path: '/settings/reading',
    name: 'settings-reading',
    component: () => import('@/pages/settings/Reading.vue'),
    meta: { title: '阅读' },
  },
  {
    path: '/settings/data',
    name: 'settings-data',
    component: () => import('@/pages/settings/Data.vue'),
    meta: { title: '数据' },
  },
  {
    path: '/settings/webdav',
    name: 'settings-webdav',
    component: () => import('@/pages/settings/WebDAV.vue'),
    meta: { title: 'WebDAV' },
  },
  {
    path: '/settings/replaceRules', name: 'replaceRules', component: () => import('@/pages/settings/ReplaceRules.vue') },
  { path: '/settings/about',
    name: 'settings-about',
    component: () => import('@/pages/settings/About.vue'),
    meta: { title: '关于' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/bookshelf',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to, from, next) => {
  const title = to.meta?.title || '墨阅'
  document.title = `墨阅 · ${title}`
  next()
})

export default router

