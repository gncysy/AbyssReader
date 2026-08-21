<template>
  <n-modal v-model:show="visible" preset="card" :title="'登录 - ' + (source?.sourceName || '订阅源')" style="max-width:520px" :bordered="false" @after-leave="onClose">
    <div v-if="loading" style="display:flex;justify-content:center;padding:40px"><LoadingSpinner /></div>
    <div v-else-if="error" class="login-error">{{ error }}<button class="btn-secondary" style="margin-top:10px;padding:4px 16px;font-size:12px" @click="retry">重试</button></div>
    <div v-else-if="loginUiItems.length > 0" class="login-ui">
      <div v-for="(item, idx) in loginUiItems" :key="idx" class="login-ui-row" :class="{ 'login-ui-row-button': item.type === 'button' }">
        <template v-if="item.type === 'text'"><span class="login-ui-label">{{ item.name || '' }}</span></template>
        <template v-else-if="item.type === 'input'">
          <span class="login-ui-label">{{ item.name || '' }}</span>
          <input v-model="formData[item.name || '']" :type="typeof item.inputType === 'string' ? item.inputType : 'text'" class="login-ui-input" :placeholder="typeof item.placeholder === 'string' ? item.placeholder : ''" @keyup.enter="executeAction(item.action)" />
        </template>
        <template v-else-if="item.type === 'password'">
          <span class="login-ui-label">{{ item.name || '' }}</span>
          <input v-model="formData[item.name || '']" type="password" class="login-ui-input" :placeholder="typeof item.placeholder === 'string' ? item.placeholder : ''" @keyup.enter="executeAction(item.action)" />
        </template>
        <template v-else-if="item.type === 'toggle'">
          <span class="login-ui-label">{{ item.name || '' }}</span>
          <div class="login-ui-toggle-group">
            <button v-for="c in (item.chars || [])" :key="c" class="login-ui-toggle-btn" :class="{ active: formData[item.name || ''] === c }" @click="formData[item.name || ''] = c">{{ c }}</button>
          </div>
        </template>
        <template v-else-if="item.type === 'button'">
          <button class="btn-primary" :disabled="executing" style="width:100%;padding:8px;font-size:14px" @click="executeAction(item.action)">{{ executing ? '执行中...' : (item.name || '确定') }}</button>
        </template>
      </div>
    </div>
    <div v-else-if="source?.loginUrl && !loginUiItems.length" class="login-simple">
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:12px">将在新窗口中打开登录页面</p>
      <button class="btn-primary" style="width:100%;padding:8px;font-size:14px" @click="openLoginUrl">打开登录页</button>
    </div>
    <div v-else class="login-empty"><p style="color:var(--text-muted)">该订阅源未配置登录方式</p></div>
    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" @click="close">取消</button>
        <button v-if="loginUiItems.length > 0 || source?.loginUrl" class="btn-primary" :disabled="executing || checking" @click="checkLogin">{{ checking ? '检测中...' : '检测登录状态' }}</button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal, useMessage } from 'naive-ui'
import { loginWebview } from '@/services/network.js'
import { executeRssLoginJs } from '@/services/rss-login.js'
import { executeJsRule } from '@/services/engine.js'
import type { RssSource } from '@/types'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

interface LoginUiItem {
  type?: string
  name?: string
  inputType?: string
  placeholder?: string
  action?: string
  default?: string
  chars?: string[]
  [key: string]: unknown
}

const msg = useMessage()
const props = defineProps<{ source: RssSource | null }>()
const emit = defineEmits<{ success: []; close: [] }>()

const visible = ref(false)
const loading = ref(false)
const checking = ref(false)
const executing = ref(false)
const error = ref('')
const loginUiItems = ref<LoginUiItem[]>([])
const formData = ref<Record<string, string>>({})
const sourceKey = ref('')

function open(source: RssSource): void {
  loading.value = true
  error.value = ''
  loginUiItems.value = []
  formData.value = {}
  sourceKey.value = source.sourceUrl

  if (source.loginUi) loadLoginUi(source)
  else if (source.loginUrl) loading.value = false
  else { error.value = '该订阅源未配置登录'; loading.value = false }

  visible.value = true
}

function close(): void { visible.value = false; emit('close') }
function onClose(): void {}

