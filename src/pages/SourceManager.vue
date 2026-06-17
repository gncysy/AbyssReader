<template>
  <div class="p-10">
    <div class="flex justify-between items-end mb-10">
      <div>
        <h2 class="font-display text-3xl font-bold text-ink dark:text-parchment">书源管理</h2>
        <p class="text-parchment-muted text-sm mt-2 tracking-wide">
          {{ sources.length }} 个书源
          <span v-if="selectedIds.length > 0" class="text-amber ml-2">· 已选 {{ selectedIds.length }}</span>
        </p>
      </div>
      <div class="flex gap-3 flex-wrap">
        <button @click="triggerFileInput" class="btn-secondary text-xs">上传文件</button>
        <button @click="showUrlModal = true" class="btn-secondary text-xs">从 URL</button>
        <button @click="showAddModal = true" class="btn-primary text-xs">粘贴 JSON</button>
        <button @click="testAll" :disabled="testingAll" class="btn-secondary text-xs">
          {{ testingAll ? `测试中 ${testProgress}/${sources.length}` : '测试全部' }}
        </button>
        <button @click="deleteFailed" :disabled="deletingFailed" class="btn-danger text-xs">
          {{ deletingFailed ? `删除中 ${deleteProgress}/${sources.length}` : '删除失效' }}
        </button>
        <button v-if="selectedIds.length > 0" @click="deleteSelected" class="btn-danger text-xs">
          删除选中 ({{ selectedIds.length }})
        </button>
      </div>
    </div>

    <div v-if="sources.length > 0" class="space-y-1">
      <div v-for="source in sources" :key="source.id" class="surface-raised p-4 flex justify-between items-center group">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <input type="checkbox" :checked="selectedIds.includes(source.id)"
            @change="toggleSelect(source.id)" class="accent-amber" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3">
              <h3 class="font-body text-sm font-medium text-ink dark:text-parchment">{{ source.name }}</h3>
              <span :class="source.enabled ? 'text-verdigris' : 'text-parchment-muted/50'" class="text-[10px] tracking-widest">
                {{ source.enabled ? '· 已启用' : '· 已禁用' }}
              </span>
              <span v-if="source.group" class="text-[10px] text-parchment-muted/50">[{{ source.group }}]</span>
              <span v-if="testResults[source.id]" class="text-[10px]"
                :class="testResults[source.id].startsWith('连接成功') ? 'text-verdigris' : 'text-rust'">
                {{ testResults[source.id] }}
              </span>
            </div>
            <p class="text-parchment-muted text-xs mt-1 truncate">{{ source.url }}</p>
          </div>
        </div>
        <div class="flex gap-2 ml-4 items-center">
          <button @click="testSource(source)" class="text-[10px] tracking-widest px-2 py-1 border border-dashed border-parchment-muted/30 text-parchment-muted/60 hover:text-verdigris transition-colors">
            {{ testingId === source.id ? '...' : '测试' }}
          </button>
          <button @click="toggleSource(source)" class="text-[10px] tracking-widest px-3 py-1 border transition-colors"
            :class="source.enabled ? 'border-verdigris/30 text-verdigris hover:bg-verdigris/10' : 'border-amber/30 text-amber hover:bg-amber/10'">
            {{ source.enabled ? '禁用' : '启用' }}
          </button>
          <button @click="deleteSource(source)" class="btn-danger text-[10px] tracking-widest">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-24">
      <p class="font-display text-8xl text-parchment-muted/20 mb-8 italic">~</p>
      <p class="text-parchment-muted tracking-widest text-sm">暂 无 书 源</p>
    </div>

    <input ref="fileInput" type="file" accept=".json" @change="onFileSelected" class="hidden" />

    <!-- JSON 弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center" @click.self="showAddModal = false">
      <div class="surface w-[600px] max-w-[90vw] p-8">
        <h3 class="font-display text-xl text-ink dark:text-parchment mb-6">导入书源</h3>
        <textarea v-model="sourceJson" placeholder='粘贴书源 JSON...' class="w-full h-64 bg-ink-light dark:bg-ink border border-ink-border p-4 text-sm font-mono text-parchment outline-none resize-none"></textarea>
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showAddModal = false" class="btn-secondary text-xs">取消</button>
          <button @click="importSource" class="btn-primary text-xs">导入</button>
        </div>
      </div>
    </div>

    <!-- URL 弹窗 -->
    <div v-if="showUrlModal" class="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center" @click.self="showUrlModal = false">
      <div class="surface w-[500px] max-w-[90vw] p-8">
        <h3 class="font-display text-xl text-ink dark:text-parchment mb-6">从 URL 导入</h3>
        <input v-model="sourceUrl" type="text" placeholder="输入书源 JSON URL..." class="input-underline" @keyup.enter="importFromUrl" />
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showUrlModal = false" class="btn-secondary text-xs">取消</button>
          <button @click="importFromUrl" :disabled="loadingUrl" class="btn-primary text-xs">{{ loadingUrl ? '下载中...' : '导入' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import {
  getBookSources,
  addBookSource,
  importSourcesFromUrl,
  deleteBookSource,
  deleteBookSources,
  toggleBookSource,
  testBookSource,
  testAllSources,
  deleteFailedSources,
  type BookSource
} from '../api/tauri'

const sources = ref<BookSource[]>([])
const showAddModal = ref(false)
const showUrlModal = ref(false)
const sourceJson = ref('')
const sourceUrl = ref('')
const loadingUrl = ref(false)
const testingId = ref('')
const testingAll = ref(false)
const testProgress = ref(0)
const deletingFailed = ref(false)
const deleteProgress = ref(0)
const testResults = ref<Record<string, string>>({})
const selectedIds = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

let unlistenTest: (() => void) | null = null
let unlistenDelete: (() => void) | null = null

async function loadSources() {
  sources.value = await getBookSources()
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const msg = await addBookSource(text)
    await loadSources()
    alert(msg)
  } catch (err: any) {
    alert('导入失败: ' + err)
  }
  input.value = ''
}

async function importSource() {
  if (!sourceJson.value.trim()) {
    alert('请粘贴书源 JSON')
    return
  }
  try {
    const msg = await addBookSource(sourceJson.value)
    sourceJson.value = ''
    showAddModal.value = false
    await loadSources()
    alert(msg)
  } catch (err: any) {
    alert('导入失败: ' + err)
  }
}

async function importFromUrl() {
  if (!sourceUrl.value.trim()) return
  loadingUrl.value = true
  try {
    const msg = await importSourcesFromUrl(sourceUrl.value)
    sourceUrl.value = ''
    showUrlModal.value = false
    await loadSources()
    alert(msg)
  } catch (err: any) {
    alert('导入失败: ' + err)
  } finally {
    loadingUrl.value = false
  }
}

async function testSource(source: BookSource) {
  testingId.value = source.id
  try {
    testResults.value[source.id] = await testBookSource(source.id)
  } catch (err: any) {
    testResults.value[source.id] = `失败: ${err}`
  }
  testingId.value = ''
}

async function testAll() {
  testingAll.value = true
  testProgress.value = 0
  testResults.value = {}

  unlistenTest = await listen('source-test-result', (event: any) => {
    const r = event.payload
    testResults.value[r.id] = r.status === 'ok'
      ? `连接成功 · ${r.time_ms}ms · ${r.size_kb}KB`
      : `失败: ${r.error}`
    testProgress.value++
  })

  try {
    await testAllSources()
  } catch (err: any) {
    alert('测试失败: ' + err)
  } finally {
    testingAll.value = false
    if (unlistenTest) unlistenTest()
  }
}

async function deleteFailed() {
  if (!confirm('确定删除所有连接失败的书源？')) return
  deletingFailed.value = true
  deleteProgress.value = 0

  unlistenDelete = await listen('delete-failed-progress', (event: any) => {
    const p = event.payload
    deleteProgress.value = p.tested
  })

  try {
    const count = await deleteFailedSources()
    await loadSources()
    alert(`已删除 ${count} 个失效书源`)
  } catch (err: any) {
    alert('操作失败: ' + err)
  } finally {
    deletingFailed.value = false
    if (unlistenDelete) unlistenDelete()
  }
}

async function deleteSelected() {
  if (selectedIds.value.length === 0) return
  if (!confirm(`确定删除选中的 ${selectedIds.value.length} 个书源？`)) return
  try {
    await deleteBookSources(selectedIds.value)
    selectedIds.value = []
    await loadSources()
  } catch (err: any) {
    alert('删除失败: ' + err)
  }
}

async function toggleSource(source: BookSource) {
  await toggleBookSource(source.id, !source.enabled)
  await loadSources()
}

async function deleteSource(source: BookSource) {
  if (confirm(`确定删除「${source.name}」？`)) {
    await deleteBookSource(source.id)
    await loadSources()
  }
}

onMounted(() => {
  loadSources()
})
onUnmounted(() => {
  if (unlistenTest) unlistenTest()
  if (unlistenDelete) unlistenDelete()
})
</script>
