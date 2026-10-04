<template>
  <div class="source-manager-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">书源管理</h1>
        <p class="page-subtitle">{{ selectedCount > 0 ? `已选 ${selectedCount} / ${safeSources.length}` : `${filteredList.length} / ${safeSources.length}` }} 个书源</p>
      </div>
      <div class="header-actions">
        <SearchInput v-model="searchText" placeholder="搜索书源..." name="source-search" />
        <CustomDropdown v-model="selectedGroup" :options="groupOptions" placeholder="全部分组" style="min-width:120px" @update:model-value="onGroupChange" />

        <!-- 导入 -->
        <div class="header-menu-wrapper">
          <button class="btn-primary header-menu-trigger" @click.stop="toggleHeaderMenu('import')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>导入</span>
          </button>
          <Transition name="menu-drop">
            <div v-if="openHeaderMenu === 'import'" class="header-menu" @click.stop>
              <button class="header-menu-item" @click="onHeaderMenuAction('paste')">粘贴 JSON</button>
              <button class="header-menu-item" @click="onHeaderMenuAction('url')">从 URL</button>
              <button class="header-menu-item" @click="onHeaderMenuAction('file')">上传文件</button>
            </div>
          </Transition>
        </div>

        <!-- 更多 -->
        <div class="header-menu-wrapper">
          <button class="btn-secondary header-menu-trigger header-menu-trigger-icon" @click.stop="toggleHeaderMenu('more')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
          <Transition name="menu-drop">
            <div v-if="openHeaderMenu === 'more'" class="header-menu" @click.stop>
              <button class="header-menu-item" :disabled="testingAll" @click="onHeaderMenuAction('testAll')">
                {{ testingAll ? `测试中 ${testProgress}/${safeSources.length}` : '测试全部' }}
              </button>
              <div class="header-menu-divider"></div>
              <button class="header-menu-item header-menu-item-danger" :disabled="deletingFailed" @click="onHeaderMenuAction('deleteFailed')">
                {{ deletingFailed ? '删除中...' : '删除失效' }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />

    <div v-if="selectedIndices.size > 0" class="batch-actions">
      <span style="font-size:13px;color:var(--text-secondary)">已选 {{ selectedIndices.size }} 个</span>
      <button class="btn-secondary btn-sm" @click="handleBatchEnable">批量启用</button>
      <button class="btn-secondary btn-sm" @click="handleBatchDisable">批量禁用</button>
      <button class="btn-secondary btn-sm" @click="invertSelection">反选</button>
      <button class="btn-danger btn-sm" @click="handleBatchDelete">批量删除</button>
    </div>

    <div v-if="Object.keys(groupedSources).length > 0" class="source-table">
      <div class="table-header">
        <label class="checkbox-all" @click.stop><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" /></label>
        <span>名称</span>
        <span>分组</span>
        <span>状态</span>
        <span>测试结果</span>
        <span>操作</span>
      </div>
      <div v-for="(group, groupName) in groupedSources" :key="groupName" class="group-block">
        <div class="group-header" @click="toggleGroupCollapse(groupName)">
          <span class="group-name">{{ groupName || '未分组' }}</span>
          <span class="group-count">{{ group.length }} 个书源</span>
        </div>
        <div v-show="!collapsedGroups.has(groupName)">
          <div
            v-for="item in group"
            :key="item.originalIndex"
            class="table-row"
            :class="{
              selected: selectedIndices.has(item.originalIndex),
              'row-menu-open': openMenuIndex === item.originalIndex,
            }"
          >
            <label class="checkbox-cell" @click.stop><input type="checkbox" :checked="selectedIndices.has(item.originalIndex)" @change="toggleSelect(item.originalIndex)" /></label>
            <span class="source-name" @click="showSourceDetail(item.originalIndex)">{{ item.source.bookSourceName }}</span>
            <span class="source-group">{{ item.source.bookSourceGroup || '-' }}</span>
            <span><span class="status-dot" :class="item.source.enabled !== false ? 'enabled' : 'disabled'"></span></span>
            <span class="test-result">{{ testResults[item.originalIndex] || '-' }}</span>
            <div class="row-actions" @click.stop>
              <button class="btn-icon-action" title="调试" @click="openDebug(item.originalIndex)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </button>
              <button
                class="btn-icon-action"
                :title="item.source.enabled !== false ? '禁用' : '启用'"
                @click="handleToggleSource(item.originalIndex)"
              >
                <svg v-if="item.source.enabled !== false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
              <div class="row-more-wrapper">
                <button
                  class="btn-icon-action"
                  title="更多"
                  @click.stop="toggleRowMenu(item.originalIndex)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
                <Transition name="menu-drop">
                  <div v-if="openMenuIndex === item.originalIndex" class="row-menu" @click.stop>
                    <button
                      v-if="hasLogin(item.source)"
                      class="row-menu-item"
                      @click="onMenuAction('login', item.originalIndex)"
                    >登录</button>
                    <button
                      class="row-menu-item"
                      :disabled="testingIdx === item.originalIndex"
                      @click="onMenuAction('test', item.originalIndex)"
                    >{{ testingIdx === item.originalIndex ? '测试中...' : '测试' }}</button>
                    <div class="row-menu-divider"></div>
                    <button
                      class="row-menu-item row-menu-item-danger"
                      @click="onMenuAction('delete', item.originalIndex)"
                    >删除</button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <EmptyState v-else :title="searchText ? '未找到匹配的书源' : '暂无书源'" />

    <n-modal v-model:show="showJsonModal" preset="dialog" title="导入书源" positive-text="导入" @positive-click="handleImportJson"><n-input v-model:value="jsonInput" type="textarea" placeholder="粘贴书源 JSON..." :autosize="{ minRows: 12, maxRows: 20 }" /></n-modal>
    <n-modal v-model:show="showUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" @positive-click="handleImportFromUrl"><n-input v-model:value="urlInput" placeholder="输入书源 JSON URL..." /></n-modal>
    <DebugPanel v-if="showDebugPanel" :visible="showDebugPanel" :sources="safeSources" :source-index="debugSourceIndex" @update:visible="showDebugPanel = $event" @sources-updated="loadSources" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { NModal, NInput, useMessage, useDialog } from 'naive-ui'
