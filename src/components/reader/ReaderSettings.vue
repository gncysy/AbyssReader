<template>
  <Transition name="settings-popup">
    <div v-if="visible" class="settings-overlay" @click.self="close">
      <div class="settings-container">
        <div class="settings-header">
          <span>阅读设置</span>
          <button class="settings-close" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="settings-body">
          <div class="setting-row">
            <span class="setting-label">应用全局设置</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="useGlobal" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <p class="setting-hint" v-if="useGlobal">以下设置使用全局配置，修改后所有书生效</p>
          <p class="setting-hint" v-else>以下设置为本书独立配置</p>

          <div class="settings-section">
            <div class="setting-row">
              <span class="setting-label">主题</span>
              <div class="theme-btns">
                <button v-for="t in themes" :key="t.value" class="theme-btn" :class="{ active: localTheme === t.value }" @click="setLocalTheme(t.value)">{{ t.label }}</button>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-label">字体大小</span>
              <div class="stepper">
                <button class="stepper-btn" @click="adjustFontSize(-1)">A−</button>
                <span class="stepper-value">{{ localFontSize }}</span>
                <button class="stepper-btn" @click="adjustFontSize(1)">A+</button>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-label">简繁转换</span>
              <div class="option-group">
                <button v-for="opt in converterOptions" :key="opt.value" class="option-btn" :class="{ active: localConverterType === opt.value }" @click="setLocalConverterType(opt.value)">{{ opt.label }}</button>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-label">净化替换规则</span>
              <label class="toggle-switch"><input type="checkbox" v-model="localUseReplaceRule" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">段落重排</span>
              <label class="toggle-switch"><input type="checkbox" v-model="localReSegment" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">目录逆序</span>
              <label class="toggle-switch"><input type="checkbox" v-model="localReverseToc" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">长章节拆分</span>
              <label class="toggle-switch"><input type="checkbox" v-model="localSplitLongChapter" /><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-label">图片样式</span>
              <CustomDropdown v-model="localImageStyle" :options="imageStyleOptions" placeholder="默认" style="min-width:120px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useReaderStore, useBookshelfStore } from '@/stores'
import { READER_THEMES } from '@/constants/index.js'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'

const readerStore = useReaderStore()
const bookshelfStore = useBookshelfStore()
const themes = READER_THEMES
const converterOptions = [
  { label: '不转换', value: 0 },
  { label: '繁 → 简', value: 1 },
  { label: '简 → 繁', value: 2 },
]

const SAVE_DEBOUNCE_MS = 500

const visible = ref(false)
const _bookUrl = ref('')
const useGlobal = ref(true)

const localTheme = ref('dark')
const localFontSize = ref(18)
const localConverterType = ref(0)
const localUseReplaceRule = ref(true)
const localReSegment = ref(false)
const localReverseToc = ref(false)
const localSplitLongChapter = ref(true)
const localImageStyle = ref('DEFAULT')
const localDelTag = ref(0)

const imageStyleOptions = [
  { label: '默认', value: 'DEFAULT' },
  { label: '全宽', value: 'FULL' },
  { label: '纯文字', value: 'TEXT' },
  { label: '单图', value: 'SINGLE' },
]

let saveTimer: ReturnType<typeof setTimeout> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function setLocalTheme(val: string): void {
  localTheme.value = val
  scheduleApplyToStore()
}

function setLocalConverterType(val: number): void {
  localConverterType.value = val
  scheduleApplyToStore()
}

function adjustFontSize(delta: number): void {
  localFontSize.value = Math.max(12, Math.min(32, localFontSize.value + delta))
  scheduleApplyToStore()
}

function scheduleApplyToStore(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    applyToStore()
    saveTimer = null
  }, SAVE_DEBOUNCE_MS)
}

function applyToStore(): void {
  const settings: Record<string, unknown> = {
    useReplaceRule: localUseReplaceRule.value,
    _useGlobal: useGlobal.value,
  }

  if (useGlobal.value) {
    readerStore.setReaderTheme(localTheme.value)
    readerStore.setFontSize(localFontSize.value)
    readerStore.setReSegment(localReSegment.value)
    readerStore.setChineseConverterType(localConverterType.value)
  } else {
    Object.assign(settings, {
      _theme: localTheme.value,
      _fontSize: localFontSize.value,
      _converterType: localConverterType.value,
      reSegment: localReSegment.value,
      reverseToc: localReverseToc.value,
      splitLongChapter: localSplitLongChapter.value,
      imageStyle: localImageStyle.value,
      delTag: localDelTag.value,
    })
  }

  readerStore.saveBookSettings(_bookUrl.value, settings)

  const book = bookshelfStore.books.find((b) => b.bookUrl === _bookUrl.value)
  if (book) {
    book.readConfig = {
      ...(book.readConfig || {}),
      ...settings,
    }
  }
}

