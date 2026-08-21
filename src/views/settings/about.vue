<template>
  <div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>关于</h2></header>
    <div class="about-tabs">
      <button class="about-tab" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">关于</button>
      <button class="about-tab" :class="{ active: activeTab === 'guide' }" @click="activeTab = 'guide'">使用文档</button>
      <button class="about-tab" :class="{ active: activeTab === 'disclaimer' }" @click="activeTab = 'disclaimer'">免责声明</button>
    </div>
    <div v-if="activeTab === 'about'" class="about-content">
      <div class="about-logo"><img src="/icons/icon.svg" alt="墨阅" class="logo-icon" /><span class="logo-name">墨阅</span></div>
      <p class="about-version">v{{ appVersion }}</p><p class="about-desc">桌面端小说阅读器</p><p class="about-license">GPL-3.0</p>
      <div class="about-links"><a href="https://github.com/gncysy/AbyssReader" target="_blank" rel="noopener noreferrer" class="about-link">GitHub</a></div>
      <button class="btn-check-update" :disabled="checking || downloading" @click="checkForUpdate"><span v-if="checking">检查中...</span><span v-else-if="downloading">下载中 {{ downloadProgress }}%</span><span v-else>{{ updateStatus || '检查更新' }}</span></button>
      <p v-if="updateError" class="update-error">{{ updateError }}</p>
    </div>
    <div v-else class="about-markdown" v-html="renderedMarkdown" @click="handleMarkdownClick"></div>

    <n-modal v-model:show="showDownloadConfirm" preset="dialog" title="发现新版本" positive-text="下载安装" negative-text="取消"
      @positive-click="confirmDownload" @negative-click="showDownloadConfirm = false">
      <p style="color:var(--text-secondary);font-size:14px;line-height:1.6">
        发现新版本 v{{ latestVersion }}，是否下载并安装？<br/>
        下载完成后程序将关闭。
      </p>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import { NModal } from 'naive-ui'
import { APP_VERSION } from '@/constants/index.js'
import BackButton from '@/components/common/BackButton.vue'
import { windowApi } from '@/services/window.js'

import guideRaw from '@/assets/guide.md?raw'
import disclaimerRaw from '@/assets/disclaimer.md?raw'

const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000
const UPDATE_CHECK_KEY = 'lastUpdateCheck'
const GITHUB_API_URL = 'https://api.github.com/repos/gncysy/AbyssReader-Tauri/releases?per_page=5'

const CHUNK_SIZE = 1024 * 1024
const CONCURRENT_CHUNKS = 3
const MIN_CHUNKED_SIZE = CHUNK_SIZE * 2

const appVersion = APP_VERSION
const activeTab = ref('about')
const checking = ref(false)
const downloading = ref(false)
const downloadProgress = ref(0)
const updateStatus = ref('')
const updateError = ref('')
const showDownloadConfirm = ref(false)
const latestVersion = ref('')
let pendingDownloadUrl = ''
let pendingFileName = ''
let pendingSha256: string | undefined = undefined

function renderMarkdown(raw: string): string {
  if (!raw) return ''
  const html = marked.parse(raw, { breaks: true }) as string
  return html.replace(/<a href="#([^"]+)"/g, (_, anchor: string) => {
    return `<a class="md-anchor" href="javascript:void(0)" data-anchor="${encodeURIComponent(decodeURIComponent(anchor))}"`
  })
}

const renderedMarkdown = computed(() => {
  const raw = activeTab.value === 'guide' ? guideRaw : disclaimerRaw
  if (!raw) return '<p style="color:var(--text-muted)">加载中...</p>'
  return renderMarkdown(raw)
})

function handleMarkdownClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  const link = target.closest('a.md-anchor')
  if (!link) return
  e.preventDefault()
  e.stopPropagation()
  const anchor = link.getAttribute('data-anchor')
  if (!anchor) return
  const el = document.getElementById(anchor)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  const lastCheck = localStorage.getItem(UPDATE_CHECK_KEY)
  if (lastCheck && Date.now() - parseInt(lastCheck) < UPDATE_CHECK_INTERVAL) {
    updateStatus.value = '最近已检查过'
    return
  }
  localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()))
  checkForUpdate()
})