import { source as sourceApi } from '@/services'
import { useSourceManager } from '@/composables/useSourceManager.js'
import { useSourceLogin } from '@/composables/useSourceLogin.js'
import DebugPanel from '@/components/debug/DebugPanel.vue'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { BookSource } from '@/types'
import type { UnlistenFn } from '@tauri-apps/api/event'

const msg = useMessage()
const dialog = useDialog()
const { openLogin } = useSourceLogin()

const {
  selectedIndices,
  safeSources,
  selectedCount,
  loadSources,
  toggleSelect,
  clearSelection,
  batchEnable,
  batchDisable,
  batchDelete,
  deleteSourceByIndex,
  toggleSourceByIndex,
} = useSourceManager()

const searchText = ref('')
const selectedGroup = ref('')
const collapsedGroups = ref<Set<string>>(new Set())
const testResults = reactive<Record<number, string>>({})
const testingIdx = ref(-1)
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
const deletingIdx = ref(-1)
const showJsonModal = ref(false)
const showUrlModal = ref(false)
const jsonInput = ref('')
const urlInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const showDebugPanel = ref(false)
const debugSourceIndex = ref(-1)
let unlistenTest: UnlistenFn | null = null

// ─── 行内下拉菜单 ───
const openMenuIndex = ref(-1)

// ─── 顶部下拉菜单（'import' | 'more' | null）───
const openHeaderMenu = ref<'import' | 'more' | null>(null)

