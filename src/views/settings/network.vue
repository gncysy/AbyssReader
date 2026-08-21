<template>
  <div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>其他设置</h2></header>
    <div class="section"><h3 class="section-title">User-Agent</h3><p class="section-desc">用于书源网络请求的 UA，选择合适的可解决部分网站的访问限制</p>
      <div class="ua-preset"><label class="input-label">预设 UA</label><CustomDropdown v-model="selectedPreset" :options="presetOptions" placeholder="选择预设 UA..." style="width:100%" /></div>
      <div class="ua-current"><label class="input-label">当前 UA</label><textarea v-model="customUA" class="ua-textarea" placeholder="可在此编辑当前 UA..." rows="3"></textarea>
        <div style="display:flex;gap:10px;margin-top:10px"><button class="btn-primary" @click="saveUA">保存</button><button class="btn-secondary" @click="resetUA">恢复默认</button></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import CustomDropdown from '@/components/settings/CustomDropdown.vue'
import BackButton from '@/components/common/BackButton.vue'

const msg = useMessage()
const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.231 Mobile Safari/537.36'
const presetOptions = [
  { label: '移动端 Android（推荐）', value: DEFAULT_UA },
  { label: '桌面端 Windows', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  { label: 'iOS iPhone', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { label: 'iPad', value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { label: '自定义', value: '__custom__' },
]
const selectedPreset = ref(DEFAULT_UA)
const customUA = ref(DEFAULT_UA)

onMounted(async () => {
  const saved = await store.get('userAgent')
  if (typeof saved === 'string' && saved) {
    customUA.value = saved
    const match = presetOptions.find((o) => o.value === saved)
    selectedPreset.value = match ? saved : '__custom__'
  }
})
watch(selectedPreset, (val) => { if (val !== '__custom__') customUA.value = val })
async function saveUA(): Promise<void> { const ua = customUA.value.trim(); if (!ua) return; await store.set('userAgent', ua); msg.success('User-Agent 已保存') }
async function resetUA(): Promise<void> { selectedPreset.value = DEFAULT_UA; customUA.value = DEFAULT_UA; await store.set('userAgent', DEFAULT_UA); msg.success('已恢复默认 UA') }
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 680px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.section { margin-bottom: 32px; }
.section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 6px; }
.section-desc { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; line-height: 1.6; }
.ua-preset { margin-bottom: 20px; }
.input-label { display: block; font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px; }
.ua-current { display: flex; flex-direction: column; }
.ua-textarea { width: 100%; padding: 10px 14px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); outline: none; resize: vertical; font-family: var(--font-mono); line-height: 1.5; box-sizing: border-box; }
.ua-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
</style>
