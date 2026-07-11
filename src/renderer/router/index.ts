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
  // 404 路由
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

router.onError((error) => {
  console.error('[Router] 路由错误:', error)
})

export default router