async function checkForUpdate(): Promise<void> {
  checking.value = true
  updateStatus.value = ''
  updateError.value = ''
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const releases = await res.json() as unknown[]
    if (!Array.isArray(releases) || releases.length === 0) {
      updateStatus.value = '暂无发布版本'
      return
    }
    const latestRelease = releases[0] as Record<string, unknown>
    const latest = String(latestRelease.tag_name || '').replace(/^v/, '')
    if (!latest) throw new Error('未能解析版本号')
    if (compareVersions(appVersion, latest)) {
      latestVersion.value = latest
      updateStatus.value = `发现新版本 v${latest}${latestRelease.prerelease ? ' [预发布]' : ''}`
      const assets = Array.isArray(latestRelease.assets) ? latestRelease.assets as Record<string, unknown>[] : []
      const asset = assets.find((a) => {
        const name = String(a.name || '')
        return name.endsWith('.exe') || name.endsWith('.msi') || name.endsWith('.AppImage') || name.endsWith('.dmg')
      })
      if (asset) {
        const downloadUrl = String(asset.browser_download_url || '')
        const assetName = String(asset.name || 'update')
        if (downloadUrl) {
          pendingDownloadUrl = downloadUrl
          pendingFileName = assetName
          pendingSha256 = undefined

          const sha256Asset = assets.find((a) => {
            const name = String(a.name || '').toLowerCase()
            return name.endsWith('.sha256') || name.includes('checksum')
          })
          if (sha256Asset) {
            const shaUrl = String(sha256Asset.browser_download_url || '')
            if (shaUrl) {
              try {
                const shaRes = await fetch(shaUrl)
                const shaText = await shaRes.text()
                const expectedHash = shaText.trim().split(/\s+/)[0] || ''
                if (expectedHash) pendingSha256 = expectedHash
              } catch {
                // ignore
              }
            }
          }
          showDownloadConfirm.value = true
        }
      } else {
        updateError.value = '未找到安装包'
      }
    } else {
      updateStatus.value = '已是最新版本'
    }
  } catch (err: unknown) {
    const e = err as Error
    updateError.value = '检查失败: ' + (e.message || '网络错误')
  } finally {
    checking.value = false
  }
}

function confirmDownload(): void {
  showDownloadConfirm.value = false
  if (pendingDownloadUrl && pendingFileName) {
    downloadAndInstall(pendingDownloadUrl, pendingFileName, pendingSha256)
  }
}

function compareVersions(current: string, latest: string): boolean {
  // 修复：剥离预发布后缀（如 -beta、-rc.1），只比较数字部分
  const cleanCurrent = current.split('-')[0] || current
  const cleanLatest = latest.split('-')[0] || latest
  const a = cleanCurrent.split('.').map((s) => {
    const n = Number(s)
    return isNaN(n) ? 0 : n
  })
  const b = cleanLatest.split('.').map((s) => {
    const n = Number(s)
    return isNaN(n) ? 0 : n
  })
  const maxLen = Math.max(a.length, b.length)
  for (let i = 0; i < maxLen; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (bv > av) return true
    if (bv < av) return false
  }
  return false
}

async function computeSHA256(data: Uint8Array): Promise<string> {
  try {
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

function saveBlobAndClose(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
  updateStatus.value = '下载完成，即将关闭程序进行安装'
  setTimeout(async () => { try { await windowApi.close() } catch {} }, 1500)
}

async function downloadStreaming(
  downloadUrl: string,
  fileName: string,
  total: number,
  expectedSHA256?: string,
): Promise<void> {
  const response = await fetch(downloadUrl)
  if (!response.ok) throw new Error('下载失败 HTTP ' + response.status)
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0) downloadProgress.value = Math.round((received / total) * 100)
  }

  const allData = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    allData.set(chunk, offset)
    offset += chunk.length
  }

  if (expectedSHA256) {
    const actualHash = await computeSHA256(allData)
    if (actualHash && actualHash.toLowerCase() !== expectedSHA256.toLowerCase()) {
      updateError.value = 'SHA256 校验失败，文件可能被篡改，已停止下载'
      return
    }
  }

  const blob = new Blob([allData.buffer as ArrayBuffer])
  saveBlobAndClose(blob, fileName)
}

