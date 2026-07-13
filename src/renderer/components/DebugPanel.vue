<template>
  <Teleport to="body">
    <!-- 悬浮窗 -->
    <div
      v-if="visible"
      ref="panelRef"
      class="debug-panel-floating"
      :style="panelStyle"
      @mousedown="startDrag"
    >
      <!-- 标题栏 -->
      <div class="debug-panel-header">
        <div class="header-left">
          <span class="header-icon">🔧</span>
          <span class="header-title">书源调试助手</span>
          <span v-if="currentSource" class="header-source">{{ currentSource.name }}</span>
        </div>
        <div class="header-actions">
          <button class="header-btn" @click="minimize = !minimize" title="最小化">─</button>
          <button class="header-btn close" @click="closePanel" title="关闭">✕</button>
        </div>
      </div>

      <!-- 内容区（可最小化） -->
      <div v-show="!minimize" class="debug-panel-body">
        <!-- 工具栏 -->
        <div class="debug-toolbar">
          <select v-model="sourceId" class="debug-select" @change="onSourceChange">
            <option value="">选择书源...</option>
            <option v-for="s in sources" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>

          <div class="debug-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="debug-tab"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>

          <button class="debug-clear-btn" @click="clearAll">清空</button>
        </div>

        <!-- ===== 搜索测试 ===== -->
        <div v-if="activeTab === 'search'" class="debug-content">
          <div class="input-row">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="输入关键词..."
              class="debug-input"
              @keyup.enter="runSearch"
            />
            <button class="debug-run-btn" :disabled="running" @click="runSearch">
              {{ running ? '执行中...' : '搜索' }}
            </button>
          </div>

          <!-- 请求信息 -->
          <div v-if="lastRequest" class="request-info">
            <details>
              <summary>📡 请求详情</summary>
              <div class="request-detail">
                <div><strong>URL:</strong> {{ lastRequest.url }}</div>
                <div><strong>Method:</strong> {{ lastRequest.method }}</div>
                <div><strong>Headers:</strong> <pre>{{ JSON.stringify(lastRequest.headers, null, 2) }}</pre></div>
              </div>
            </details>
          </div>

          <!-- 结果 -->
          <div v-if="searchResult" class="result-area">
            <div class="result-stats">
              <span>找到 <strong>{{ searchResult.length }}</strong> 本书</span>
              <button class="toggle-raw-btn" @click="showRaw.search = !showRaw.search">
                {{ showRaw.search ? '隐藏原始数据' : '显示原始数据' }}
              </button>
            </div>

            <!-- 书籍列表 -->
            <div class="book-list">
              <div
                v-for="(book, idx) in searchResult.slice(0, 20)"
                :key="idx"
                class="book-item"
                @click="selectBook(book)"
              >
                <span class="item-index">{{ idx + 1 }}</span>
                <span class="item-name">{{ book.name || '未命名' }}</span>
                <span class="item-author">{{ book.author || '佚名' }}</span>
                <span class="item-url">{{ truncateUrl(book.bookUrl) }}</span>
                <span v-if="book.coverUrl" class="item-cover">🖼️</span>
              </div>
              <div v-if="searchResult.length > 20" class="item-more">
                还有 {{ searchResult.length - 20 }} 本
              </div>
            </div>

            <!-- 原始数据 -->
            <div v-if="showRaw.search && rawData.search" class="raw-data">
              <pre>{{ rawData.search }}</pre>
            </div>
          </div>
        </div>

        <!-- ===== 目录测试 ===== -->
        <div v-if="activeTab === 'toc'" class="debug-content">
          <div class="input-row">
            <input
              v-model="tocUrl"
              type="text"
              placeholder="输入书籍URL..."
              class="debug-input"
              @keyup.enter="runToc"
            />
            <button class="debug-run-btn" :disabled="running" @click="runToc">
              {{ running ? '执行中...' : '获取目录' }}
            </button>
          </div>

          <div v-if="tocResult" class="result-area">
            <div class="result-stats">
              <span>共 <strong>{{ tocResult.length }}</strong> 章</span>
              <button class="toggle-raw-btn" @click="showRaw.toc = !showRaw.toc">
                {{ showRaw.toc ? '隐藏原始数据' : '显示原始数据' }}
              </button>
            </div>

            <div class="chapter-list">
              <div
                v-for="(ch, idx) in tocResult.slice(0, 30)"
                :key="idx"
                class="chapter-item"
                :class="{ vip: ch.isVip }"
              >
                <span class="item-index">{{ idx + 1 }}</span>
                <span class="item-name">{{ ch.title || '无标题' }}</span>
                <span class="item-url">{{ truncateUrl(ch.url) }}</span>
                <span v-if="ch.isVip" class="badge-vip">VIP</span>
                <span v-if="ch.isPay" class="badge-pay">付费</span>
              </div>
              <div v-if="tocResult.length > 30" class="item-more">
                还有 {{ tocResult.length - 30 }} 章
              </div>
            </div>

            <div v-if="showRaw.toc && rawData.toc" class="raw-data">
              <pre>{{ rawData.toc }}</pre>
            </div>
          </div>
        </div>

        <!-- ===== 正文测试 ===== -->
        <div v-if="activeTab === 'content'" class="debug-content">
          <div class="input-row">
            <input
              v-model="contentUrl"
              type="text"
              placeholder="输入章节URL..."
              class="debug-input"
              @keyup.enter="runContent"
            />
            <button class="debug-run-btn" :disabled="running" @click="runContent">
              {{ running ? '执行中...' : '获取正文' }}
            </button>
          </div>

          <div v-if="contentResult" class="result-area">
            <div class="result-stats">
              <span>正文长度: <strong>{{ contentResult.length }}</strong> 字符</span>
              <button class="toggle-raw-btn" @click="showRaw.content = !showRaw.content">
                {{ showRaw.content ? '隐藏原始数据' : '显示原始数据' }}
              </button>
            </div>

            <div class="content-preview" v-html="contentResult"></div>

            <div v-if="showRaw.content && rawData.content" class="raw-data">
              <pre>{{ rawData.content }}</pre>
            </div>
          </div>
        </div>

        <!-- ===== 书籍详情测试 ===== -->
        <div v-if="activeTab === 'detail'" class="debug-content">
          <div class="input-row">
            <input
              v-model="detailUrl"
              type="text"
              placeholder="输入书籍URL..."
              class="debug-input"
              @keyup.enter="runDetail"
            />
            <button class="debug-run-btn" :disabled="running" @click="runDetail">
              {{ running ? '执行中...' : '获取详情' }}
            </button>
          </div>

          <div v-if="detailResult" class="result-area">
            <div class="detail-info">
              <div class="detail-row"><strong>书名:</strong> {{ detailResult.name }}</div>
              <div class="detail-row"><strong>作者:</strong> {{ detailResult.author }}</div>
              <div class="detail-row"><strong>分类:</strong> {{ detailResult.kind || '未知' }}</div>
              <div class="detail-row"><strong>最新章节:</strong> {{ detailResult.lastChapter || '未知' }}</div>
              <div class="detail-row"><strong>简介:</strong> {{ detailResult.intro || '无' }}</div>
              <div class="detail-row"><strong>封面:</strong> <a :href="detailResult.coverUrl" target="_blank">{{ detailResult.coverUrl || '无' }}</a></div>
              <div class="detail-row"><strong>目录URL:</strong> {{ detailResult.tocUrl || '无' }}</div>
            </div>

            <div v-if="showRaw.detail && rawData.detail" class="raw-data">
              <pre>{{ rawData.detail }}</pre>
            </div>
          </div>
        </div>

        <!-- ===== 日志面板 ===== -->
        <div class="debug-log">
          <div class="log-header">
            <span>📋 日志</span>
            <button class="log-clear" @click="logs = []">清空</button>
          </div>
          <div class="log-list" ref="logListRef">
            <div
              v-for="(log, idx) in logs"
              :key="idx"
              class="log-entry"
              :class="'log-' + log.level"
            >
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
              <span v-if="log.detail" class="log-detail" @click="showLogDetail(log)">📄</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { BookSource, Book, Chapter } from '@shared/types'

