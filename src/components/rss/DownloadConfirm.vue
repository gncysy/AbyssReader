<template>
  <n-modal v-model:show="visible" preset="dialog" :title="title" :positive-text="positiveText" :negative-text="negativeText"
    @positive-click="handleConfirm" @negative-click="visible = false" :closable="false" :close-on-esc="false" :mask-closable="false">
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;white-space:pre-wrap">{{ message }}</p>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal, useMessage } from 'naive-ui'
import { executeDownloadImport } from '@/services/download-import.js'
import { useBase64Content } from '@/composables/useBase64Content.js'

interface DownloadInfoLike {
  url: string
  resourceType: string
  count?: number
  fileSize?: number
  content?: string
  [key: string]: unknown
}

interface RssSourceLike {
  sourceUrl: string
  [key: string]: unknown
}

interface ReplaceRuleLike {
  name: string
  pattern: string
  [key: string]: unknown
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

const msg = useMessage()
const visible = ref(false)
const title = ref('')
const message = ref('')
const positiveText = ref('')
const negativeText = ref('取消')
let pendingData: DownloadInfoLike | null = null

const { decodeBase64 } = useBase64Content()

function show(info: DownloadInfoLike): void {
  pendingData = info
  negativeText.value = '取消'
  switch (info.resourceType) {
    case 'bookSource': title.value = '安装书源'; message.value = `检测到 ${info.count || 0} 个书源\n来自: ${info.url}\n是否安装？`; positiveText.value = '安装'; break
    case 'rssSource': title.value = '安装订阅源'; message.value = `检测到 ${info.count || 0} 个订阅源\n来自: ${info.url}\n是否安装？`; positiveText.value = '安装'; break
    case 'replaceRule': title.value = '导入替换规则'; message.value = `检测到替换规则\n来自: ${info.url}\n是否导入？`; positiveText.value = '导入'; break
    case 'txtTocRule': title.value = '导入目录规则'; message.value = `检测到 TXT 目录规则\n来自: ${info.url}\n是否导入？`; positiveText.value = '导入'; break
    case 'purifyRule': title.value = '导入净化规则'; message.value = `检测到净化规则\n来自: ${info.url}\n是否导入？`; positiveText.value = '导入'; break
    default: title.value = '下载完成'; message.value = `未识别的资源类型\n来自: ${info.url}\n文件大小: ${info.fileSize || 0} 字节`; positiveText.value = '知道了'; negativeText.value = ''; break
  }
  visible.value = true
}

async function handleConfirm(): Promise<void> {
  if (!pendingData) { visible.value = false; return }
  try {
    if (pendingData.content) {
      const decoded = decodeBase64(pendingData.content)
      const result = await executeDownloadImportFromContent({
        url: pendingData.url,
        resourceType: pendingData.resourceType,
        content: decoded,
      })
      msg.success(result)
    } else {
      const result = await executeDownloadImport({ url: pendingData.url, resourceType: pendingData.resourceType })
      msg.success(result)
    }
  } catch (err: unknown) {
    const e = err as Error
    msg.error(e?.message || '操作失败')
  }
  visible.value = false
}

async function executeDownloadImportFromContent(info: { url: string; resourceType: string; content: string }): Promise<string> {
  switch (info.resourceType) {
    case 'bookSource': {
      const { source } = await import('@/services/source.js')
      return source.add(info.content)
    }
    case 'rssSource': {
      const { store } = await import('@/services/store.js')
      const rawExisting = await store.get('rssSources')
      const existingSources = asArray(rawExisting) as RssSourceLike[]
      const data = JSON.parse(info.content) as unknown
      const items = Array.isArray(data) ? data : [data]
      let count = 0
      const existing = new Set(existingSources.map((s) => s.sourceUrl))
      const newItems: RssSourceLike[] = []
      for (const item of items) {
        const obj = item as RssSourceLike
        if (obj.sourceUrl && !existing.has(obj.sourceUrl)) {
          newItems.push(obj)
          existing.add(obj.sourceUrl)
          count++
        }
      }
      if (count > 0) {
        const merged = [...existingSources, ...newItems]
        await store.set('rssSources', merged)
      }
      return `已安装 ${count} 个订阅源`
    }
    case 'replaceRule': {
      const { store } = await import('@/services/store.js')
      const data = JSON.parse(info.content) as unknown
      const rawExisting = await store.get('replaceRule')
      const existing = asArray(rawExisting) as ReplaceRuleLike[]
      const incoming = Array.isArray(data) ? data : [data]
      let count = 0
      for (const rule of incoming) {
        const r = rule as ReplaceRuleLike
        if (!existing.find((er) => er.name === r.name && er.pattern === r.pattern)) {
          existing.push(r)
          count++
        }
      }
      if (count > 0) {
        await store.set('replaceRule', existing)
      }
      return `已导入 ${count} 条替换规则`
    }
    case 'txtTocRule': {
      const { store } = await import('@/services/store.js')
      const data = JSON.parse(info.content) as unknown
      const items = Array.isArray(data) ? data : [data]
      await store.set('txtTocRule', items)
      return `已导入 ${items.length} 条目录规则`
    }
    case 'purifyRule': {
      const { store } = await import('@/services/store.js')
      await store.set('purifyRule', info.content)
      return '已导入净化规则'
    }
    default:
      return '已保存到下载目录'
  }
}

defineExpose({ show })
</script>
