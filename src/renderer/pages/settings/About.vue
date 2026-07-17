<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>关于</h2>
    </header>

    <div class="subpage-body">
      <div class="about-content">
        <div class="about-logo">
          <img src="/icons/icon.svg" alt="墨阅" class="logo-icon" />
          <span class="logo-name">墨阅</span>
        </div>
        <p class="about-version">v{{ appVersion }}</p>
        <p class="about-desc">桌面端小说阅读器 · 兼容开源阅读书源</p>
        <p class="about-license">GPL-3.0</p>
        <div class="about-links">
          <a
            href="https://github.com/gncysy/AbyssReader"
            target="_blank"
            rel="noopener noreferrer"
            class="about-link"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>

        <button
          class="btn-check-update"
          :disabled="checking"
          @click="checkForUpdate"
        >
          {{ checking ? '检查中...' : (updateStatus || '检查更新') }}
        </button>

        <p v-if="updateError" class="update-error">{{ updateError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { APP_VERSION } from '@shared/constants'

const appVersion = APP_VERSION

const checking = ref(false)
const updateStatus = ref('')
const updateError = ref('')

function compareVersions(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number)
  const latestParts = latest.split('.').map(Number)
  const maxLen = Math.max(currentParts.length, latestParts.length)

  for (let i = 0; i < maxLen; i++) {
    const a = currentParts[i] || 0
    const b = latestParts[i] || 0
    if (b > a) return true
    if (b < a) return false
  }
  return false
}

async function checkForUpdate() {
  checking.value = true
  updateStatus.value = ''
  updateError.value = ''

  try {
    const response = await fetch(
      'https://api.github.com/repos/gncysy/AbyssReader/releases?per_page=5',
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const releases = await response.json()
    if (!Array.isArray(releases) || releases.length === 0) {
      updateStatus.value = '暂无发布版本'
      return
    }

    const latestRelease = releases[0]
    const latestVersion = latestRelease.tag_name?.replace(/^v/, '') || ''

    if (!latestVersion) {
      throw new Error('未能解析版本号')
    }

    const isNewer = compareVersions(appVersion, latestVersion)

    if (isNewer) {
      const prereleaseTag = latestRelease.prerelease ? ' [预发布]' : ''
      updateStatus.value = `发现新版本 v${latestVersion}${prereleaseTag}`
    } else {
      updateStatus.value = '已是最新版本'
    }
  } catch (err: any) {
    updateError.value = '检查失败: ' + (err.message || '网络错误')
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  checkForUpdate()
})
</script>

<style scoped>
.about-content {
  padding: 48px 32px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  text-align: center;
  box-shadow: var(--shadow-sm);
}

.about-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 16px;
}

.logo-icon {
  width: 52px;
  height: 52px;
  display: block;
  filter: drop-shadow(0 2px 8px rgba(212, 160, 23, 0.2));
}

.logo-name {
  font-size: 26px;
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.about-version {
  font-size: 15px;
  color: var(--brand);
  margin: 6px 0;
  font-weight: var(--font-medium);
}

.about-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 6px 0;
  line-height: 1.5;
}

.about-license {
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.6;
  margin-top: 10px;
  letter-spacing: 0.04em;
}

.about-links {
  margin-top: 20px;
}

.about-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.about-link:hover {
  color: var(--text-primary);
  border-color: var(--brand);
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.about-link:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.btn-check-update {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  padding: 8px 22px;
  font-size: 14px;
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out), border-color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.btn-check-update:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--brand);
  transform: translateY(-1px);
}

.btn-check-update:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.btn-check-update:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.update-error {
  margin-top: 10px;
  font-size: 12px;
  color: #e74c3c;
  line-height: 1.5;
}
</style>