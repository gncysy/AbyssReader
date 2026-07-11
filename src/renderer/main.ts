import { createApp } from 'vue'
import { pinia } from './store'
import App from './App.vue'
import router from './router'
import naive from 'naive-ui'
import './styles/index.css'

console.log('[App] electronAPI available:', !!window.electronAPI)

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
