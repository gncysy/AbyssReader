<template><div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>字典规则</h2></header>
    <div class="setting-item"><div><span class="label-text">字典查询规则</span><span class="label-desc">{{ rules.length }} 条规则 · 阅读器选词查询</span></div><button class="btn-primary" @click="addRule">添加规则</button></div>
    <div v-if="rules.length > 0" class="rule-list">
      <div v-for="rule in rules" :key="rule.name" class="rule-card">
        <div class="rule-header"><span class="rule-name">{{ rule.name }}</span><span class="rule-url">{{ rule.urlRule }}</span></div>
        <div class="rule-actions">
          <label class="toggle-switch"><input type="checkbox" :checked="rule.enabled" @change="toggleRule(rule)" /><span class="toggle-slider"></span></label>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="editRule(rule)">编辑</button>
          <button class="btn-danger" style="padding:4px 10px;font-size:12px" @click="deleteRule(rule)">删除</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="暂无字典规则" />
    <n-modal v-model:show="showDialog" preset="dialog" :title="editingRule ? '编辑规则' : '添加规则'" positive-text="保存" @positive-click="saveRule">
      <div class="dialog-form"><div class="form-group"><label>名称</label><n-input v-model:value="form.name" placeholder="如：百度汉语" /></div><div class="form-group"><label>请求 URL</label><n-input v-model:value="form.urlRule" placeholder="如：https://dict.baidu.com/s?wd={{key}}" /></div><div class="form-group"><label>解析规则</label><n-input v-model:value="form.showRule" type="textarea" placeholder="如：tag.body@all" /></div></div>
    </n-modal>
  </div></template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import BackButton from '@/components/common/BackButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface DictRuleLike {
  name: string
  urlRule: string
  showRule: string
  enabled: boolean
  sortNumber?: number
}

const msg = useMessage()
const rules = ref<DictRuleLike[]>([])
const showDialog = ref(false)
const editingRule = ref<DictRuleLike | null>(null)
const form = ref({ name: '', urlRule: '', showRule: '', enabled: true })

onMounted(async () => { await loadRules() })
async function loadRules(): Promise<void> {
  try {
    const raw = await store.get('dictRule')
    rules.value = asArray<DictRuleLike>(raw)
  } catch { rules.value = [] }
}
async function saveRules(): Promise<void> { await store.set('dictRule', rules.value) }
function addRule(): void { editingRule.value = null; form.value = { name: '', urlRule: '', showRule: '', enabled: true }; showDialog.value = true }
function editRule(rule: DictRuleLike): void { editingRule.value = rule; form.value = { name: rule.name, urlRule: rule.urlRule, showRule: rule.showRule, enabled: rule.enabled }; showDialog.value = true }
async function saveRule(): Promise<void> {
  if (!form.value.name.trim() || !form.value.urlRule.trim()) { msg.warning('名称和 URL 不能为空'); return }
  const list = [...rules.value]
  if (editingRule.value) {
    const idx = list.findIndex((r) => r.name === editingRule.value!.name)
    if (idx !== -1) list[idx] = { ...editingRule.value!, ...form.value }
  } else list.push({ ...form.value, sortNumber: list.length })
  rules.value = list
  await saveRules()
  showDialog.value = false
  msg.success('已保存')
}
async function deleteRule(rule: DictRuleLike): Promise<void> { rules.value = rules.value.filter((r) => r.name !== rule.name); await saveRules(); msg.success('已删除') }
async function toggleRule(rule: DictRuleLike): Promise<void> { rule.enabled = !rule.enabled; await saveRules() }
</script>

<style scoped>
.settings-subpage { padding: 28px 36px; max-width: 720px; }
.subpage-header { display: flex; align-items: center; gap: 16px; margin-bottom: 36px; }
.subpage-header h2 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
.setting-item { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border-color); }
.label-text { font-size: 15px; color: var(--text-primary); font-weight: 500; }
.label-desc { font-size: 13px; color: var(--text-muted); display: block; margin-top: 4px; }
.rule-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.rule-card { padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.rule-header { margin-bottom: 6px; }
.rule-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.rule-url { font-size: 11px; color: var(--text-muted); display: block; margin-top: 3px; word-break: break-all; font-family: var(--font-mono); }
.rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
</style>
