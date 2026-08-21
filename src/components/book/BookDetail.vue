<template>
  <Teleport to="body">
    <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
      <Transition name="detail">
        <div v-if="book" class="detail-overlay" @click.self="handleClose" role="dialog" aria-modal="true">
          <div class="detail-container" tabindex="-1">
            <header class="detail-header">
              <button class="btn-back" @click="handleClose" aria-label="关闭详情">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <h2 class="detail-title">{{ book.name || '加载中...' }}</h2>
            </header>
            <div class="detail-body">
              <div class="detail-cover">
                <BookCover
                  :src="mainCover"
                  :fallback-urls="fallbackCoverUrls"
                  :title="book.name"
                  :author="displayAuthor"
                  :disable-change="false"
                  :base-url="book.bookUrl"
                  @change-cover="openCoverPicker"
                />
                <div v-if="book.originName" class="cover-source-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  {{ book.originName }}
                </div>
              </div>
              <div class="detail-info">
                <h1 class="book-title">{{ book.name }}</h1>
                <p class="book-author">{{ displayAuthor }}</p>
                <div class="book-meta-row">
                  <span v-if="loadedKind" class="meta-chip meta-kind clickable" @click="handleSearchKind" title="点击搜索此分类">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    {{ loadedKind }}
                  </span>
                  <span v-if="loadedWordCount" class="meta-chip meta-word-count">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/></svg>
                    {{ loadedWordCount }}
                  </span>
                  <span v-if="loadedLastChapter" class="meta-chip meta-last-chapter">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <span class="meta-chip-scroll">{{ loadedLastChapter }}</span>
                  </span>
                </div>
                <div class="book-intro-scroll" v-html="fullIntroHtml"></div>
              </div>
            </div>
            <div class="detail-toc">
              <ChapterList :chapters="chapters" :current-chapter-id="currentChapterId" :loading="loadingToc" @select="handleChapterClick" />
            </div>
            <footer class="detail-footer">
              <button class="btn-icon-footer btn-icon-danger" @click="showRemoveConfirm = true" title="移出书架">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <button class="btn-icon-footer btn-icon-footer-with-label" @click="handleChangeSource" title="换源">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                <span class="btn-footer-label">换源</span>
              </button>
              <div style="flex:1"></div>
              <div style="position:relative">
                <button class="btn-icon-footer" @click.stop="toggleMoreMenu" title="更多">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
                <Transition name="menu-drop">
                  <div v-if="showMoreMenu" class="more-menu">
                    <button v-if="needsLogin" class="more-menu-item" @click="handleLoginFromMenu">登录</button>
                    <button class="more-menu-item" @click="openSourceVar">设置源变量</button>
                    <button class="more-menu-item" @click="openBookVar">设置书籍变量</button>
                    <button class="more-menu-item" @click="openBookUrl">打开书籍网址</button>
                  </div>
                </Transition>
              </div>
              <button class="btn-secondary" @click="handleAddToShelf" :disabled="isInShelf" style="font-size:13px;padding:0 18px;white-space:nowrap;flex-shrink:0">{{ isInShelf ? '已在书架' : '加书架' }}</button>
              <button class="btn-primary" @click="handleRead" style="font-size:13px;padding:0 18px;white-space:nowrap;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                {{ hasReadingProgress ? '继续阅读' : '开始阅读' }}
              </button>
            </footer>
          </div>
          <n-modal v-model:show="showChangeSource" preset="card" title="换源" style="max-width:650px" :bordered="false">
            <div class="cs-wrapper">
              <button class="btn-primary" @click="handleSearchForChange" :disabled="changingSource" style="padding:10px 18px;font-size:14px;width:100%;flex-shrink:0">{{ changingSource ? '搜索中... (' + searchDone + '/' + searchTotal + ')' : '开始换源搜索' }}</button>
              <div v-if="changeSourceResults.length > 0" class="change-source-list">
                <div v-for="item in changeSourceResults" :key="String(item.bookUrl) + String(item._sourceName)" class="change-source-item" @click="handleConfirmChangeSource(item)">
                  <div class="cs-item-main"><span class="cs-item-name">{{ item.name }}</span><span class="cs-item-author">{{ item.author }}</span></div>
                  <div class="cs-item-meta"><span class="cs-item-source">{{ item._sourceName }}</span><span v-if="item.lastChapter" class="cs-item-chapter">{{ item.lastChapter }}</span></div>
                </div>
              </div>
              <div v-else-if="changingSource" style="display:flex;justify-content:center;padding:40px;flex-shrink:0"><LoadingSpinner /></div>
              <div v-else style="color:var(--text-muted);text-align:center;padding:20px;flex-shrink:0">点击按钮并发搜索所有书源</div>
            </div>
          </n-modal>
          <n-modal v-model:show="showCoverPicker" preset="card" title="选择封面" style="max-width:650px;max-height:80vh" :bordered="false">
            <div class="cover-picker-wrapper">
              <div v-if="coverPickerLoading" style="display:flex;justify-content:center;padding:40px"><LoadingSpinner /></div>
              <div v-else-if="coverOptions.length === 0" style="color:var(--text-muted);text-align:center;padding:30px">未找到同名书籍，请检查书源</div>
              <div v-else class="cover-picker-grid">
                <div v-for="(item, idx) in coverOptions" :key="idx" class="cover-picker-item" :class="{ active: item.isCurrent }" @click="selectCover(item)">
                  <img :src="item.coverUrl || '/images/cover.jpg'" loading="lazy" @error="(e) => (e.target as HTMLImageElement).src = '/images/cover.jpg'" />
                  <div class="cover-picker-label">{{ item.label }}</div>
                  <div v-if="item.isCurrent" class="cover-picker-badge">当前</div>
                </div>
              </div>
            </div>
          </n-modal>
          <n-modal v-model:show="showSourceVarModal" preset="dialog" title="设置源变量" positive-text="保存" @positive-click="saveSourceVar">
            <n-input v-model:value="sourceVarInput" type="textarea" placeholder='输入源变量值（书源 JS 中通过 java.get("key") 获取）' :autosize="{ minRows: 3, maxRows: 8 }" />
          </n-modal>
          <n-modal v-model:show="showBookVarModal" preset="dialog" title="设置书籍变量" positive-text="保存" @positive-click="saveBookVar">
            <n-input v-model:value="bookVarInput" type="textarea" placeholder='输入书籍变量值（书源 JS 中通过 java.get("custom") 获取）' :autosize="{ minRows: 3, maxRows: 8 }" />
          </n-modal>
        </div>
      </Transition>
      <ConfirmDialog v-model:visible="showRemoveConfirm" title="确认移出" :content="`确定将《${book?.name ?? ''}》移出书架？`" confirm-text="移出" @confirm="handleRemoveFromShelf" />
    </n-config-provider>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { NConfigProvider, NModal, NInput } from 'naive-ui'
