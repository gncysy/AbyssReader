<template><div class="settings-subpage">
    <header class="subpage-header"><BackButton /><h2>TXT 目录规则</h2></header>
    <div class="setting-item"><div><span class="label-text">目录识别规则</span><span class="label-desc">{{ rules.length }} 条规则 · 导入 TXT 时自动识别章节目录</span></div><button class="btn-primary" @click="addRule">添加规则</button></div>
    <div v-if="rules.length > 0" class="rule-list">
      <div v-for="rule in rules" :key="rule.id" class="rule-card">
        <div class="rule-header"><span class="rule-name">{{ rule.name }}</span><span class="rule-example">{{ rule.example }}</span></div>
        <div class="rule-row"><code>{{ rule.rule }}</code></div>
        <div class="rule-actions">
          <label class="toggle-switch"><input type="checkbox" :checked="rule.enable" @change="toggleRule(rule)" /><span class="toggle-slider"></span></label>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px" @click="editRule(rule)">编辑</button>
          <button class="btn-danger" style="padding:4px 10px;font-size:12px" @click="deleteRule(rule)">删除</button>
        </div>
      </div>
    </div>
    <EmptyState v-else title="暂无规则" description="添加规则来识别 TXT 中的章节目录" />
    <n-modal v-model:show="showDialog" preset="dialog" :title="editingRule ? '编辑规则' : '添加规则'" positive-text="保存" @positive-click="saveRule">
      <div class="dialog-form"><div class="form-group"><label>名称</label><n-input v-model:value="form.name" placeholder="如：目录" /></div><div class="form-group"><label>正则规则</label><n-input v-model:value="form.rule" placeholder="如：^第[\\d]+章" /></div><div class="form-group"><label>示例</label><n-input v-model:value="form.example" placeholder="如：第一章 标题" /></div></div>
    </n-modal>
  </div></template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import { store } from '@/services'
import { asArray } from '@/services/store.js'
import BackButton from '@/components/common/BackButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface TxtTocRuleLike {
  id: number
  name: string
  rule: string
  example: string
  enable: boolean
  serialNumber?: number
}

const msg = useMessage()
const rules = ref<TxtTocRuleLike[]>([])
const showDialog = ref(false)
const editingRule = ref<TxtTocRuleLike | null>(null)
const form = ref({ name: '', rule: '', example: '', enable: true })

onMounted(async () => { await loadRules() })
async function loadRules(): Promise<void> {
  try {
    const raw = await store.get('txtTocRule')
    rules.value = asArray<TxtTocRuleLike>(raw)
  } catch { rules.value = [] }
}
async function saveRules(): Promise<void> { await store.set('txtTocRule', rules.value) }
function addRule(): void { editingRule.value = null; form.value = { name: '', rule: '', example: '', enable: true }; showDialog.value = true }
function editRule(rule: TxtTocRuleLike): void { editingRule.value = rule; form.value = { name: rule.name, rule: rule.rule, example: rule.example, enable: rule.enable }; showDialog.value = true }
async function saveRule(): Promise<void> {
  if (!form.value.name.trim() || !form.value.rule.trim()) { msg.warning('名称和规则不能为空'); return }
  const list = [...rules.value]
  if (editingRule.value) {
    const idx = list.findIndex((r) => r.id === editingRule.value!.id)
    if (idx !== -1) list[idx] = { ...editingRule.value!, ...form.value }
  } else list.push({ id: Date.now(), ...form.value, serialNumber: list.length })
  rules.value = list
  await saveRules()
  showDialog.value = false
  msg.success('已保存')
}
async function deleteRule(rule: TxtTocRuleLike): Promise<void> { rules.value = rules.value.filter((r) => r.id !== rule.id); await saveRules(); msg.success('已删除') }
async function toggleRule(rule: TxtTocRuleLike): Promise<void> { rule.enable = !rule.enable; await saveRules() }
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
.rule-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.rule-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.rule-example { font-size: 12px; color: var(--text-muted); }
.rule-row { margin: 4px 0; }
.rule-row code { font-size: 12px; color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); }
.rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
</style>