function toggleHeaderMenu(name: 'import' | 'more'): void {
  openHeaderMenu.value = openHeaderMenu.value === name ? null : name
}

function closeHeaderMenu(): void {
  openHeaderMenu.value = null
}

function onHeaderMenuAction(action: 'paste' | 'url' | 'file' | 'testAll' | 'deleteFailed'): void {
  closeHeaderMenu()
  if (action === 'paste') {
    showJsonModal.value = true
  } else if (action === 'url') {
    showUrlModal.value = true
  } else if (action === 'file') {
    triggerFileInput()
  } else if (action === 'testAll') {
    testAll()
  } else if (action === 'deleteFailed') {
    deleteFailed()
  }
}

function toggleRowMenu(idx: number): void {
  openHeaderMenu.value = null
  openMenuIndex.value = openMenuIndex.value === idx ? -1 : idx
}

function closeRowMenu(): void {
  openMenuIndex.value = -1
}

function onDocumentClickForMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (openHeaderMenu.value !== null && !target.closest('.header-menu-wrapper')) {
    closeHeaderMenu()
  }
  if (openMenuIndex.value !== -1 && !target.closest('.row-more-wrapper')) {
    closeRowMenu()
  }
}

function onMenuAction(action: 'login' | 'test' | 'delete', idx: number): void {
  closeRowMenu()
  if (action === 'login') {
    const source = safeSources.value[idx]
    if (source) openLogin(source)
  } else if (action === 'test') {
    testSource(idx)
  } else if (action === 'delete') {
    handleDeleteSource(idx)
  }
}

const allGroups = computed(() => {
  const groups = new Set<string>()
  for (const s of safeSources.value) {
    if (s.bookSourceGroup) groups.add(s.bookSourceGroup)
  }
  return Array.from(groups).sort()
})

const groupOptions = computed(() => {
  const opts: { label: string; value: string }[] = [{ label: '全部分组', value: '' }]
  for (const g of allGroups.value) opts.push({ label: g, value: g })
  return opts
})

const filteredList = computed(() => {
  const arr = safeSources.value
  const kw = searchText.value.trim().toLowerCase()
  const group = selectedGroup.value
  const result: { source: BookSource; originalIndex: number }[] = []
  arr.forEach((s, i) => {
    if (group && (s.bookSourceGroup || '') !== group) return
    if (kw) {
      const name = s.bookSourceName.toLowerCase()
      const url = s.bookSourceUrl.toLowerCase()
      if (!name.includes(kw) && !url.includes(kw)) return
    }
    result.push({ source: s, originalIndex: i })
  })
  return result
})

const groupedSources = computed(() => {
  const groups: Record<string, { source: BookSource; originalIndex: number }[]> = {}
  for (const item of filteredList.value) {
    const groupName = item.source.bookSourceGroup || ''
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName]!.push(item)
  }
  const sorted: Record<string, { source: BookSource; originalIndex: number }[]> = {}
  const keys = Object.keys(groups).sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))
  for (const k of keys) {
    const g = groups[k]
    if (g) sorted[k] = g
  }
  return sorted
})

const isAllSelected = computed(() => filteredList.value.length > 0 && filteredList.value.every((item) => selectedIndices.value.has(item.originalIndex)))

function toggleGroupCollapse(groupName: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(groupName)) next.delete(groupName)
  else next.add(groupName)
  collapsedGroups.value = next
}

function onGroupChange(val: string | number): void { selectedGroup.value = String(val) }

function hasLogin(source: BookSource): boolean {
  return !!(source.loginUrl || source.loginUi)
}

function toggleSelectAll(): void {
  if (isAllSelected.value) clearSelection()
  else selectedIndices.value = new Set(filteredList.value.map((item) => item.originalIndex))
}

function invertSelection(): void {
  const all = new Set(filteredList.value.map((item) => item.originalIndex))
  const inv = new Set<number>()
  all.forEach((i) => { if (!selectedIndices.value.has(i)) inv.add(i) })
  selectedIndices.value = inv
}

