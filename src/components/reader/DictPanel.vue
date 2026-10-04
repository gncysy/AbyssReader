<template>
  <n-modal :show="visible" :z-index="50001" preset="card" title="字典" style="max-width:700px;max-height:85vh" :bordered="false" @update:show="(val: boolean) => $emit('update:visible', val)">
    <div v-if="rules.length > 1" class="dict-tabs">
      <button v-for="(r, i) in rules" :key="i" class="dict-tab" :class="{ active: activeTab === i }" @click="switchTab(i)">{{ r.name }}</button>
    </div>
    <div v-if="loading" style="text-align:center;padding:40px"><LoadingSpinner /></div>
    <div v-else class="dict-content" @click="handleLinkClick" v-html="activeContent"></div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NModal } from 'naive-ui'
import DOMPurify from 'isomorphic-dompurify'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const props = defineProps<{
  visible: boolean
  rules: { name: string }[]
  activeTab: number
  loading: boolean
  contents: Record<number, string>
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'switch-tab': [index: number]
}>()

const activeContent = computed(() => {
  const raw = props.contents[props.activeTab] || '<p>点击标签查询</p>'
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','h1','h2','h3','h4','h5','h6','a','blockquote','pre','code','ul','ol','li'],
    ALLOWED_ATTR: ['href','title','style'],
  })
})

function switchTab(i: number): void { emit('switch-tab', i) }

function handleLinkClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (!link) return
  const href = link.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
    e.preventDefault()
    return
  }
  e.preventDefault()
  e.stopPropagation()

  let fullUrl: string
  try {
    // 尝试基于当前链接的 base 解析
    fullUrl = href.startsWith('http') ? href : new URL(href, window.location.href).href
  } catch {
    // 相对链接无法解析，使用 href 原始值
    fullUrl = href.startsWith('http') ? href : 'https://' + href.replace(/^\/+/, '')
  }
  window.open(fullUrl, '_blank')
}
</script>

<style scoped>
.dict-tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
.dict-tab { padding: 4px 12px; font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, border-color 0.2s; }
.dict-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.dict-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.dict-content { max-height: 60vh; overflow-y: auto; padding: 8px; }
.dict-content :deep(a) { color: var(--brand); text-decoration: none; cursor: pointer; }
.dict-content :deep(a):hover { text-decoration: underline; }
</style>
