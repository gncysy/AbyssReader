<template><div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>替换规则</h2></header>
    <div class="setting-item"><div><span class="label-text">替换规则</span><span class="label-desc">{{ replaceRuleStore.rules.length }} 条 · 正文净化与修正</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-secondary" @click="triggerImport">导入 JSON</button>
        <input ref="importInput" type="file" accept=".json" class="hidden" @change="onImportFile" />
        <button class="btn-secondary" @click="showImportUrlModal = true">从 URL</button>
        <button class="btn-secondary" @click="showPasteModal = true">粘贴 JSON</button>
        <button class="btn-primary" @click="openAddDialog">添加规则</button>
      </div>
    </div>
    <div v-if="replaceRuleStore.rules.length > 0" class="rule-list">
      <div v-for="rule in replaceRuleStore.rules" :key="rule.id" class="rule-card">
        <div class="rule-header"><span class="rule-name">{{ rule.name }}</span><span class="rule-badge">{{ rule.scopeTitle ? '标题' : '正文' }}</span><span v-if="rule.isRegex" class="rule-badge rule-badge-regex">正则</span></div>
        <div class="rule-row"><span class="rule-label">匹配</span><code>{{ rule.pattern }}</code></div>
        <div class="rule-row"><span class="rule-label">替换</span><code>{{ rule.replacement || '(空)' }}</code></div>
        <div class="rule-actions">
          <label class="toggle-switch"><input type="checkbox" :checked="rule.isEnabled" @change="replaceRuleStore.toggleRule(rule.id)" /><span class="toggle-slider"></span></label>
          <button class="btn-secondary" @click="editRule(rule)">编辑</button>
          <button class="btn-danger" @click="deleteRule(rule)">删除</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="暂无替换规则" description="导入 JSON 开始净化阅读" />
    <n-modal v-model:show="showDialog" preset="dialog" :title="editingRule ? '编辑规则' : '添加规则'" positive-text="保存" negative-text="取消" @positive-click="saveRule">
      <div class="dialog-form">
        <div class="form-group"><label>规则名称</label><n-input v-model:value="form.name" placeholder="如：去除广告" /></div>
        <div class="form-group"><label>作用范围</label><select v-model="scopeMode" class="form-select"><option :value="0">正文</option><option :value="1">标题</option></select></div>
        <div class="form-group"><label>匹配模式</label><n-input v-model:value="form.pattern" placeholder="正则或纯文本" /></div>
        <div class="form-group"><label>替换为</label><n-input v-model:value="form.replacement" placeholder="留空表示删除" /></div>
        <label class="checkbox-label"><input v-model="form.isRegex" type="checkbox" /><span>正则表达式</span></label>
      </div>
    </n-modal>
    <n-modal v-model:show="showPasteModal" preset="dialog" title="粘贴替换规则 JSON" positive-text="导入" negative-text="取消" @positive-click="importFromJson"><n-input v-model:value="pasteJson" type="textarea" placeholder="粘贴替换规则 JSON 数组..." :autosize="{ minRows: 12, maxRows: 20 }" /></n-modal>
    <n-modal v-model:show="showImportUrlModal" preset="dialog" title="从 URL 导入" positive-text="导入" negative-text="取消" @positive-click="importFromUrl"><n-input v-model:value="importUrl" placeholder="输入替换规则 JSON URL..." /></n-modal>
  </div></template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import { useReplaceRuleStore } from '@/stores/replace-rules.js'
import { network } from '@/services/network.js'
import BackButton from '@/components/common/BackButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { ReplaceRule } from '@/types'

const msg = useMessage()
const replaceRuleStore = useReplaceRuleStore()
const showDialog = ref(false)
const editingRule = ref<ReplaceRule | null>(null)
const form = ref<Partial<ReplaceRule>>({ name: '', pattern: '', replacement: '', isRegex: false, isEnabled: true, scopeContent: true, scopeTitle: false })
const scopeMode = computed({ get: () => form.value.scopeTitle ? 1 : 0, set: (v: number) => { form.value.scopeTitle = v === 1; form.value.scopeContent = v === 0 } })
const showPasteModal = ref(false)
const pasteJson = ref('')
const showImportUrlModal = ref(false)
const importUrl = ref('')
const importInput = ref<HTMLInputElement | null>(null)

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function openAddDialog(): void {
  editingRule.value = null
  form.value = { name: '', pattern: '', replacement: '', isRegex: false, isEnabled: true, scopeContent: true, scopeTitle: false }
  showDialog.value = true
}

function editRule(rule: ReplaceRule): void {
  editingRule.value = rule
  form.value = { name: rule.name, pattern: rule.pattern, replacement: rule.replacement, isRegex: rule.isRegex, isEnabled: rule.isEnabled, scopeTitle: rule.scopeTitle, scopeContent: rule.scopeContent }
  showDialog.value = true
}