function loadGlobalSettings(): void {
  localTheme.value = readerStore.readerTheme
  localFontSize.value = readerStore.fontSize
  localReSegment.value = readerStore.reSegment
  localConverterType.value = readerStore.chineseConverterType
  const saved = readerStore.getBookSettings(_bookUrl.value)
  localUseReplaceRule.value = typeof saved.useReplaceRule === 'boolean' ? saved.useReplaceRule : true
  localReverseToc.value = typeof saved.reverseToc === 'boolean' ? saved.reverseToc : false
  localSplitLongChapter.value = typeof saved.splitLongChapter === 'boolean' ? saved.splitLongChapter : true
  localImageStyle.value = typeof saved.imageStyle === 'string' ? saved.imageStyle : 'DEFAULT'
  localDelTag.value = typeof saved.delTag === 'number' ? saved.delTag : 0
}

function loadLocalSettings(): void {
  const settings = readerStore.getBookSettings(_bookUrl.value)
  localTheme.value = typeof settings._theme === 'string' ? settings._theme : readerStore.readerTheme
  localFontSize.value = typeof settings._fontSize === 'number' ? settings._fontSize : readerStore.fontSize
  localConverterType.value = typeof settings._converterType === 'number' ? settings._converterType : readerStore.chineseConverterType
  localUseReplaceRule.value = typeof settings.useReplaceRule === 'boolean' ? settings.useReplaceRule : true
  localReSegment.value = typeof settings.reSegment === 'boolean' ? settings.reSegment : readerStore.reSegment
  localReverseToc.value = typeof settings.reverseToc === 'boolean' ? settings.reverseToc : false
  localSplitLongChapter.value = typeof settings.splitLongChapter === 'boolean' ? settings.splitLongChapter : true
  localImageStyle.value = typeof settings.imageStyle === 'string' ? settings.imageStyle : 'DEFAULT'
  localDelTag.value = typeof settings.delTag === 'number' ? settings.delTag : 0
}

function open(_readConfig: unknown, bookUrl: string): void {
  _bookUrl.value = bookUrl

  const saved = readerStore.getBookSettings(bookUrl)
  const savedUseGlobal = saved._useGlobal
  useGlobal.value = typeof savedUseGlobal === 'boolean' ? savedUseGlobal : !readerStore.hasBookSettings(bookUrl)

  if (useGlobal.value) {
    loadGlobalSettings()
  } else {
    loadLocalSettings()
  }
  visible.value = true
}

function close(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  applyToStore()
  visible.value = false
}

watch(useGlobal, (newVal) => {
  if (!visible.value) return
  if (newVal) { loadGlobalSettings() } else { loadLocalSettings() }
  scheduleApplyToStore()
})

watch(
  [localTheme, localFontSize, localConverterType, localUseReplaceRule, localReSegment, localReverseToc, localSplitLongChapter, localImageStyle, localDelTag],
  () => {
    if (visible.value) scheduleApplyToStore()
  }
)

watch(
  () => [readerStore.readerTheme, readerStore.fontSize, readerStore.reSegment, readerStore.chineseConverterType],
  () => {
    if (visible.value && useGlobal.value) loadGlobalSettings()
  }
)

defineExpose({ open, close })
</script>

<style scoped>
.settings-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); }
.settings-container { width: 400px; max-height: 80vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); display: flex; flex-direction: column; overflow: hidden; }
.settings-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-color); font-size: 15px; font-weight: 600; color: var(--text-primary); flex-shrink: 0; }
.settings-close { width: 32px; height: 32px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.settings-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.settings-body { padding: 16px 20px; overflow-y: auto; }
.setting-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color); }
.setting-label { font-size: 14px; color: var(--text-primary); font-weight: 500; }
.setting-hint { font-size: 12px; color: var(--text-muted); margin: 4px 0 8px; }
.settings-section { margin-top: 4px; }
.theme-btns { display: flex; gap: 4px; }
.theme-btn { padding: 4px 10px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.theme-btn:hover { color: var(--text-primary); border-color: var(--brand); }
.theme-btn.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.option-group { display: flex; gap: 4px; }
.option-btn { padding: 4px 8px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.option-btn:hover { color: var(--text-primary); border-color: var(--brand); }
.option-btn.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.stepper { display: flex; align-items: center; gap: 8px; }
.stepper-btn { padding: 4px 10px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.stepper-btn:hover { color: var(--text-primary); border-color: var(--brand); }
.stepper-value { font-size: 14px; color: var(--text-primary); min-width: 24px; text-align: center; }
.settings-popup-enter-active, .settings-popup-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.settings-popup-enter-from, .settings-popup-leave-to { opacity: 0; transform: scale(0.95); }
</style>