async function handleBatchEnable(): Promise<void> {
  const count = await batchEnable()
  msg.success(`已启用 ${count} 个书源`)
}

async function handleBatchDisable(): Promise<void> {
  const count = await batchDisable()
  msg.success(`已禁用 ${count} 个书源`)
}

async function handleBatchDelete(): Promise<void> {
  await batchDelete(() => msg.success('已删除'))
}

async function handleDeleteSource(idx: number): Promise<void> {
  if (deletingIdx.value >= 0) return
  deletingIdx.value = idx
  await deleteSourceByIndex(idx, () => msg.success('已删除'))
  deletingIdx.value = -1
}

async function handleToggleSource(idx: number): Promise<void> {
  await toggleSourceByIndex(idx)
}

function setTestResult(idx: number, value: string): void {
  testResults[idx] = value
}

function openDebug(idx: number): void {
  closeRowMenu()
  debugSourceIndex.value = idx
  showDebugPanel.value = true
}

function showSourceDetail(idx: number): void {
  const source = safeSources.value[idx]
  if (source) {
    msg.info(`${source.bookSourceName}\nURL: ${source.bookSourceUrl}`)
  }
}

async function testSource(idx: number): Promise<void> {
  testingIdx.value = idx
  try {
    setTestResult(idx, await sourceApi.test(idx))
  } catch (err: unknown) {
    const e = err as Error
    setTestResult(idx, '失败: ' + e.message)
  } finally {
    testingIdx.value = -1
  }
}

async function testAll(): Promise<void> {
  if (!safeSources.value.length) { msg.warning('没有书源可测试'); return }
  if (unlistenTest) { try { unlistenTest() } catch { /* ignore */ }; unlistenTest = null }

  testingAll.value = true
  testProgress.value = 0
  for (const k of Object.keys(testResults)) {
    delete testResults[Number(k)]
  }

  unlistenTest = await sourceApi.listenTestResult((result) => {
    if (result.status === 'ok') {
      setTestResult(result.index, `连接成功 / ${result.time_ms}ms / ${result.size_kb}KB`)
    } else {
      setTestResult(result.index, `失败: ${result.error || '未知错误'}`)
    }
    testProgress.value++
  })

  try {
    await sourceApi.testAll()
    msg.success('测试完成')
  } catch (err: unknown) {
    const e = err as Error
    msg.error('测试失败: ' + e.message)
  } finally {
    testingAll.value = false
    if (unlistenTest) { try { unlistenTest() } catch { /* ignore */ }; unlistenTest = null }
  }
}

async function deleteFailed(): Promise<void> {
  if (!safeSources.value.length) { msg.warning('没有书源可操作'); return }
  dialog.warning({
    title: '删除失效书源',
    content: `将测试所有 ${safeSources.value.length} 个书源`,
    positiveText: '开始检测',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingFailed.value = true
      try {
        const r = await sourceApi.deleteFailed()
        await loadSources()
        msg.success(`已删除 ${r} 个失效书源`)
      } catch (err: unknown) {
        const e = err as Error
        msg.error('操作失败: ' + e.message)
      } finally {
        deletingFailed.value = false
      }
    },
  })
}

function triggerFileInput(): void { fileInput.value?.click() }

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const t = await file.text()
    await sourceApi.add(t)
    await loadSources()
    msg.success('导入成功')
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导入失败: ' + e.message)
  } finally {
    input.value = ''
  }
}

async function handleImportJson(): Promise<void> {
  if (!jsonInput.value.trim()) { msg.warning('请粘贴书源 JSON'); return }
  try {
    await sourceApi.add(jsonInput.value)
    jsonInput.value = ''
    showJsonModal.value = false
    await loadSources()
    msg.success('导入成功')
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导入失败: ' + e.message)
  }
}