const props = defineProps<{
  visible: boolean
  sources: BookSource[]
  sourceId?: string
  bookUrl?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select-source', sourceId: string): void
}>()

const message = useMessage()

// ===== 窗口状态 =====
const panelRef = ref<HTMLElement | null>(null)
const logListRef = ref<HTMLElement | null>(null)
const minimize = ref(false)
const running = ref(false)

// 窗口位置/大小（默认居中）
const panelStyle = ref({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '780px',
  height: '600px',
  zIndex: '9999',
})

// ===== 拖拽 =====
let dragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
}

function startDrag(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.debug-panel-header')) return

  const panel = panelRef.value
  if (!panel) return

  const rect = panel.getBoundingClientRect()
  dragState.isDragging = true
  dragState.startX = e.clientX
  dragState.startY = e.clientY
  dragState.startLeft = rect.left
  dragState.startTop = rect.top

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', endDrag)
}

function onDrag(e: MouseEvent) {
  if (!dragState.isDragging) return
  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY

  panelStyle.value = {
    ...panelStyle.value,
    top: (dragState.startTop + dy) + 'px',
    left: (dragState.startLeft + dx) + 'px',
    transform: 'none',
  }
}

function endDrag() {
  dragState.isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
}

// ===== 状态 =====
const activeTab = ref('search')
const sourceId = ref('')

