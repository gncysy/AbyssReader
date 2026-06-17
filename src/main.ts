import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

// 初始化主题
function initTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'light') {
    document.documentElement.classList.remove('dark')
  } else if (saved === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
}

initTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

// 隐藏加载界面
const loadingEl = document.getElementById('app-loading')
if (loadingEl) {
  loadingEl.classList.add('hidden')
  setTimeout(() => {
    if (loadingEl.parentNode) {
      loadingEl.remove()
    }
  }, 600)
}

console.log('🚀 墨阅 启动成功')