async function handleImportFromUrl(): Promise<void> {
  if (!urlInput.value.trim()) { msg.warning('请输入 URL'); return }
  try {
    await sourceApi.importFromUrl(urlInput.value)
    urlInput.value = ''
    showUrlModal.value = false
    await loadSources()
    msg.success('导入成功')
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导入失败: ' + e.message)
  }
}

onMounted(() => {
  loadSources()
  document.addEventListener('click', onDocumentClickForMenu)
})

onUnmounted(() => {
  if (unlistenTest) { try { unlistenTest() } catch { /* ignore */ } }
  document.removeEventListener('click', onDocumentClickForMenu)
})
</script>

<style scoped>
.source-manager-page { position: relative; z-index: 1; }

.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.header-menu-wrapper { position: relative; }
.header-menu-trigger { display: inline-flex; align-items: center; gap: 6px; }
.header-menu-trigger-icon { width: 38px; padding: 0; justify-content: center; }
.header-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1000;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  min-width: 140px;
}
.header-menu-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.header-menu-item:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.header-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.header-menu-item-danger { color: var(--danger); }
.header-menu-item-danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-hover); }
.header-menu-divider { height: 1px; background: var(--border-color); margin: 4px 0; }

.batch-actions { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: var(--bg-active); border: 1px solid var(--brand); border-radius: var(--radius-md); margin-bottom: 12px; }
.btn-sm { padding: 4px 12px; font-size: 12px; height: 28px; }
.source-table { margin-bottom: 24px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: visible; box-shadow: var(--shadow-sm); }

.table-header { display: grid; grid-template-columns: 36px 1.5fr 1fr 60px 2fr 140px; gap: 4px; padding: 10px 18px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); font-weight: 500; align-items: center; }

.group-block { position: relative; }
.group-header { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: var(--bg); border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: background 0.15s; }
.group-header:hover { background: var(--bg-hover); }
.group-name { font-weight: 600; color: var(--text-primary); }
.group-count { font-size: 11px; color: var(--text-muted); margin-left: auto; }

.table-row {
  position: relative;
  display: grid;
  grid-template-columns: 36px 1.5fr 1fr 60px 2fr 140px;
  gap: 4px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  font-size: 13px;
  cursor: pointer;
  background: var(--bg-card);
}
.table-row:hover { background: var(--bg-hover); }
.table-row.selected { background: var(--bg-active); }
.table-row.row-menu-open { z-index: 10; }

.checkbox-all, .checkbox-cell { display: flex; align-items: center; justify-content: center; cursor: pointer; }
.checkbox-all input, .checkbox-cell input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
.source-name { color: var(--text-primary); font-weight: 500; }
.source-group { color: var(--text-muted); font-size: 12px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.enabled { background: #4caf50; box-shadow: 0 0 6px rgba(76,175,80,0.4); }
.status-dot.disabled { background: rgba(128,128,128,0.4); }
.test-result { color: var(--text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.row-actions { display: flex; gap: 4px; align-items: center; justify-content: flex-end; }
.btn-icon-action { width: 28px; height: 28px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: color 0.15s, background 0.15s; flex-shrink: 0; }
.btn-icon-action:hover { color: var(--text-primary); background: var(--bg-hover); }

.row-more-wrapper { position: relative; }

.row-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1000;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  min-width: 120px;
}
.row-menu-item { display: block; width: 100%; padding: 8px 14px; font-size: 13px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; text-align: left; transition: background 0.15s, color 0.15s; font-family: inherit; }
.row-menu-item:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.row-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.row-menu-item-danger { color: var(--danger); }
.row-menu-item-danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-hover); }
.row-menu-divider { height: 1px; background: var(--border-color); margin: 4px 0; }

.menu-drop-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.menu-drop-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.menu-drop-enter-from { opacity: 0; transform: translateY(-4px); }
.menu-drop-leave-to { opacity: 0; transform: translateY(-2px); }
</style>