async function loadLoginUi(source: RssSource): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const uiStr = source.loginUi || ''
    const cleaned = uiStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
    try {
      const parsed = JSON.parse(cleaned) as unknown
      if (Array.isArray(parsed)) {
        loginUiItems.value = parsed as LoginUiItem[]
        initFormData(loginUiItems.value)
        loading.value = false
        return
      }
    } catch {
      // 不是 JSON，尝试执行 JS
    }
    const result = await executeRssLoginJs(cleaned, source, { timeoutMs: 10000 })
    if (result.success) {
      try {
        const parsed = JSON.parse(result.result) as unknown
        if (Array.isArray(parsed)) {
          loginUiItems.value = parsed as LoginUiItem[]
          initFormData(loginUiItems.value)
        }
      } catch {
        // ignore
      }
    }
  } catch (err: unknown) {
    const e = err as Error
    error.value = '加载登录界面失败: ' + e.message
  } finally {
    loading.value = false
  }
}

function initFormData(items: LoginUiItem[]): void {
  for (const item of items) {
    const name = item.name || ''
    if (!name) continue
    if (item.type === 'input' || item.type === 'password') {
      formData.value[name] = item.default || ''
    }
    if (item.type === 'toggle') {
      const chars = item.chars || []
      formData.value[name] = item.default || (chars.length > 0 ? (chars[0] || '') : '')
    }
  }
}

async function executeAction(action?: string): Promise<void> {
  if (!action || !props.source || executing.value) return
  executing.value = true
  error.value = ''
  try {
    let processed = action
    for (const [key, value] of Object.entries(formData.value)) {
      processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
    }
    const result = await executeRssLoginJs(processed, props.source, {
      result: processed,
      formData: formData.value,
      timeoutMs: 15000,
    })
    if (result.success) {
      const res = result.result
      if (res.includes('success') || res === 'true') {
        msg.success('操作成功')
        await checkLogin()
      } else if (res.startsWith('error:')) {
        error.value = res.substring(6)
      } else {
        msg.info(res || '操作完成')
      }
    }
  } catch (err: unknown) {
    const e = err as Error
    error.value = e.message || '执行失败'
  } finally {
    executing.value = false
  }
}

async function openLoginUrl(): Promise<void> {
  if (!props.source?.loginUrl) return
  try {
    const url = props.source.loginUrl
    await loginWebview(url, props.source.sourceName || '登录', 300)
    msg.info('登录窗口已关闭')
    await checkLogin()
  } catch (err: unknown) {
    const e = err as Error
    error.value = e.message || '打开登录页失败'
  }
}

async function checkLogin(): Promise<void> {
  if (!props.source || checking.value) return
  checking.value = true
  error.value = ''
  try {
    const checkJs = props.source.loginCheckJs
    if (checkJs) {
      const cleaned = checkJs.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '').trim()
      const result = await executeRssLoginJs(cleaned, props.source, {
        formData: formData.value,
        timeoutMs: 10000,
      })
      if (result.success) {
        if (result.result === 'true') {
          msg.success('登录成功！')
          emit('success')
          close()
          return
        }
        error.value = '未登录，请完成登录操作'
      }
    } else {
      const cookie = await executeJsRule('cookie.getCookie(baseUrl)', {
        source: props.source,
        baseUrl: props.source.sourceUrl,
      })
      if (cookie && cookie.length > 10) {
        msg.success('已检测到 Cookie，登录有效')
        emit('success')
        close()
        return
      }
      error.value = '未检测到登录状态，请完成登录'
    }
  } catch (err: unknown) {
    const e = err as Error
    error.value = e.message || '检测失败'
  } finally {
    checking.value = false
  }
}

function retry(): void {
  error.value = ''
  if (props.source?.loginUi) loadLoginUi(props.source)
  else loading.value = false
}

defineExpose({ open, close })
</script>

<style scoped>
.login-ui { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.login-ui-row { display: flex; align-items: center; gap: 10px; }
.login-ui-row-button { margin-top: 8px; flex-direction: column; }
.login-ui-label { font-size: 13px; color: var(--text-secondary); min-width: 60px; font-weight: 500; }
.login-ui-input { flex: 1; padding: 6px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.login-ui-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.login-ui-toggle-group { display: flex; gap: 4px; flex: 1; }
.login-ui-toggle-btn { padding: 4px 12px; font-size: 13px; color: var(--text-muted); background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.2s, background 0.2s, border-color 0.2s; }
.login-ui-toggle-btn:hover { color: var(--text-primary); border-color: var(--brand); }
.login-ui-toggle-btn.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.login-error { padding: 20px; text-align: center; color: #e74c3c; font-size: 14px; }
.login-simple { padding: 8px 0; }
.login-empty { padding: 30px; text-align: center; }
</style>