async function saveRule(): Promise<void> {
  if (!form.value.name || !form.value.pattern) {
    msg.warning('名称和匹配模式不能为空')
    return
  }
  if (editingRule.value) {
    await replaceRuleStore.updateRule(editingRule.value.id, { ...form.value })
    msg.success('已更新')
  } else {
    await replaceRuleStore.addRule({
      id: generateId(),
      name: form.value.name || '未命名',
      pattern: form.value.pattern || '',
      replacement: form.value.replacement || '',
      isRegex: form.value.isRegex ?? true,
      isEnabled: form.value.isEnabled ?? true,
      scopeTitle: form.value.scopeTitle ?? false,
      scopeContent: form.value.scopeContent ?? true,
      timeoutMillisecond: 5000,
      order: replaceRuleStore.rules.length,
    })
    msg.success('已添加')
  }
  showDialog.value = false
}

async function deleteRule(rule: ReplaceRule): Promise<void> {
  await replaceRuleStore.removeRule(rule.id)
  msg.success('已删除')
}

function triggerImport(): void { importInput.value?.click() }

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await importRulesFromJson(text)
    msg.success('导入成功')
  } catch (err: unknown) {
    msg.error('导入失败: ' + (err as Error).message)
  } finally {
    input.value = ''
  }
}

async function importFromJson(): Promise<void> {
  if (!pasteJson.value.trim()) { msg.warning('请粘贴 JSON'); return }
  try {
    await importRulesFromJson(pasteJson.value)
    pasteJson.value = ''
    showPasteModal.value = false
    msg.success('导入成功')
  } catch (err: unknown) {
    msg.error('导入失败: ' + (err as Error).message)
  }
}

async function importFromUrl(): Promise<void> {
  if (!importUrl.value.trim()) { msg.warning('请输入 URL'); return }
  try {
    const res = await network.fetch(importUrl.value, { method: 'GET' })
    const data = typeof res === 'string' ? res : JSON.stringify(res)
    await importRulesFromJson(data)
    importUrl.value = ''
    showImportUrlModal.value = false
    msg.success('导入成功')
  } catch (err: unknown) {
    msg.error('导入失败: ' + (err as Error).message)
  }
}

async function importRulesFromJson(jsonStr: string): Promise<void> {
  let data: unknown
  if (typeof jsonStr === 'string') {
    if (jsonStr.trim() === '[object Object]') throw new Error('无效数据')
    data = JSON.parse(jsonStr)
  } else {
    data = jsonStr
  }

  const dataObj = data as Record<string, unknown>

  let rules: Record<string, unknown>[] = []
  if (Array.isArray(data)) rules = data as Record<string, unknown>[]
  else if (dataObj.replaceRules && Array.isArray(dataObj.replaceRules)) rules = dataObj.replaceRules as Record<string, unknown>[]
  else if (dataObj.rules && Array.isArray(dataObj.rules)) rules = dataObj.rules as Record<string, unknown>[]
  else throw new Error('无法识别的格式')

  let added = 0
  const existingRules = [...replaceRuleStore.rules]
  const newRules: ReplaceRule[] = []

  for (const item of rules as Record<string, unknown>[]) {
    const itemObj = item as Record<string, unknown>
    const pattern = (itemObj.pattern as string) || (itemObj.regex as string) || ''
    if (!pattern) continue
    // 去重
    const exists = existingRules.find((r) => r.name === (item.name || '未命名规则') && r.pattern === pattern)
    if (exists) continue

    newRules.push({
      id: (item.id as number) || generateId() + added,
      name: (item.name as string) || (item.replaceSummary as string) || (item.summary as string) || '未命名规则',
      group: (item.group as string | null) || null,
      pattern,
      replacement: (item.replacement as string) || '',
      scope: (item.scope as string | null) || (item.useTo as string | null) || null,
      scopeTitle: item.scopeTitle === true || item.scope === 'title',
      scopeContent: item.scopeContent !== false && item.scope !== 'title',
      excludeScope: (item.excludeScope as string | null) || null,
      isEnabled: item.isEnabled !== false,
      isRegex: item.isRegex !== false,
      timeoutMillisecond: (item.timeoutMillisecond as number) || 5000,
      order: (item.order as number) || (item.sortOrder as number) || added,
    })
    added++
  }

  if (added === 0) throw new Error('未找到有效规则')

  // 批量保存
  replaceRuleStore.rules = [...existingRules, ...newRules]
  await replaceRuleStore.saveRules()
}

onMounted(() => { replaceRuleStore.loadRules() })
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; display: block; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px; }
.rule-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.rule-card { padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: border-color 0.2s, box-shadow 0.2s; }
.rule-card:hover { border-color: rgba(212,160,23,0.2); box-shadow: var(--shadow-sm); }
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-name { font-size: 14px; font-weight: 500; color: var(--text-primary); flex: 1; }
.rule-badge { font-size: 11px; padding: 2px 10px; border-radius: 9999px; background: var(--bg-hover); color: var(--text-muted); font-weight: 500; }
.rule-badge-regex { background: var(--bg-active); color: var(--brand); }
.rule-row { display: flex; gap: 8px; font-size: 12px; margin: 3px 0; }
.rule-row code { color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); }
.rule-label { color: var(--text-muted); min-width: 36px; font-weight: 500; }
.rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.form-select { padding: 8px 14px; font-size: 14px; color: var(--text-primary); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); width: 100%; }
.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.hidden { display: none; }
</style>
