<template><div class="bookshelf-page" @click="hideContextMenu" @contextmenu.prevent>
    <header class="page-header">
      <div><h1 class="page-title">书架</h1><p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p></div>
      <div class="header-actions">
        <SearchInput v-model="searchText" placeholder="搜索书名..." name="bookshelf-search" />
        <button class="btn-secondary" @click="showAddUrlModal = true">添加网址</button>
        <button class="btn-secondary" @click="triggerImport">导入 TXT</button>
        <button class="btn-secondary" @click="refreshBooks">刷新</button>
      </div>
    </header>
    <div class="group-tabs">
      <button v-for="group in displayGroups" :key="group.groupId" class="group-tab" :class="{ active: bookshelfStore.activeGroup === group.groupId }" @click="switchGroup(group.groupId)" @contextmenu.prevent.stop="editGroupMenu(group)">{{ group.groupName }}</button>
      <button class="group-tab group-tab-add" @click="addGroup" title="添加分组">+</button>
    </div>
    <input ref="fileInput" type="file" accept=".txt" class="hidden" @change="onImport" />
    <n-modal v-model:show="showAddUrlModal" preset="dialog" title="添加网址" positive-text="添加" @positive-click="addUrlBook">
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
        <div><label>书籍链接</label><n-input v-model:value="addUrl" placeholder="输入书籍详情页或目录页链接..." /></div>
        <div v-if="matchedSourceName"><span style="font-size:13px;color:var(--text-secondary)">将使用书源：</span><span style="font-size:13px;color:var(--brand);font-weight:500">{{ matchedSourceName }}</span></div>
        <div v-else-if="addUrl.trim()"><span style="font-size:13px;color:var(--text-muted)">正在匹配书源...</span></div>
      </div>
    </n-modal>
    <n-modal v-model:show="showGroupDialog" preset="dialog" :title="editingGroup ? '编辑分组' : '添加分组'" positive-text="保存" @positive-click="saveGroup">
      <div class="dialog-form"><div class="form-group"><label>名称</label><n-input v-model:value="groupForm.groupName" placeholder="分组名称" /></div>
        <div v-if="editingGroup" style="margin-top:8px"><button class="btn-danger" style="padding:4px 12px;font-size:12px" @click="deleteGroup(editingGroup)">删除分组</button></div>
      </div>
    </n-modal>
    <BookGrid
      :books="bookshelfStore.filteredBooks"
      :loading="bookshelfStore.loading"
      empty-title="书架空空如也"
      empty-description="导入 TXT、添加网址或搜索添加书籍"
      @click-book="openBook"
      @contextmenu-book="handleBookContextMenu"
    />
    <ContextMenu ref="ctxMenuRef">
      <ContextMenuItem label="移至 未分组" @click="moveSelectedBookToGroup(0)" />
      <ContextMenuItem v-for="g in customGroups" :key="g.groupId" :label="'移至 ' + g.groupName" @click="moveSelectedBookToGroup(g.groupId)" />
      <div class="ctx-divider"></div>
      <ContextMenuItem label="从书架移除" danger @click="removeSelectedBook" />
    </ContextMenu>
    <BookDetail v-if="bookshelfStore.showDetail" :book="bookshelfStore.detailBook" :source="bookshelfStore.detailSource" @close="bookshelfStore.closeDetail()" />
    <Reader v-if="bookshelfStore.showReader" :book="bookshelfStore.readerBook" :source="bookshelfStore.readerSource" :initial-chapters="bookshelfStore.readerChapters as Chapter[]" @close="bookshelfStore.closeReader()" />
  </div></template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { NModal, NInput, useMessage, useDialog } from 'naive-ui'
import { useBookshelfStore } from '@/stores/bookshelf.js'
import { store, reader as readerApi } from '@/services'
import { parseBookInfo } from '@engine/business/book/index.js'
import { fetchWithWebviewFallback } from '@/services/fetch.js'
import SearchInput from '@/components/common/SearchInput.vue'
import BookGrid from '@/components/book/BookGrid.vue'
import BookDetail from '@/components/book/BookDetail.vue'
import Reader from '@/components/reader/Reader.vue'
import { ContextMenu, ContextMenuItem } from '@/components/common/ContextMenu/index.js'
import type { BookSource, Book, Chapter } from '@/types'
import type { EngineBookSource } from '@engine/types.js'

interface GroupItem {
  groupId: number
  groupName: string
  order: number
  show: boolean
}

const msg = useMessage()
const dialog = useDialog()
const bookshelfStore = useBookshelfStore()
const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const showAddUrlModal = ref(false)
const addUrl = ref('')
const ctxMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)
const selectedBook = ref<Book | null>(null)
const groups = ref<GroupItem[]>([])
const showGroupDialog = ref(false)
const editingGroup = ref<GroupItem | null>(null)
const groupForm = ref({ groupName: '' })

function toEngineBookSource(source: BookSource): EngineBookSource {
  return source as unknown as EngineBookSource
}

function isBookSourceArray(value: unknown): value is BookSource[] {
  return Array.isArray(value)
}

function isGroupArray(value: unknown): value is GroupItem[] {
  return Array.isArray(value)
}

const customGroups = computed(() => groups.value.filter((g) => g.groupId > 0 && g.show !== false))
const displayGroups = computed(() => {
  const list = groups.value.filter((g) => g.show !== false)
  list.sort((a, b) => a.order - b.order)
  return list
})

const matchedSource = computed(() => {
  const url = addUrl.value.trim()
  if (!url) return null
  for (const s of sources.value) {
    const pattern = s.bookUrlPattern
    if (!pattern) continue
    try {
      if (new RegExp(pattern).test(url)) return s
    } catch {
      // ignore
    }
  }
  return null
})

