import { createApp } from 'vue'
import { pinia } from './store'
import App from './App.vue'
import router from './router'
import naive from 'naive-ui'
import './styles/index.css'

console.log('[App] electronAPI available:', !!window.electronAPI)

// ============================================
// 在应用启动前，读取已保存的主题并应用到加载页面
// ============================================
async function applySavedTheme() {
  try {
    // 从 store 读取已保存的主题设置
    const settings = await window.electronAPI.store.get('readerSettings')
    const theme = settings?.theme || 'dark'
    
    // 应用到 html 根元素
    const root = document.documentElement
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', isDark ? 'dark' : 'light')
    } else {
      root.setAttribute('data-theme', theme)
    }
    
    console.log('[App] 加载页面主题已应用:', theme)
  } catch (err) {
    console.warn('[App] 读取主题失败，使用默认深色:', err)
    // 默认深色
    document.documentElement.setAttribute('data-theme', 'dark')
  }
}

// 立即执行，让加载页面变色
applySavedTheme()

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(naive)

app.mount('#app')

// 移除加载动画
const loadingEl = document.getElementById('app-loading')
if (loadingEl) {
  loadingEl.classList.add('hidden')
  setTimeout(() => {
    if (loadingEl.parentNode) {
      loadingEl.remove()
    }
  }, 600)
}

console.log('[App] 墨阅启动成功')
