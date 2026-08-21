<template>
  <div class="rss-edit-page">
    <header class="subpage-header">
      <BackButton /><h2>{{ isNew ? '新建订阅源' : '编辑订阅源' }}</h2>
      <div style="flex:1"></div>
      <button class="btn-primary" :disabled="saving" @click="saveSource">{{ saving ? '保存中...' : '保存' }}</button>
    </header>
    <div class="edit-tabs">
      <button v-for="tab in tabs" :key="tab.key" class="edit-tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button>
    </div>
    <div class="edit-body">
      <div v-if="activeTab === 'base'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>名称 <span class="required">*</span></label><input v-model="form.sourceName" type="text" class="input-search" placeholder="订阅源名称" /></div>
          <div class="form-group full"><label>URL <span class="required">*</span></label><input v-model="form.sourceUrl" type="text" class="input-search" placeholder="https://example.com" /></div>
          <div class="form-group"><label>图标</label><input v-model="form.sourceIcon" type="text" class="input-search" placeholder="https://example.com/icon.png" /></div>
          <div class="form-group"><label>分组</label><input v-model="form.sourceGroup" type="text" class="input-search" placeholder="legado" list="group-suggest" /><datalist id="group-suggest"><option v-for="g in existingGroups" :key="g" :value="g" /></datalist></div>
          <div class="form-group full"><label>注释</label><input v-model="form.sourceComment" type="text" class="input-search" placeholder="订阅源说明" /></div>
          <div class="form-group"><label>分类 URL</label><input v-model="form.sortUrl" type="text" class="input-search" placeholder="分类1::url1" /></div>
          <div class="form-group"><label>搜索 URL</label><input v-model="form.searchUrl" type="text" class="input-search" placeholder="https://example.com/search?q={{key}}" /></div>
        </div>
        <div class="form-divider">开关</div>
        <div class="switch-grid">
          <label class="switch-item"><input type="checkbox" v-model="form.enabled" /> 启用</label>
          <label class="switch-item"><input type="checkbox" v-model="form.singleUrl" /> 单页源</label>
          <label class="switch-item"><input type="checkbox" v-model="form.enabledCookieJar" /> 保存 Cookie</label>
          <label class="switch-item"><input type="checkbox" v-model="form.preload" /> 预加载</label>
          <label class="switch-item"><input type="checkbox" v-model="form.cacheFirst" /> 优先缓存</label>
        </div>
        <div class="form-divider">类型 & 样式</div>
        <div class="form-grid">
          <div class="form-group"><label>类型</label><select v-model="form.type" class="form-select"><option :value="0">网页</option><option :value="1">图片</option><option :value="2">视频</option></select></div>
          <div class="form-group"><label>文章样式</label><select v-model="form.articleStyle" class="form-select"><option :value="0">列表</option><option :value="1">卡片</option><option :value="2">网格2列</option><option :value="3">瀑布流</option><option :value="4">网格3列</option></select></div>
        </div>
      </div>
      <div v-if="activeTab === 'start'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>起始 HTML</label><textarea v-model="form.startHtml" class="form-textarea" rows="6"></textarea></div>
          <div class="form-group full"><label>起始样式</label><textarea v-model="form.startStyle" class="form-textarea" rows="3"></textarea></div>
          <div class="form-group full"><label>起始 JS</label><textarea v-model="form.startJs" class="form-textarea" rows="4"></textarea></div>
          <div class="form-group full"><label>预注入 JS</label><textarea v-model="form.preloadJs" class="form-textarea" rows="3"></textarea></div>
        </div>
        <div class="switch-grid">
          <label class="switch-item"><input type="checkbox" v-model="form.enableJs" /> 启用 JS</label>
          <label class="switch-item"><input type="checkbox" v-model="form.loadWithBaseUrl" /> 基于 BaseURL 加载</label>
          <label class="switch-item"><input type="checkbox" v-model="form.showWebLog" /> 输出 WebView 日志</label>
        </div>
      </div>
      <div v-if="activeTab === 'list'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>列表规则</label><textarea v-model="form.ruleArticles" class="form-textarea" rows="3"></textarea></div>
          <div class="form-group full"><label>下一页规则</label><input v-model="form.ruleNextPage" type="text" class="input-search" /></div>
          <div class="form-group"><label>标题规则</label><input v-model="form.ruleTitle" type="text" class="input-search" /></div>
          <div class="form-group"><label>链接规则</label><input v-model="form.ruleLink" type="text" class="input-search" /></div>
          <div class="form-group"><label>日期规则</label><input v-model="form.rulePubDate" type="text" class="input-search" /></div>
          <div class="form-group"><label>描述规则</label><input v-model="form.ruleDescription" type="text" class="input-search" /></div>
          <div class="form-group"><label>图片规则</label><input v-model="form.ruleImage" type="text" class="input-search" /></div>
        </div>
      </div>
      <div v-if="activeTab === 'webview'" class="tab-content">
        <div class="form-grid">
          <div class="form-group full"><label>正文规则</label><textarea v-model="form.ruleContent" class="form-textarea" rows="3"></textarea></div>
          <div class="form-group full"><label>样式</label><textarea v-model="form.style" class="form-textarea" rows="3"></textarea></div>
          <div class="form-group full"><label>注入 JS</label><textarea v-model="form.injectJs" class="form-textarea" rows="3"></textarea></div>
          <div class="form-group full"><label>内容白名单</label><textarea v-model="form.contentWhitelist" class="form-textarea" rows="2"></textarea></div>
          <div class="form-group full"><label>内容黑名单</label><textarea v-model="form.contentBlacklist" class="form-textarea" rows="2"></textarea></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import BackButton from '@/components/common/BackButton.vue'