const matchedSourceName = computed(() => {
  const s = matchedSource.value
  return s ? s.bookSourceName : null
})

async function loadSources(): Promise<void> {
  try {
    const raw = await store.get('bookSource')
    sources.value = isBookSourceArray(raw) ? raw : []
  } catch { sources.value = [] }
}

async function loadGroups(): Promise<void> {
  try {
    const raw = await store.get('bookGroup')
    groups.value = isGroupArray(raw) ? raw : []
  } catch { groups.value = [] }
}

function switchGroup(groupId: number): void { bookshelfStore.setActiveGroup(groupId) }
function addGroup(): void { editingGroup.value = null; groupForm.value = { groupName: '' }; showGroupDialog.value = true }
function editGroupMenu(group: GroupItem): void { if (group.groupId < 0) return; editingGroup.value = group; groupForm.value = { groupName: group.groupName }; showGroupDialog.value = true }

async function saveGroup(): Promise<void> {
  if (!groupForm.value.groupName.trim()) { msg.warning('名称不能为空'); return }
  const list = [...groups.value]
  if (editingGroup.value) {
    const idx = list.findIndex((g) => g.groupId === editingGroup.value!.groupId)
    if (idx !== -1) {
      list[idx] = { ...list[idx]!, groupName: groupForm.value.groupName }
    }
  } else {
    const maxId = list.reduce((max, g) => Math.max(max, g.groupId || 0), 0)
    list.push({ groupId: maxId + 1, groupName: groupForm.value.groupName, order: list.length, show: true })
  }
  await store.set('bookGroup', list)
  await loadGroups()
  showGroupDialog.value = false
  msg.success('已保存')
}

async function deleteGroup(group: GroupItem): Promise<void> {
  for (const book of bookshelfStore.books) {
    if ((book.group || 0) & group.groupId) {
      await bookshelfStore.moveBookToGroup(book.bookUrl, (book.group || 0) & ~group.groupId)
    }
  }
  groups.value = groups.value.filter((g) => g.groupId !== group.groupId)
  await store.set('bookGroup', groups.value)
  if (bookshelfStore.activeGroup === group.groupId) bookshelfStore.setActiveGroup(0)
  showGroupDialog.value = false
  msg.success('已删除')
}

function hideContextMenu(): void { ctxMenuRef.value?.close() }

function openBook(book: Book): void {
  const source = sources.value.find((s) => s.bookSourceName === book.originName)
  bookshelfStore.openDetail(book, source || null)
}

function handleBookContextMenu(book: Book, event: MouseEvent): void {
  selectedBook.value = book
  ctxMenuRef.value?.open([], event.clientX, event.clientY)
}

function moveSelectedBookToGroup(groupId: number): void {
  ctxMenuRef.value?.close()
  if (!selectedBook.value) return
  bookshelfStore.moveBookToGroup(selectedBook.value.bookUrl, groupId)
}

async function removeSelectedBook(): Promise<void> {
  ctxMenuRef.value?.close()
  if (!selectedBook.value) return
  dialog.warning({
    title: '确认移出',
    content: `确定将《${selectedBook.value.name}》移出书架？`,
    positiveText: '移出',
    negativeText: '取消',
    onPositiveClick: async () => {
      await bookshelfStore.removeBookByUrl(selectedBook.value!.bookUrl)
      msg.success('已移出')
    },
  })
}

async function refreshBooks(): Promise<void> {
  await bookshelfStore.loadBooks()
  await loadSources()
  msg.success('已刷新')
}

function triggerImport(): void { fileInput.value?.click() }

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    if (!text?.trim()) { msg.warning('文件内容为空'); return }
    const name = file.name.replace(/\.txt$/i, '')
    const result = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks()
    msg.success(`已导入《${result.name || name}》`)
  } catch (err: unknown) {
    const e = err as Error
    msg.error('导入失败: ' + e.message)
  } finally {
    input.value = ''
  }
}

async function addUrlBook(): Promise<void> {
  const url = addUrl.value.trim()
  if (!url) { msg.warning('请输入书籍链接'); return }
  const source = matchedSource.value
  if (!source) { msg.error('未找到匹配的书源，请确认链接格式'); return }

  try {
    const html = await fetchWithWebviewFallback(url, { source, timeout: 30000 })
    if (!html) throw new Error('获取页面失败')
    const info = await parseBookInfo(toEngineBookSource(source), html, url)
    if (!info || !info.name) throw new Error('解析书籍信息失败')
    const newBook = { ...info, bookUrl: url, origin: source.bookSourceUrl || '', originName: source.bookSourceName || '' }
    const rawBooks = await store.get('bookshelf')
    const bookList = Array.isArray(rawBooks) ? [...rawBooks] : []
    bookList.unshift(newBook)
    await store.set('bookshelf', bookList)
    await bookshelfStore.loadBooks()
    msg.success(`已添加《${newBook.name}》到书架`)
    showAddUrlModal.value = false
    addUrl.value = ''
  } catch (err: unknown) {
    const e = err as Error
    msg.error('添加失败: ' + (e?.message || String(err)))
  }
}

watch(showAddUrlModal, (val) => { if (!val) addUrl.value = '' })

onMounted(() => { Promise.all([bookshelfStore.loadBooks(), loadSources(), loadGroups()]) })
</script>

<style scoped>
.bookshelf-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.group-tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
.group-tab { padding: 5px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, border-color 0.2s, background 0.2s; }
.group-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.group-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.group-tab-add { font-size: 16px; padding: 3px 12px; }
.hidden { display: none; }
.ctx-divider { height: 1px; background: var(--border-color); margin: 4px 0; }
</style>