const tabs = [
  { key: 'search', label: '搜索' },
  { key: 'toc', label: '目录' },
  { key: 'content', label: '正文' },
  { key: 'detail', label: '详情' },
]

// 测试输入
const searchKeyword = ref('')
const tocUrl = ref('')
const contentUrl = ref('')
const detailUrl = ref('')

// 结果
const searchResult = ref<any[]>([])
const tocResult = ref<any[]>([])
const contentResult = ref('')
const detailResult = ref<any>(null)

// 原始数据
const rawData = ref({
  search: '',
  toc: '',
  content: '',
  detail: '',
})

const showRaw = ref({
  search: false,
  toc: false,
  content: false,
  detail: false,
})

// 请求信息
const lastRequest = ref<{
  url: string
  method: string
  headers: Record<string, string>
} | null>(null)

// 日志
const logs = ref<Array<{ time: string; level: string; message: string; detail?: string }>>([])

// ===== 计算属性 =====
const currentSource = computed(() => {
  return props.sources.find(s => s.id === sourceId.value)
})

// ===== 方法 =====
function addLog(message: string, level: string = 'info', detail?: string) {
  const time = new Date().toLocaleTimeString()
  logs.value.unshift({ time, level, message, detail })
  if (logs.value.length > 200) {
    logs.value = logs.value.slice(0, 200)
  }
  nextTick(() => {
    if (logListRef.value) {
      logListRef.value.scrollTop = 0
    }
  })
}

function clearAll() {
  searchResult.value = []
  tocResult.value = []
  contentResult.value = ''
  detailResult.value = null
  rawData.value = { search: '', toc: '', content: '', detail: '' }
  logs.value = []
  lastRequest.value = null
}

function truncateUrl(url: string, maxLen: number = 50): string {
  if (!url) return ''
  if (url.length <= maxLen) return url
  return url.substring(0, maxLen) + '...'
}

function showLogDetail(log: any) {
  if (log.detail) {
    alert(log.detail)
  }
}

function onSourceChange() {
  emit('select-source', sourceId.value)
  // 清空旧结果
  searchResult.value = []
  tocResult.value = []
  contentResult.value = ''
  detailResult.value = null
  addLog(`切换到书源: ${currentSource.value?.name || '未选择'}`, 'info')
}

function selectBook(book: any) {
  if (book.bookUrl) {
    detailUrl.value = book.bookUrl
    activeTab.value = 'detail'
    addLog(`选中书籍: ${book.name} -> ${book.bookUrl}`, 'info')
  }
}

function closePanel() {
  emit('update:visible', false)
}