import type { RssSource } from '@/types'

const route = useRoute()
const router = useRouter()
const msg = useMessage()

const isNew = computed(() => route.query.sourceUrl === undefined)
const saving = ref(false)
const activeTab = ref('base')

const tabs = [
  { key: 'base', label: '基础信息' },
  { key: 'start', label: '起始页' },
  { key: 'list', label: '列表规则' },
  { key: 'webview', label: 'WebView' },
]

const form = ref<RssSource>({
  sourceName: '', sourceUrl: '', sourceIcon: null, sourceGroup: null, sourceComment: null, variableComment: null,
  enabled: true, singleUrl: false, enabledCookieJar: true, preload: false, cacheFirst: false,
  type: 0, articleStyle: 0, sortUrl: null, searchUrl: null, header: null, concurrentRate: null, jsLib: null,
  loginUrl: null, loginUi: null, loginCheckJs: null, coverDecodeJs: null,
  startHtml: null, startStyle: null, startJs: null, preloadJs: null,
  enableJs: true, loadWithBaseUrl: true, showWebLog: false,
  ruleArticles: null, ruleNextPage: null, ruleTitle: null, ruleLink: null, rulePubDate: null, ruleDescription: null, ruleImage: null,
  ruleContent: null, style: null, injectJs: null, contentWhitelist: null, contentBlacklist: null, shouldOverrideUrlLoading: null,
  customOrder: 0,
})

const existingGroups = ref<string[]>([])
let originalSourceUrl = ''

onMounted(async () => {
  await loadExistingGroups()
  const sourceUrl = route.query.sourceUrl as string
  if (sourceUrl) {
    originalSourceUrl = sourceUrl
    const data = await store.get('rssSources')
    const sources = asArray<RssSource>(data)
    const found = sources.find((s) => s.sourceUrl === sourceUrl)
    if (found) form.value = JSON.parse(JSON.stringify(found)) as RssSource
  }
})

async function loadExistingGroups(): Promise<void> {
  try {
    const data = await store.get('rssSources')
    const sources = asArray<RssSource>(data)
    const groups = new Set<string>()
    for (const s of sources) {
      if (s.sourceGroup) groups.add(s.sourceGroup)
    }
    existingGroups.value = Array.from(groups).sort()
  } catch {
    existingGroups.value = []
  }
}

async function saveSource(): Promise<void> {
  const f = form.value
  if (!f.sourceName.trim()) { msg.warning('请填写名称'); return }
  if (!f.sourceUrl.trim()) { msg.warning('请填写 URL'); return }

  saving.value = true
  try {
    const data = await store.get('rssSources')
    const sources = asArray<RssSource>(data)
    const newUrl = f.sourceUrl.trim()

    if (originalSourceUrl && newUrl !== originalSourceUrl) {
      const filtered = sources.filter((s) => s.sourceUrl !== originalSourceUrl)
      if (filtered.some((s) => s.sourceUrl === newUrl)) {
        msg.warning('URL 已存在')
        saving.value = false
        return
      }
      f.sourceUrl = newUrl
      filtered.push(f)
      await store.set('rssSources', filtered)
      originalSourceUrl = newUrl
    } else if (originalSourceUrl) {
      const idx = sources.findIndex((s) => s.sourceUrl === originalSourceUrl)
      if (idx !== -1) sources[idx] = f
      else sources.push(f)
      await store.set('rssSources', sources)
    } else {
      if (sources.some((s) => s.sourceUrl === newUrl)) {
        msg.warning('URL 已存在')
        saving.value = false
        return
      }
      const maxOrder = sources.reduce((max, s) => Math.max(max, s.customOrder || 0), 0)
      f.customOrder = maxOrder + 1
      sources.push(f)
      await store.set('rssSources', sources)
    }

    msg.success('已保存')
    router.back()
  } catch (err: unknown) {
    const e = err as Error
    msg.error('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.rss-edit-page { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-shrink: 0; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.edit-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; flex-shrink: 0; }
.edit-tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
.edit-tab:hover { color: var(--text-primary); }
.edit-tab.active { color: var(--brand); border-bottom-color: var(--brand); }
.edit-body { flex: 1; overflow-y: auto; padding-bottom: 20px; }
.tab-content { max-width: 820px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form-group .required { color: #e74c3c; }
.input-search { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.input-search:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-textarea { padding: 8px 12px; font-size: 13px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; resize: vertical; font-family: var(--font-mono); line-height: 1.5; transition: border-color 0.2s, box-shadow 0.2s; }
.form-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-select { padding: 8px 12px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; width: 100%; transition: border-color 0.2s, box-shadow 0.2s; }
.form-select:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
.form-divider { font-size: 14px; font-weight: 600; color: var(--text-primary); padding: 18px 0 10px 0; border-bottom: 1px solid var(--border-color); margin: 16px 0 14px 0; grid-column: 1 / -1; }
.switch-grid { display: flex; flex-wrap: wrap; gap: 16px 24px; padding: 8px 0 12px 0; }
.switch-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.switch-item input { accent-color: var(--brand); width: 16px; height: 16px; cursor: pointer; }
</style>
