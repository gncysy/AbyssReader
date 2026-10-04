<template>
  <div class="rss-browser">
    <header v-no-drag class="browser-toolbar">
      <div class="toolbar-left">
        <button class="tb-btn" title="后退" @click="goBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button class="tb-btn" title="前进" @click="goForward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <button class="tb-btn" title="刷新" @click="reload">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
      <input
        v-model="urlInput"
        type="text"
        class="tb-url"
        spellcheck="false"
        @keyup.enter="navigateTo(urlInput)"
      />
      <button class="tb-btn tb-btn-close" title="关闭" @click="closeBrowser">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </header>
    <div ref="webviewContainer" class="browser-content">
      <div v-if="errorMessage" class="browser-error">
        <p class="error-title">Webview 创建失败</p>
        <p class="error-detail">{{ errorMessage }}</p>
        <button class="btn-secondary" @click="closeBrowser">返回</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Webview } from '@tauri-apps/api/webview'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'

const URL_POLL_INTERVAL_MS = 2000

const route = useRoute()
const router = useRouter()

const webviewContainer = ref<HTMLElement | null>(null)
const urlInput = ref('')
const errorMessage = ref('')
const webviewLabel = 'rss-browser-webview'

let externalWebview: Webview | null = null
let webviewReady = false
let containerResizeObserver: ResizeObserver | null = null
let urlMonitorInterval: ReturnType<typeof setInterval> | null = null
let lastKnownUrl = ''

const BLANK_TARGET_FIX_SCRIPT = `
(function() {
  function handleClick(e) {
    var target = e.target;
    while (target && target !== document && target !== document.body) {
      if (target.tagName === 'A' && target.getAttribute('target') === '_blank') {
        e.preventDefault();
        e.stopPropagation();
        var href = target.getAttribute('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          window.location.href = href;
        }
        return;
      }
      target = target.parentElement;
    }
  }
  if (window.__abyssClickHandler) {
    document.removeEventListener('click', window.__abyssClickHandler, true);
    window.removeEventListener('click', window.__abyssClickHandler, true);
  }
  window.__abyssClickHandler = handleClick;
  document.addEventListener('click', handleClick, true);
  window.addEventListener('click', handleClick, true);
})();
`

async function webviewAction(action: string, data: string): Promise<string> {
  try {
    return await invoke('embedded_webview_action', { label: webviewLabel, action, data })
  } catch (err: unknown) {
    errorMessage.value = `${action} 失败: ${(err as Error)?.message || String(err)}`
    return ''
  }
}

function injectBlankTargetFix(): void {
  webviewAction('eval', BLANK_TARGET_FIX_SCRIPT)
}

async function getCurrentUrl(): Promise<string> {
  const result = await webviewAction('get_url', '')
  if (result && !result.startsWith('noop:') && !result.startsWith('ok:')) {
    return result
  }
  return ''
}

async function monitorUrlChange(): Promise<void> {
  if (!webviewReady) return
  const currentUrl = await getCurrentUrl()
  if (currentUrl && currentUrl !== lastKnownUrl) {
    lastKnownUrl = currentUrl
    urlInput.value = currentUrl
    setTimeout(injectBlankTargetFix, 200)
  }
}

async function updateWebviewBounds(): Promise<void> {
  if (!webviewReady || !webviewContainer.value || !externalWebview) return
  try {
    const rect = webviewContainer.value.getBoundingClientRect()
    await externalWebview.setPosition(new LogicalPosition(rect.left, rect.top))
    await externalWebview.setSize(new LogicalSize(rect.width, rect.height))
  } catch (err: unknown) {
    errorMessage.value = `更新 Webview 边界失败: ${(err as Error)?.message || String(err)}`
  }
}

async function initWebview(): Promise<void> {
  await nextTick()
  if (!webviewContainer.value) return

  const initialUrl = (route.query.url as string) || 'about:blank'
  urlInput.value = initialUrl
  lastKnownUrl = initialUrl

  const windowInstance = getCurrentWebviewWindow()

  try {
    const existing = await Webview.getByLabel(webviewLabel)
    if (existing) await existing.close()
  } catch {
    // 未找到已存在的 webview，正常流程
  }

  try {
    const rect = webviewContainer.value.getBoundingClientRect()
    externalWebview = new Webview(windowInstance, webviewLabel, {
      url: initialUrl,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      focus: true,
      dragDropEnabled: true,
    })

    externalWebview.once('tauri://created', async () => {
      webviewReady = true
      errorMessage.value = ''
      await updateWebviewBounds()
      injectBlankTargetFix()
      // 降低轮询频率：2 秒
      urlMonitorInterval = setInterval(monitorUrlChange, URL_POLL_INTERVAL_MS)
    })

    externalWebview.once('tauri://error', (event: unknown) => {
      webviewReady = false
      externalWebview = null
      if (urlMonitorInterval) {
        clearInterval(urlMonitorInterval)
        urlMonitorInterval = null
      }
      const ev = event as { payload?: { message?: string } | string }
      errorMessage.value = typeof ev?.payload === 'string' ? ev.payload : (ev?.payload?.message || '未知错误')
    })

    setTimeout(() => {
      if (webviewReady && webviewContainer.value) {
        containerResizeObserver = new ResizeObserver(() => {
          updateWebviewBounds()
        })
        containerResizeObserver.observe(webviewContainer.value)
      }
    }, 500)
  } catch (err: unknown) {
    webviewReady = false
    externalWebview = null
    errorMessage.value = (err as Error)?.message || String(err)
  }
}

function goBack(): void {
  webviewAction('eval', 'history.back()')
}

function goForward(): void {
  webviewAction('eval', 'history.forward()')
}

function reload(): void {
  webviewAction('eval', 'location.reload()')
}

function navigateTo(url: string): void {
  if (!url) return
  const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url
  urlInput.value = fullUrl
  lastKnownUrl = fullUrl
  webviewAction('navigate', fullUrl)
}

function closeBrowser(): void {
  router.back()
}

onMounted(() => {
  initWebview()
})

onUnmounted(async () => {
  webviewReady = false
  if (urlMonitorInterval) {
    clearInterval(urlMonitorInterval)
    urlMonitorInterval = null
  }
  if (containerResizeObserver) {
    containerResizeObserver.disconnect()
    containerResizeObserver = null
  }
  if (externalWebview) {
    try {
      await externalWebview.close()
    } catch {
      // ignore
    }
    externalWebview = null
  }
})
</script>

<style scoped>
.rss-browser {
  position: fixed;
  inset: 0;
  z-index: 9900;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  height: 44px;
  box-sizing: border-box;
}

.toolbar-left {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tb-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.tb-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tb-btn-close:hover {
  background: rgba(231, 76, 60, 0.12);
  color: #e74c3c;
}

.tb-url {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.tb-url:focus {
  border-color: var(--brand);
}

.browser-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.browser-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 24px;
}

.error-title {
  font-size: 16px;
  font-weight: 600;
  color: #e74c3c;
  margin: 0;
}

.error-detail {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  word-break: break-all;
  text-align: center;
}
</style>