// ===== 清理 source 对象（解决 "An object could not be cloned"） =====
function cleanSource(source: BookSource): any {
  if (!source) return null
  try {
    return JSON.parse(JSON.stringify({
      id: source.id,
      name: source.name,
      url: source.url,
      searchUrl: source.searchUrl || '',
      ruleSearch: source.ruleSearch || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      ruleExplore: source.ruleExplore || {},
      exploreUrl: source.exploreUrl || '',
      enabled: source.enabled !== undefined ? source.enabled : true,
      group: source.group || null,
      comment: source.comment || null,
      weight: source.weight || 0,
      header: typeof source.header === 'string' ? source.header : null,
      enabledCookieJar: source.enabledCookieJar || false,
      jsLib: source.jsLib || null,
      loginUrl: source.loginUrl || null,
      loginUi: source.loginUi || null,
      respondTime: source.respondTime || 0,
      lastUpdateTime: source.lastUpdateTime || Date.now(),
      bookUrlPattern: source.bookUrlPattern || null,
      code: source.code || null,
      _legado: !!source.code,
      _desktop: true,
    }))
  } catch {
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      searchUrl: source.searchUrl || '',
      ruleSearch: source.ruleSearch || {},
      ruleBookInfo: source.ruleBookInfo || {},
      ruleToc: source.ruleToc || {},
      ruleContent: source.ruleContent || {},
      enabled: true,
    }
  }
}

// ===== 搜索 =====
async function runSearch() {
  if (!sourceId.value) {
    message.warning('请先选择书源')
    return
  }
  if (!searchKeyword.value.trim()) {
    message.warning('请输入关键词')
    return
  }

  running.value = true
  searchResult.value = []
  rawData.value.search = ''
  lastRequest.value = null
  addLog(`🔍 搜索: "${searchKeyword.value}"`, 'info')

  try {
    const source = currentSource.value
    if (!source) throw new Error('书源未找到')

    const clean = cleanSource(source)
    addLog(`书源: ${source.name}`, 'info')

    const startTime = Date.now()
    const result = await window.electronAPI.engineSearch(clean, searchKeyword.value, 1)

    if (result.success) {
      searchResult.value = result.data || []
      addLog(`✅ 搜索成功，找到 ${searchResult.value.length} 本书 (${Date.now() - startTime}ms)`, 'success')
      rawData.value.search = JSON.stringify(result.data, null, 2)
    } else {
      addLog(`❌ 搜索失败: ${result.error}`, 'error')
    }
  } catch (err: any) {
    addLog(`❌ 搜索异常: ${err.message}`, 'error')
  } finally {
    running.value = false
  }
}

// ===== 目录 =====
async function runToc() {
  if (!sourceId.value) {
    message.warning('请先选择书源')
    return
  }
  if (!tocUrl.value.trim()) {
    message.warning('请输入书籍URL')
    return
  }

  running.value = true
  tocResult.value = []
  rawData.value.toc = ''
  lastRequest.value = null
  addLog(`📑 获取目录: ${tocUrl.value}`, 'info')

  try {
    const source = currentSource.value
    if (!source) throw new Error('书源未找到')

    const clean = cleanSource(source)
    addLog(`书源: ${source.name}`, 'info')

    const startTime = Date.now()
    const result = await window.electronAPI.engineGetToc(clean, tocUrl.value)

    if (result.success) {
      tocResult.value = result.data || []
      addLog(`✅ 获取目录成功，${tocResult.value.length} 章 (${Date.now() - startTime}ms)`, 'success')
      rawData.value.toc = JSON.stringify(result.data, null, 2)
    } else {
      addLog(`❌ 获取目录失败: ${result.error}`, 'error')
    }
  } catch (err: any) {
    addLog(`❌ 获取目录异常: ${err.message}`, 'error', err.stack)
  } finally {
    running.value = false
  }
}

