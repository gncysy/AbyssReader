<template>
  <Teleport to="body">
    <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
      <Transition name="login-dialog">
        <div v-if="visible" v-no-drag class="login-overlay" role="dialog" aria-modal="true" @click.self="handleClose">
          <div class="login-container">
            <header class="login-header">
              <h2 class="login-title">登录 - {{ sourceName }}</h2>
              <div class="login-status" :class="statusClass">{{ statusText }}</div>
              <button class="btn-close" aria-label="关闭" @click="handleClose">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div class="login-body">
              <div v-if="loading" class="login-loading">
                <LoadingSpinner />
                <span>加载登录界面...</span>
              </div>

              <div v-else-if="rows.length === 0" class="login-empty">
                <p>该登录界面没有可用的控件</p>
              </div>

              <div v-else class="login-rows">
                <div v-for="(row, idx) in rows" :key="idx" class="login-row" :class="'login-row-' + row.type">
                  <template v-if="row.type === 'text'">
                    <label class="login-label">{{ getResolvedViewName(row) }}</label>
                    <input
                      :value="formData[row.name] || ''"
                      type="text"
                      class="login-input"
                      :placeholder="row.name"
                      @input="onTextInput(row, ($event.target as HTMLInputElement).value)"
                    />
                  </template>

                  <template v-else-if="row.type === 'password'">
                    <label class="login-label">{{ getResolvedViewName(row) }}</label>
                    <input
                      :value="formData[row.name] || ''"
                      type="password"
                      class="login-input"
                      :placeholder="row.name"
                      @input="onTextInput(row, ($event.target as HTMLInputElement).value)"
                    />
                  </template>

                  <template v-else-if="row.type === 'select'">
                    <label class="login-label">{{ getResolvedViewName(row) }}</label>
                    <select
                      :value="formData[row.name]"
                      class="login-select"
                      @change="onSelectChange(row, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="c in (row.chars || [])" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </template>

                  <template v-else-if="row.type === 'toggle'">
                    <button class="login-toggle" @click="onToggleClick(row)">
                      <span class="toggle-char">{{ getToggleChar(row) }}</span>
                      <span class="toggle-label">{{ getResolvedViewName(row) }}</span>
                    </button>
                  </template>

                  <template v-else-if="row.type === 'button'">
                    <button
                      class="login-button"
                      :disabled="executingIdx === idx"
                      @click="onButtonClick(row, idx, false)"
                      @contextmenu.prevent="onButtonClick(row, idx, true)"
                    >
                      {{ executingIdx === idx ? '执行中...' : getResolvedViewName(row) }}
                    </button>
                  </template>
                </div>
              </div>

              <div v-if="lastMessage" class="login-message" :class="lastMessageClass">
                {{ lastMessage }}
              </div>
            </div>

            <footer class="login-footer">
              <button class="btn-secondary" @click="handleClose">关闭</button>
              <button class="btn-secondary" :disabled="checking" @click="doCheckStatus">
                {{ checking ? '检测中...' : '检测登录状态' }}
              </button>
              <button class="btn-primary" :disabled="saving" @click="doLogin">
                {{ saving ? '保存中...' : '确认' }}
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </n-config-provider>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { NConfigProvider, useMessage } from 'naive-ui'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import {
  executeLoginAction,
  parseLoginUi,
  checkLoginStatus,
  saveLoginInfo,
  resolveAllViewNames,
  invokeLoginJs,
} from '@/services/source-login.js'
import { loginWebview } from '@/services/network.js'
import { windowApi } from '@/services/window.js'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { LOGIN } from '@/constants/login.js'
import type { BookSource } from '@/types'
import type { SourceLoginRowUi } from '@/types/source-login.js'
import type { UnlistenFn } from '@tauri-apps/api/event'

const msg = useMessage()
const { naiveTheme, themeOverrides } = useNaiveTheme()

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const checking = ref(false)
const executingIdx = ref(-1)
const rows = ref<SourceLoginRowUi[]>([])
const formData = reactive<Record<string, string>>({})
const source = ref<BookSource | null>(null)
const book = ref<Record<string, unknown> | null>(null)
const chapter = ref<Record<string, unknown> | null>(null)

