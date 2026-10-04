<template>
  <div class="book-cover" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <div class="cover-placeholder">
      <div class="cover-overlay">
        <div class="cover-title">{{ title || '未命名' }}</div>
        <div class="cover-author">{{ author || '佚名' }}</div>
      </div>
    </div>
    <img
      v-if="displaySrc && !failed"
      :src="displaySrc"
      loading="lazy"
      class="cover-img"
      :class="{ 'cover-img-loaded': loaded }"
      @load="onLoadSuccess"
      @error="onLoadError"
    />
    <div v-if="hovered && !disableChange" class="cover-hover-overlay" @click.stop="$emit('change-cover')">
      <span class="cover-hover-text">更换封面</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { proxyCover } from '@/services/comic.js'
import { store } from '@/services/store.js'
import type { BookSource } from '@/types'

const props = withDefaults(defineProps<{
  src: string | null
  title: string
  author: string
  disableChange?: boolean
  baseUrl?: string | null
  fallbackUrls?: string[]
}>(), {
  disableChange: false,
  baseUrl: null,
  fallbackUrls: () => [],
})

const emit = defineEmits<{ 'load-error': []; 'change-cover': [] }>()

const failed = ref(false)
const loaded = ref(false)
const hovered = ref(false)
const proxiedSrc = ref<string | null>(null)
const sourceCache = ref<BookSource | null>(null)
const currentUrlIndex = ref(0)
const triedUrls = ref<Set<string>>(new Set())
// 修复：标记是否已尝试过代理，避免重复触发
const proxyAttempted = ref(false)

let sourcesCache: BookSource[] | null = null
let sourcesLoadingPromise: Promise<BookSource[]> | null = null

async function getSources(): Promise<BookSource[]> {
  if (sourcesCache) return sourcesCache
  if (sourcesLoadingPromise) return sourcesLoadingPromise
  sourcesLoadingPromise = (async () => {
    try {
      const raw = await store.get('bookSource')
      sourcesCache = Array.isArray(raw) ? (raw as BookSource[]) : []
    } catch {
      sourcesCache = []
    } finally {
      sourcesLoadingPromise = null
    }
    return sourcesCache || []
  })()
  return sourcesLoadingPromise
}

/**
 * 从原始 URL 中剥离 Legado 的 `,{...}` 尾缀。
 * 例如：https://img/1.jpg,{"headers":{"Referer":"..."}}
 * 返回干净 URL。让浏览器能直接请求（失败时再走代理）。
 */
function stripUrlOptions(url: string): string {
  const commaIdx = url.indexOf(',{')
  if (commaIdx === -1) return url
  return url.substring(0, commaIdx)
}

const allUrls = computed(() => {
  const urls: string[] = []
  if (props.src) urls.push(stripUrlOptions(props.src))
  if (props.fallbackUrls && props.fallbackUrls.length > 0) {
    const seen = new Set(urls)
    for (const url of props.fallbackUrls) {
      const clean = stripUrlOptions(url)
      if (clean && !seen.has(clean)) {
        urls.push(clean)
        seen.add(clean)
      }
    }
  }
  return urls
})

const displaySrc = computed(() => {
  // 优先显示代理结果
  if (proxiedSrc.value) return proxiedSrc.value
  // 其次显示原始 URL（已剥离尾缀）
  if (allUrls.value.length > 0 && currentUrlIndex.value < allUrls.value.length) {
    return allUrls.value[currentUrlIndex.value]
  }
  return null
})

function resetState(): void {
  failed.value = false
  loaded.value = false
  proxiedSrc.value = null
  currentUrlIndex.value = 0
  triedUrls.value = new Set()
  proxyAttempted.value = false
}

watch(() => [props.src, props.fallbackUrls], () => {
  resetState()
})

async function loadSourceInfo(): Promise<void> {
  if (sourceCache.value) return
  try {
    const sources = await getSources()
    if (sources.length === 0) return
    // 优先按 bookUrlPattern 匹配
    const matched = sources.find((s) => {
      const pattern = s.bookUrlPattern
      if (!pattern || !props.baseUrl) return false
      try {
        return new RegExp(pattern).test(props.baseUrl)
      } catch { return false }
    })
    if (matched) {
      sourceCache.value = matched
      return
    }
    // 按 bookSourceUrl 域名匹配
    const domainMatched = sources.find((s) => {
      if (!s.bookSourceUrl || !props.baseUrl) return false
      try {
        const sourceHost = new URL(s.bookSourceUrl).hostname
        const baseHost = new URL(props.baseUrl).hostname
        return sourceHost === baseHost
      } catch { return false }
    })
    if (domainMatched) {
      sourceCache.value = domainMatched
    }
  } catch {
    // ignore
  }
}

function onLoadSuccess(): void {
  failed.value = false
  loaded.value = true
  // 修复：不清空 proxiedSrc！
  // 如果当前显示的是代理结果，继续用它，不要切回原始 URL（会再次失败）
}

async function onLoadError(): Promise<void> {
  // 修复：如果当前显示的就是代理结果，且代理结果加载失败，才进入彻底失败状态
  if (proxiedSrc.value) {
    // 代理结果也失败了，尝试下一个原始 URL（如果有）
    if (currentUrlIndex.value + 1 < allUrls.value.length) {
      loaded.value = false
      proxiedSrc.value = null
      currentUrlIndex.value++
      return
    }
    // 没有更多备选，彻底失败
    loaded.value = false
    failed.value = true
    emit('load-error')
    return
  }

  // 当前是原始 URL
  const currentUrl = allUrls.value[currentUrlIndex.value]
  if (currentUrl) triedUrls.value.add(currentUrl)

  // 还有备选 URL，切下一个
  if (currentUrlIndex.value + 1 < allUrls.value.length) {
    loaded.value = false
    currentUrlIndex.value++
    return
  }

  // 所有原始 URL 都失败，尝试代理（只试一次）
  if (props.src && !proxyAttempted.value) {
    proxyAttempted.value = true
    try {
      if (!sourceCache.value) {
        await loadSourceInfo()
      }
      const source = sourceCache.value || { bookSourceUrl: props.baseUrl || '' }
      const dataUrl = await proxyCover(props.src, JSON.stringify(source))
      if (dataUrl && dataUrl.startsWith('data:')) {
        proxiedSrc.value = dataUrl
        loaded.value = false
        failed.value = false
        return
      }
    } catch {
      // ignore
    }
  }

  // 彻底失败
  loaded.value = false
  failed.value = true
  emit('load-error')
}

onMounted(() => {
  if (props.baseUrl) loadSourceInfo()
})
</script>

<style scoped>
.book-cover {
  width: 100%;
  height: 100%;
  background: var(--bg-hover);
  overflow: hidden;
  position: relative;
  border-radius: inherit;
}

.cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 1;
}

.cover-img-loaded {
  opacity: 1;
}

.cover-placeholder {
  position: absolute;
  inset: 0;
  background: url('/images/cover.jpg') center/cover;
  z-index: 0;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 18px;
  text-align: center;
}

.cover-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cover-author {
  font-size: 12px;
  color: rgba(255, 255, 255, 1);
  margin-top: 4px;
}

.cover-hover-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.book-cover:hover .cover-hover-overlay {
  opacity: 1;
}

.cover-hover-text {
  color: #fff;
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.1em;
  user-select: none;
}
</style>