import { useNaiveTheme } from '@/composables/useNaiveTheme.js'
import { useBookDetail } from '@/composables/useBookDetail.js'
import BookCover from '@/components/book/BookCover.vue'
import ChapterList from '@/components/chapter/ChapterList.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import type { Book, BookSource } from '@/types'

const props = defineProps<{ book: Book | null; source: BookSource | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { naiveTheme, themeOverrides } = useNaiveTheme()
const detail = useBookDetail(props.book, props.source)

const {
  currentChapterId, hasReadingProgress,
  showRemoveConfirm, showMoreMenu, showSourceVarModal, showBookVarModal,
  sourceVarInput, bookVarInput,
  needsLogin, isInShelf,
  mainCover, fallbackCoverUrls,
  displayAuthor, fullIntroHtml,
  loadedKind, loadedWordCount, loadedLastChapter,
  chapters, loadingToc,
  showChangeSource, changeSourceResults, changingSource, searchDone, searchTotal,
  showCoverPicker, coverPickerLoading, coverOptions,
  init, handleChapterClick, handleRead, handleAddToShelf, handleRemoveFromShelf,
  handleChangeSource, handleSearchForChange, handleConfirmChangeSource,
  handleSearchKind, toggleMoreMenu, handleLoginFromMenu,
  openSourceVar, openBookVar, openBookUrl,
  saveSourceVar, saveBookVar,
  openCoverPicker, selectCover, handleEscape, onDocumentClick,
} = detail

function handleClose(): void { detail.handleClose(); emit('close') }

onMounted(() => { init(); document.addEventListener('keydown', handleEscape); document.addEventListener('click', onDocumentClick) })
onUnmounted(() => { document.removeEventListener('keydown', handleEscape); document.removeEventListener('click', onDocumentClick) })
</script>

<style scoped>
.detail-enter-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.detail-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.detail-enter-from { opacity: 0; transform: scale(0.96); }
.detail-leave-to { opacity: 0; transform: scale(0.98); }
.detail-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.55); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.detail-container { width: 100%; max-width: 840px; height: 90vh; max-height: 800px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-xl); }
.detail-header { display: flex; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--border-color); gap: 14px; }
.detail-title { font-size: 17px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.btn-back { background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px; transition: background 0.2s, color 0.2s; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-color); }
.detail-body { display: flex; gap: 28px; padding: 22px 26px; border-bottom: 1px solid var(--border-color); overflow: hidden; align-items: flex-start; }
.detail-cover { width: 130px; min-width: 130px; height: 180px; border-radius: var(--radius-md); overflow: hidden; position: relative; }
.cover-source-badge { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: rgba(255,255,255,0.7); font-size: 9px; padding: 3px 6px; display: flex; align-items: center; gap: 3px; z-index: 5; }
.detail-info { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; }
.book-title { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; line-height: 1.3; }
.book-author { font-size: 14px; color: var(--text-secondary); margin: 0; }
.book-meta-row { display: flex; gap: 8px; flex-wrap: nowrap; align-items: center; }
.meta-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.meta-chip.clickable { cursor: pointer; }
.meta-chip.clickable:hover { opacity: 0.8; }
.meta-kind { background: rgba(212,160,23,0.12); color: var(--brand); border: 1px solid rgba(212,160,23,0.25); flex-shrink: 0; }
.meta-word-count { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border-color); flex-shrink: 0; }
.meta-last-chapter { background: rgba(92,138,122,0.12); color: #5c8a7a; border: 1px solid rgba(92,138,122,0.25); flex: 1; min-width: 0; overflow: hidden; }
.meta-chip-scroll { white-space: nowrap; overflow-x: auto; display: block; }
.book-intro-scroll { font-size: 13px; color: var(--text-muted); line-height: 1.8; height: 96px; overflow-y: auto; padding-right: 8px; }
.detail-toc { flex: 1; display: flex; flex-direction: column; padding: 0 22px 4px; min-height: 0; overflow: hidden; }
.detail-footer { display: flex; align-items: center; gap: 10px; padding: 14px 26px; border-top: 1px solid var(--border-color); }
.btn-icon-footer { width: 36px; height: 36px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: color 0.18s, background 0.18s; flex-shrink: 0; }
.btn-icon-footer:hover { color: var(--text-primary); background: var(--bg-hover); }
.btn-icon-footer-with-label { width: auto; padding: 0 10px; gap: 4px; flex-shrink: 0; }
.btn-icon-danger { color: #e74c3c; }
.btn-icon-danger:hover { color: #c0392b; background: rgba(231,76,60,0.1); }
.btn-footer-label { font-size: 13px; margin-left: 2px; }
.more-menu { position: absolute; bottom: 44px; right: 0; z-index: 100; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 4px 0; min-width: 140px; }
.more-menu-item { display: block; width: 100%; padding: 10px 16px; font-size: 13px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; text-align: left; transition: background 0.15s, color 0.15s; font-family: inherit; }
.more-menu-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.menu-drop-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.menu-drop-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.menu-drop-enter-from { opacity: 0; transform: translateY(4px); }
.menu-drop-leave-to { opacity: 0; transform: translateY(2px); }
.cs-wrapper { display: flex; flex-direction: column; gap: 12px; height: 60vh; max-height: 520px; overflow: hidden; }
.change-source-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 4px 0; background: var(--bg-card); }
.change-source-item { display:flex; flex-direction:column; padding:10px 14px; cursor:pointer; border-radius:var(--radius-sm); transition:background 0.15s; color: var(--text-primary); }
.change-source-item:hover { background:var(--bg-hover) }
.cs-item-main { display:flex; gap:8px; align-items:baseline }
.cs-item-name { font-size:14px; font-weight:500; color:var(--text-primary) }
.cs-item-author { font-size:12px; color:var(--text-muted) }
.cs-item-meta { display:flex; gap:12px; margin-top:3px; font-size:11px; color:var(--text-muted) }
.cs-item-source { color:var(--brand) }
.cs-item-chapter { color:var(--text-muted) }
.cover-picker-wrapper { padding: 4px 0; }
.cover-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 14px; max-height: 55vh; overflow-y: auto; padding: 4px; }
.cover-picker-item { position: relative; cursor: pointer; border-radius: var(--radius-md); overflow: hidden; border: 2px solid var(--border-color); transition: border-color 0.2s, transform 0.2s; aspect-ratio: 2/3; background: var(--bg-hover); }
.cover-picker-item:hover { transform: scale(1.03); border-color: var(--brand); }
.cover-picker-item.active { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.cover-picker-item img { width: 100%; height: 100%; object-fit: cover; }
.cover-picker-label { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.65); color: rgba(255,255,255,0.85); font-size: 10px; padding: 4px 6px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cover-picker-badge { position: absolute; top: 6px; right: 6px; background: var(--brand); color: #0f0f0f; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }
</style>