// ===== 正文 =====
async function runContent() {
  if (!sourceId.value) {
    message.warning('请先选择书源')
    return
  }
  if (!contentUrl.value.trim()) {
    message.warning('请输入章节URL')
    return
  }

  running.value = true
  contentResult.value = ''
  rawData.value.content = ''
  lastRequest.value = null
  addLog(`📄 获取正文: ${contentUrl.value}`, 'info')

  try {
    const source = currentSource.value
    if (!source) throw new Error('书源未找到')

    const clean = cleanSource(source)
    addLog(`书源: ${source.name}`, 'info')

    const startTime = Date.now()
    const result = await window.electronAPI.engineGetContent(clean, contentUrl.value)

    if (result.success) {
      contentResult.value = result.data || ''
      addLog(`✅ 获取正文成功，${contentResult.value.length} 字符 (${Date.now() - startTime}ms)`, 'success')
      rawData.value.content = result.data || ''
    } else {
      addLog(`❌ 获取正文失败: ${result.error}`, 'error')
    }
  } catch (err: any) {
    addLog(`❌ 获取正文异常: ${err.message}`, 'error', err.stack)
  } finally {
    running.value = false
  }
}

// ===== 书籍详情 =====
async function runDetail() {
  if (!sourceId.value) {
    message.warning('请先选择书源')
    return
  }
  if (!detailUrl.value.trim()) {
    message.warning('请输入书籍URL')
    return
  }

  running.value = true
  detailResult.value = null
  rawData.value.detail = ''
  lastRequest.value = null
  addLog(`📖 获取书籍详情: ${detailUrl.value}`, 'info')

  try {
    const source = currentSource.value
    if (!source) throw new Error('书源未找到')

    const clean = cleanSource(source)
    addLog(`书源: ${source.name}`, 'info')

    const startTime = Date.now()
    const result = await window.electronAPI.engineGetBookInfo(clean, detailUrl.value)

    if (result.success) {
      detailResult.value = result.data
      addLog(`✅ 获取详情成功 (${Date.now() - startTime}ms)`, 'success')
      rawData.value.detail = JSON.stringify(result.data, null, 2)
    } else {
      addLog(`❌ 获取详情失败: ${result.error}`, 'error')
    }
  } catch (err: any) {
    addLog(`❌ 获取详情异常: ${err.message}`, 'error', err.stack)
  } finally {
    running.value = false
  }
}

// ===== 监听 sourceId 变化 =====
watch(() => props.sourceId, (val) => {
  if (val) {
    sourceId.value = val
    // 自动填充 detailUrl
    if (props.bookUrl) {
      detailUrl.value = props.bookUrl
    }
  }
}, { immediate: true })

// ===== 键盘快捷键 =====
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    closePanel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', endDrag)
})
</script>

<style scoped>
/* ===== 悬浮窗 ===== */
.debug-panel-floating {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  min-width: 400px;
  min-height: 300px;
  resize: both;
}

