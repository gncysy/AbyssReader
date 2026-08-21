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
const sourceCache = ref<any>(null)
const currentUrlIndex = ref(0)
const triedUrls = ref<Set<string>>(new Set())

const allUrls = computed(() => {
  const urls: string[] = []
  if (props.src) urls.push(props.src)
  if (props.fallbackUrls && props.fallbackUrls.length > 0) {
    const seen = new Set(urls)
    for (const url of props.fallbackUrls) {
      if (url && !seen.has(url)) {
        urls.push(url)
        seen.add(url)
      }
    }
  }
  return urls
})

const displaySrc = computed(() => {
  if (proxiedSrc.value) return proxiedSrc.value
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
}

watch(() => [props.src, props.fallbackUrls], () => {
  resetState()
})

async function loadSourceInfo(): Promise<void> {
  if (sourceCache.value) return
  try {
    const sources = await store.get('bookSource')
    if (Array.isArray(sources) && sources.length > 0) {
      // 优先按 bookUrlPattern 匹配
      const matched = sources.find((s: any) => {
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
      const domainMatched = sources.find((s: any) => {
        if (!s.bookSourceUrl || !props.baseUrl) return false
        try {
          const sourceHost = new URL(s.bookSourceUrl).hostname
          const baseHost = new URL(props.baseUrl).hostname
          return sourceHost === baseHost
        } catch { return false }
      })
      if (domainMatched) {
        sourceCache.value = domainMatched
      } else {
        // 找不到匹配，不设置（保持 null）
        sourceCache.value = null
      }
    }
  } catch {
    // ignore
  }
}

function onLoadSuccess(): void {
  failed.value = false
  loaded.value = true
  proxiedSrc.value = null
}

async function onLoadError(): Promise<void> {
  const currentUrl = allUrls.value[currentUrlIndex.value]
  if (currentUrl) {
    triedUrls.value.add(currentUrl)
  }

  if (currentUrlIndex.value + 1 < allUrls.value.length) {
    loaded.value = false
    currentUrlIndex.value++
    return
  }

  if (props.src && !proxiedSrc.value) {
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
  color: rgba(255, 255, 255, 0.8);
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