const statusText = ref('未检测')
const statusClass = ref('status-unknown')
const lastMessage = ref('')
const lastMessageClass = ref('')

const confirmed = ref(false)

const sourceName = computed(() => {
  const s = source.value as unknown as Record<string, unknown> | null
  return s && typeof s.bookSourceName === 'string' ? s.bookSourceName : '书源'
})

function getResolvedViewName(row: SourceLoginRowUi): string {
  const resolved = (row as SourceLoginRowUi & { resolvedViewName?: string }).resolvedViewName
  if (resolved) return resolved
  const viewName = row.viewName
  if (!viewName) return row.name
  const trimmed = viewName.trim()
  if (trimmed.length >= 3 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return row.name
}

function getToggleChar(row: SourceLoginRowUi): string {
  const current = formData[row.name] || ''
  const chars = row.chars && row.chars.length > 0 ? row.chars : ['']
  return current || chars[0] || ''
}

/**
 * 修复：v-model 绑定动态 key 时，如果 formData[row.name] 未初始化，
 * Vue 的响应式系统不会追踪新 key 的写入，导致输入值丢失。
 * 改用 :value + @input 手动赋值，并在赋值时确保 key 已存在。
 */
function onTextInput(row: SourceLoginRowUi, value: string): void {
  formData[row.name] = value
  onTextChange(row)
}

async function refreshViewNames(): Promise<void> {
  if (!source.value || rows.value.length === 0) return
  try {
    await resolveAllViewNames(source.value, rows.value, { ...formData })
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    console.warn('[登录] viewName 求值失败:', errorMsg)
  }
}

/**
 * 诊断：把当前 formData 的 key 和值通过书源 JS 的 java.toast 输出。
 * 临时方法，用于排查 result 传值问题。
 */
async function debugFormData(): Promise<void> {
  if (!source.value) return
  const snapshot = { ...formData }
  const keys = Object.keys(snapshot).join(' | ')
  const deviceId = snapshot['设备ID'] || '(空)'
  const iid = snapshot['安装ID'] || '(空)'
  const debugCode = 'java.longToast("DEBUG formData: keys=[" + ' + JSON.stringify(keys) + ' + "] 设备ID=[" + ' + JSON.stringify(deviceId) + ' + "] 安装ID=[" + ' + JSON.stringify(iid) + ' + "]");'
  try {
    await invokeLoginJs(debugCode, {
      source: source.value,
      result: snapshot,
      book: book.value || {},
      chapter: chapter.value || {},
      isLongClick: false,
      baseUrl: source.value.bookSourceUrl || '',
    }, 5000)
  } catch {
    // ignore
  }
}

async function onButtonClick(row: SourceLoginRowUi, idx: number, isLongClick: boolean): Promise<void> {
  const action = row.action
  if (!action) {
    msg.warning('该按钮没有绑定动作')
    return
  }
  // 诊断：先输出 formData
  await debugFormData()
  await executeAction(action, idx, isLongClick)
}

async function onToggleClick(row: SourceLoginRowUi): Promise<void> {
  const chars = row.chars && row.chars.length > 0 ? row.chars : ['']
  const current = formData[row.name] || chars[0] || ''
  const currentIdx = chars.indexOf(current)
  const nextIdx = (currentIdx + 1) % chars.length
  const next = chars[nextIdx] || ''
  formData[row.name] = next
  if (row.action) {
    await executeAction(row.action, -1, false)
  }
}

async function onSelectChange(row: SourceLoginRowUi, val: string): Promise<void> {
  formData[row.name] = val
  if (row.action) {
    await executeAction(row.action, -1, false)
  }
}

async function onTextChange(row: SourceLoginRowUi): Promise<void> {
  if (!row.action) return
  if (textChangeTimer) clearTimeout(textChangeTimer)
  textChangeTimer = setTimeout(() => {
    executeAction(row.action!, -1, false)
    textChangeTimer = null
  }, 600)
}

let textChangeTimer: ReturnType<typeof setTimeout> | null = null

async function executeAction(action: string, idx: number, isLongClick: boolean): Promise<void> {
  if (!source.value) return
  executingIdx.value = idx
  lastMessage.value = ''
  try {
    if (/^https?:\/\//i.test(action.trim())) {
      await loginWebview(action.trim(), sourceName.value, LOGIN.WEBVIEW_TIMEOUT_SECS)
      await doCheckStatus()
      return
    }

    const result = await executeLoginAction(
      source.value,
      action,
      { ...formData },
      book.value,
      chapter.value,
      isLongClick,
    )

    if (result.success) {
      lastMessage.value = result.result || '执行成功'
      lastMessageClass.value = 'message-success'
      await doCheckStatus()
    } else {
      lastMessage.value = result.error || '执行失败'
      lastMessageClass.value = 'message-error'
    }
  } finally {
    executingIdx.value = -1
  }
}

async function doCheckStatus(): Promise<void> {
  if (!source.value) return
  checking.value = true
  try {
    const ok = await checkLoginStatus(source.value)
    if (ok) {
      statusText.value = '已登录'
      statusClass.value = 'status-ok'
    } else {
      statusText.value = '未登录'
      statusClass.value = 'status-fail'
    }
  } finally {
    checking.value = false
  }
}

async function doLogin(): Promise<void> {
  if (!source.value) return
  saving.value = true
  lastMessage.value = ''
  try {
    const hasData = Object.keys(formData).length > 0
    if (!hasData) {
      await saveLoginInfo(source.value, {})
      confirmed.value = true
      visible.value = false
      return
    }

    await saveLoginInfo(source.value, { ...formData })

    const loginAction = "if (typeof login=='function'){ login.apply(this); } else { throw('Function login not implements!!!') }"
    const result = await executeLoginAction(
      source.value,
      loginAction,
      { ...formData },
      book.value,
      chapter.value,
      false,
    )

    if (result.success) {
      confirmed.value = true
      msg.success('登录成功')
      visible.value = false
    } else {
      lastMessage.value = '登录出错\n' + (result.error || '未知错误')
      lastMessageClass.value = 'message-error'
      msg.warning('登录动作失败: ' + (result.error || '未知错误'))
    }
  } finally {
    saving.value = false
  }
}

async function open(s: BookSource, b?: Record<string, unknown> | null, c?: Record<string, unknown> | null): Promise<void> {
  source.value = s
  book.value = b || null
  chapter.value = c || null
  confirmed.value = false

  const loginUi = typeof s.loginUi === 'string' ? s.loginUi.trim() : ''
  if (!loginUi) {
    const loginUrl = typeof s.loginUrl === 'string' ? s.loginUrl : ''
    if (!loginUrl) {
      msg.warning('书源未配置 loginUrl')
      return
    }
    visible.value = false
    try {
      await loginWebview(loginUrl, s.bookSourceName || '登录', LOGIN.WEBVIEW_TIMEOUT_SECS)
      msg.success('登录窗口已关闭')
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      msg.error('登录失败: ' + errorMsg)
    }
    return
  }

  visible.value = true
  loading.value = true
  rows.value = []
  for (const key of Object.keys(formData)) {
    delete formData[key]
  }
  statusText.value = '未检测'
  statusClass.value = 'status-unknown'
  lastMessage.value = ''

  try {
    const parsed = await parseLoginUi(s)
    if (!parsed) {
      msg.error('解析登录界面失败')
      loading.value = false
      return
    }
    rows.value = parsed.rows
    for (const [k, v] of Object.entries(parsed.formData)) {
      formData[k] = v
    }

    await refreshViewNames()

    await new Promise((r) => setTimeout(r, LOGIN.AUTO_CHECK_DELAY_MS))
    await doCheckStatus()
  } finally {
    loading.value = false
  }
}

async function handleClose(): Promise<void> {
  if (textChangeTimer) {
    clearTimeout(textChangeTimer)
    textChangeTimer = null
  }

  if (source.value && !confirmed.value) {
    try {
      const hasData = Object.keys(formData).length > 0
      if (hasData) {
        await saveLoginInfo(source.value, { ...formData })
      } else {
        await saveLoginInfo(source.value, {})
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      console.warn('[登录] 关闭时保存失败:', errorMsg)
    }
  }

  visible.value = false
  confirmed.value = false
}

let unlistenLoginData: UnlistenFn | null = null
let unlistenReLoginView: UnlistenFn | null = null

async function handleUpLoginData(info: string): Promise<void> {
  if (!visible.value) return
  if (!source.value) return

  if (!info || info.trim() === '') {
    const newFormData: Record<string, string> = {}
    for (const row of rows.value) {
      if (row.type === 'text' || row.type === 'password') {
        newFormData[row.name] = row.default || ''
      } else if (row.type === 'toggle' || row.type === 'select') {
        const chars = row.chars && row.chars.length > 0 ? row.chars : ['']
        newFormData[row.name] = row.default || chars[0] || ''
      }
    }
    for (const key of Object.keys(formData)) {
      delete formData[key]
    }
    for (const [k, v] of Object.entries(newFormData)) {
      formData[k] = v
    }
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(info)
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
  const map = parsed as Record<string, unknown>
  for (const [key, value] of Object.entries(map)) {
    const strVal = value === null || value === undefined ? '' : String(value)
    formData[key] = strVal
  }
}

async function handleReLoginView(): Promise<void> {
  if (!visible.value) return
  if (!source.value) return

  try {
    const parsed = await parseLoginUi(source.value)
    if (!parsed) return
    rows.value = parsed.rows
    for (const key of Object.keys(formData)) {
      delete formData[key]
    }
    for (const [k, v] of Object.entries(parsed.formData)) {
      formData[k] = v
    }
    await refreshViewNames()
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    console.warn('[登录] reLoginView 失败:', errorMsg)
  }
}

onMounted(async () => {
  unlistenLoginData = await windowApi.listenLoginDataUpdate((info) => {
    handleUpLoginData(info).catch(() => {})
  })
  unlistenReLoginView = await windowApi.listenReLoginView(() => {
    handleReLoginView().catch(() => {})
  })
})

onUnmounted(() => {
  if (textChangeTimer) {
    clearTimeout(textChangeTimer)
    textChangeTimer = null
  }
  if (unlistenLoginData) {
    try { unlistenLoginData() } catch { /* ignore */ }
    unlistenLoginData = null
  }
  if (unlistenReLoginView) {
    try { unlistenReLoginView() } catch { /* ignore */ }
    unlistenReLoginView = null
  }
})

defineExpose({ open, handleClose })
</script>

<style scoped>
.login-dialog-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.login-dialog-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.login-dialog-enter-from { opacity: 0; transform: scale(0.96); }
.login-dialog-leave-to { opacity: 0; transform: scale(0.98); }

.login-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.55); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.login-container { width: 100%; max-width: 520px; max-height: 80vh; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-xl); }

.login-header { display: flex; align-items: center; gap: 12px; padding: 16px 22px; border-bottom: 1px solid var(--border-color); }
.login-title { font-size: 17px; font-weight: 600; color: var(--text-primary); flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.login-status { font-size: 12px; padding: 3px 10px; border-radius: 9999px; flex-shrink: 0; }
.status-unknown { background: var(--bg-hover); color: var(--text-muted); }
.status-ok { background: rgba(76,175,80,0.12); color: #4caf50; }
.status-fail { background: rgba(231,76,60,0.12); color: #e74c3c; }
.btn-close { width: 32px; height: 32px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.login-body { flex: 1; overflow-y: auto; padding: 16px 22px; }
.login-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px; color: var(--text-muted); }
.login-empty { text-align: center; padding: 40px; color: var(--text-muted); }

.login-rows { display: flex; flex-direction: column; gap: 14px; }
.login-row { display: flex; flex-direction: column; gap: 6px; }
.login-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.login-input { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.login-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.login-select { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
.login-select:focus { border-color: var(--brand); }
.login-toggle { display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: border-color 0.18s, background 0.18s; }
.login-toggle:hover { border-color: var(--brand); background: var(--bg-hover); }
.toggle-char { font-size: 12px; color: var(--text-muted); }
.toggle-label { flex: 1; text-align: left; }
.login-button { padding: 10px 16px; font-size: 14px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: border-color 0.18s, background 0.18s, color 0.18s; }
.login-button:hover:not(:disabled) { border-color: var(--brand); background: var(--bg-hover); }
.login-button:disabled { opacity: 0.5; cursor: not-allowed; }

.login-message { margin-top: 14px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.message-success { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.2); color: #4caf50; }
.message-error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }

.login-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--border-color); }
</style>