/* ===== 标题栏 ===== */
.debug-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  flex-shrink: 0;
}
.debug-panel-header:active {
  cursor: grabbing;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.header-icon { font-size: 16px; }
.header-title { font-weight: 600; color: var(--text-primary); }
.header-source {
  font-size: 11px;
  color: var(--brand);
  background: rgba(212, 160, 23, 0.10);
  padding: 1px 8px;
  border-radius: 4px;
}

.header-actions { display: flex; gap: 4px; }
.header-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.header-btn.close:hover { background: #e74c3c; color: white; }

/* ===== 主体 ===== */
.debug-panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
  gap: 8px;
  min-height: 0;
}

/* ===== 工具栏 ===== */
.debug-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.debug-select {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  min-width: 140px;
}
.debug-select:focus { border-color: var(--brand); }

.debug-tabs { display: flex; gap: 2px; }
.debug-tab {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.debug-tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.debug-tab.active {
  color: var(--brand);
  background: rgba(212, 160, 23, 0.10);
}

.debug-clear-btn {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  margin-left: auto;
}
.debug-clear-btn:hover { color: var(--text-primary); border-color: var(--brand); }

/* ===== 内容区 ===== */
.debug-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.input-row {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.debug-input {
  flex: 1;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
}
.debug-input:focus { border-color: var(--brand); }
.debug-input::placeholder { color: var(--text-muted); }

.debug-run-btn {
  padding: 6px 20px;
  font-size: 13px;
  color: #0d0d0d;
  background: var(--brand);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.debug-run-btn:hover:not(:disabled) { background: var(--brand-hover); }
.debug-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 请求信息 ===== */
.request-info {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg);
  border-radius: 4px;
  padding: 6px 10px;
}
.request-info details { cursor: pointer; }
.request-info summary { font-weight: 500; }
.request-info pre {
  margin: 4px 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

/* ===== 结果区 ===== */
.result-area {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  padding: 10px 12px;
  min-height: 0;
}

.result-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  flex-shrink: 0;
}
.toggle-raw-btn {
  font-size: 11px;
  color: var(--brand);
  background: transparent;
  border: none;
  cursor: pointer;
}
.toggle-raw-btn:hover { text-decoration: underline; }

/* ===== 书籍列表 ===== */
.book-list, .chapter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}
.book-item, .chapter-item {
  display: flex;
  gap: 8px;
  padding: 3px 6px;
  font-size: 12px;
  color: var(--text-secondary);
  border-radius: 4px;
  align-items: center;
  cursor: pointer;
}
.book-item:hover, .chapter-item:hover { background: var(--bg-hover); }
.book-item .item-name, .chapter-item .item-name { flex: 1; color: var(--text-primary); }
.item-index {
  color: var(--text-muted);
  min-width: 28px;
  font-size: 11px;
}
.item-author { color: var(--text-muted); min-width: 60px; }
.item-url {
  color: var(--text-muted);
  font-size: 10px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-cover { font-size: 12px; }

.badge-vip {
  font-size: 9px;
  color: #d4a017;
  background: rgba(212, 160, 23, 0.12);
  padding: 0 6px;
  border-radius: 3px;
}
.badge-pay {
  font-size: 9px;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.12);
  padding: 0 6px;
  border-radius: 3px;
}

.chapter-item.vip .item-name { color: #d4a017; }

.item-more {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ===== 正文预览 ===== */
.content-preview {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
}
.content-preview :deep(p) { margin-bottom: 0.6em; }

/* ===== 详情信息 ===== */
.detail-info {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-row { display: flex; gap: 8px; }
.detail-row strong { min-width: 60px; color: var(--text-muted); }
.detail-row a { color: var(--brand); }

/* ===== 原始数据 ===== */
.raw-data {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg-hover);
  border-radius: 4px;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
}
.raw-data pre {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

/* ===== 日志面板 ===== */
.debug-log {
  flex-shrink: 0;
  max-height: 120px;
  border-top: 1px solid var(--border-color);
  padding-top: 6px;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}
.log-clear {
  font-size: 10px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}
.log-clear:hover { color: var(--text-primary); }

.log-list {
  flex: 1;
  overflow-y: auto;
  font-size: 11px;
  display: flex;
  flex-direction: column-reverse;
  max-height: 90px;
}
.log-entry {
  display: flex;
  gap: 8px;
  padding: 1px 4px;
  border-radius: 2px;
}
.log-time {
  color: var(--text-muted);
  min-width: 60px;
  font-size: 10px;
}
.log-success .log-message { color: #4caf50; }
.log-error .log-message { color: #e74c3c; }
.log-warning .log-message { color: #f39c12; }
.log-info .log-message { color: var(--text-secondary); }
.log-detail {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 10px;
}
.log-detail:hover { color: var(--brand); }

/* ===== 滚动条美化 ===== */
.debug-content::-webkit-scrollbar,
.log-list::-webkit-scrollbar,
.book-list::-webkit-scrollbar,
.chapter-list::-webkit-scrollbar,
.raw-data::-webkit-scrollbar {
  width: 3px;
}
.debug-content::-webkit-scrollbar-thumb,
.log-list::-webkit-scrollbar-thumb,
.book-list::-webkit-scrollbar-thumb,
.chapter-list::-webkit-scrollbar-thumb,
.raw-data::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

/* ===== 响应式 ===== */
@media (max-width: 820px) {
  .debug-panel-floating {
    width: 95vw !important;
    height: 80vh !important;
    top: 10vh !important;
    left: 2.5vw !important;
    transform: none !important;
  }
}
</style>