async function downloadWithChunks(
  downloadUrl: string,
  fileName: string,
  total: number,
  chunkSize: number,
  concurrency: number,
  expectedSHA256?: string,
): Promise<void> {
  const totalChunks = Math.ceil(total / chunkSize)
  const chunkData: Uint8Array[] = new Array(totalChunks)
  const downloaded = new Array(totalChunks).fill(false)
  let completedChunks = 0
  let nextChunkIndex = 0

  async function downloadChunk(index: number): Promise<void> {
    if (index >= totalChunks || downloaded[index]) return
    downloaded[index] = true
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, total) - 1

    const response = await fetch(downloadUrl, {
      headers: { Range: `bytes=${start}-${end}` },
    })
    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`分片下载失败 HTTP ${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    const data = new Uint8Array(buffer)
    chunkData[index] = data
    completedChunks++
    downloadProgress.value = Math.round((completedChunks / totalChunks) * 100)
  }

  async function worker(): Promise<void> {
    while (nextChunkIndex < totalChunks) {
      const index = nextChunkIndex
      nextChunkIndex++
      await downloadChunk(index)
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, totalChunks); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  const allData = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunkData) {
    if (chunk !== undefined) {
      allData.set(chunk, offset)
      offset += chunk.length
    }
  }

  if (offset !== total) {
    throw new Error(`下载不完整: 期望 ${total} 字节，实际 ${offset} 字节`)
  }

  if (expectedSHA256) {
    const actualHash = await computeSHA256(allData)
    if (actualHash && actualHash.toLowerCase() !== expectedSHA256.toLowerCase()) {
      updateError.value = 'SHA256 校验失败，文件可能被篡改，已停止下载'
      return
    }
  }

  const blob = new Blob([allData.buffer as ArrayBuffer])
  saveBlobAndClose(blob, fileName)
}

async function downloadAndInstall(downloadUrl: string, fileName: string, expectedSHA256?: string): Promise<void> {
  downloading.value = true
  downloadProgress.value = 0
  try {
    const headRes = await fetch(downloadUrl, { method: 'HEAD' })
    const total = Number(headRes.headers.get('content-length') || 0)
    const acceptRanges = headRes.headers.get('accept-ranges') || ''

    if (total > MIN_CHUNKED_SIZE && acceptRanges.toLowerCase() === 'bytes') {
      await downloadWithChunks(downloadUrl, fileName, total, CHUNK_SIZE, CONCURRENT_CHUNKS, expectedSHA256)
    } else {
      await downloadStreaming(downloadUrl, fileName, total, expectedSHA256)
    }
  } catch (err: unknown) {
    const e = err as Error
    updateError.value = '下载失败: ' + e.message
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 780px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.about-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 0; }
.about-tab { padding: 8px 18px; font-size: 14px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
.about-tab:hover { color: var(--text-primary); }
.about-tab.active { color: var(--brand); border-bottom-color: var(--brand); }
.about-content { padding: 48px 32px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); text-align: center; box-shadow: var(--shadow-sm); }
.about-logo { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 16px; }
.logo-icon { width: 52px; height: 52px; }
.logo-name { font-size: 26px; font-weight: 600; color: var(--text-primary); letter-spacing: 0.04em; }
.about-version { font-size: 15px; color: var(--brand); margin: 6px 0; font-weight: 500; }
.about-desc { font-size: 14px; color: var(--text-secondary); margin: 6px 0; line-height: 1.5; }
.about-license { font-size: 12px; color: var(--text-muted); opacity: 0.6; margin-top: 10px; }
.about-links { margin-top: 20px; }
.about-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; font-size: 14px; color: var(--text-secondary); text-decoration: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: color 0.2s, border-color 0.2s, background 0.2s, transform 0.2s; }
.about-link:hover { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); transform: translateY(-1px); }
.btn-check-update { display: inline-flex; align-items: center; justify-content: center; margin-top: 20px; padding: 8px 22px; font-size: 14px; font-weight: 500; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; transition: color 0.2s, background 0.2s, border-color 0.2s, transform 0.2s; }
.btn-check-update:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); border-color: var(--brand); transform: translateY(-1px); }
.btn-check-update:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.update-error { margin-top: 10px; font-size: 12px; color: #e74c3c; line-height: 1.5; }
.about-markdown { padding: 32px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); line-height: 1.8; color: var(--text-primary); }
.about-markdown :deep(h1) { font-size: 24px; font-weight: 600; margin: 0 0 16px; }
.about-markdown :deep(h2) { font-size: 20px; font-weight: 600; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.about-markdown :deep(h3) { font-size: 17px; font-weight: 600; margin: 20px 0 8px; }
.about-markdown :deep(p) { margin: 0 0 12px; color: var(--text-secondary); }
.about-markdown :deep(ul), .about-markdown :deep(ol) { margin: 0 0 12px; padding-left: 24px; color: var(--text-secondary); }
.about-markdown :deep(li) { margin-bottom: 4px; }
.about-markdown :deep(code) { background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 13px; }
.about-markdown :deep(pre) { background: var(--bg); padding: 16px; border-radius: var(--radius-md); overflow-x: auto; margin: 0 0 12px; }
.about-markdown :deep(a) { color: var(--brand); }
.about-markdown :deep(a.md-anchor) { color: var(--brand); cursor: pointer; }
.about-markdown :deep(blockquote) { border-left: 3px solid var(--brand); margin: 0 0 12px; padding: 4px 16px; color: var(--text-muted); }
.about-markdown :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 24px 0; }
.about-markdown :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
.about-markdown :deep(th), .about-markdown :deep(td) { padding: 8px 12px; border: 1px solid var(--border-color); text-align: left; font-size: 14px; }
.about-markdown :deep(th) { background: var(--bg-hover); font-weight: 600; }
.about-markdown :deep(img) { max-width: 100%; }
</style>
