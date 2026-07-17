<template>
  <div class="settings-subpage">
    <header class="subpage-header">
      <button class="btn-back" @click="$router.back()" aria-label="返回设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <h2>替换规则</h2>
    </header>

    <div class="subpage-body">
      <div class="setting-item">
        <div class="setting-label">
          <span class="label-text">替换规则</span>
          <span class="label-desc">对正文内容进行正则或纯文本替换，净化阅读体验</span>
        </div>
        <button class="btn-sm-primary" @click="openAddDialog">添加规则</button>
      </div>

      <div v-if="replaceRuleStore.rules.length > 0" class="rule-list">
        <div v-for="rule in replaceRuleStore.rules" :key="rule.id" class="rule-item">
          <div class="rule-header">
            <span class="rule-name">{{ rule.name }}</span>
            <span class="rule-scope">{{ rule.scope === 'title' ? '标题' : '正文' }}</span>
            <span v-if="rule.isRegex" class="rule-type">正则</span>
          </div>
          <div class="rule-pattern">
            <span class="rule-label">匹配</span>
            <code>{{ rule.pattern }}</code>
          </div>
          <div class="rule-replacement">
            <span class="rule-label">替换</span>
            <code>{{ rule.replacement || '(空)' }}</code>
          </div>
          <div class="rule-actions">
            <label class="toggle-switch">
              <input type="checkbox" :checked="rule.isEnabled" @change="replaceRuleStore.toggleRule(rule.id)" />
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-action" @click="editRule(rule)">编辑</button>
            <button class="btn-action btn-danger" @click="deleteRule(rule)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>暂无替换规则，添加规则开始净化阅读</p>
      </div>
    </div>

    <n-modal v-model:show="showDialog" preset="dialog" :title="editingRule ? '编辑规则' : '添加规则'" positive-text="保存" negative-text="取消" @positive-click="saveRule" @negative-click="showDialog = false">
      <div class="dialog-form">
        <div class="form-group">
          <label>规则名称</label>
          <n-input v-model:value="form.name" placeholder="如：去除广告" />
        </div>
        <div class="form-group">
          <label>作用范围</label>
          <select v-model="form.scope" class="form-select">
            <option value="content">正文</option>
            <option value="title">标题</option>
          </select>
        </div>
        <div class="form-group">
          <label>匹配模式</label>
          <n-input v-model:value="form.pattern" placeholder="正则或纯文本" />
        </div>
        <div class="form-group">
          <label>替换为</label>
          <n-input v-model:value="form.replacement" placeholder="留空表示删除" />
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.isRegex" />
            <span>正则表达式</span>
          </label>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import { useReplaceRuleStore } from '@/store/replace-rules'
import type { ReplaceRule } from '@shared/types'

const message = useMessage()
const replaceRuleStore = useReplaceRuleStore()

const showDialog = ref(false)
const editingRule = ref<ReplaceRule | null>(null)
const form = ref({
  name: '',
  scope: 'content' as 'title' | 'content',
  pattern: '',
  replacement: '',
  isRegex: false,
})

function openAddDialog() {
  editingRule.value = null
  form.value = { name: '', scope: 'content', pattern: '', replacement: '', isRegex: false }
  showDialog.value = true
}

function editRule(rule: ReplaceRule) {
  editingRule.value = rule
  form.value = { name: rule.name, scope: rule.scope, pattern: rule.pattern, replacement: rule.replacement, isRegex: rule.isRegex }
  showDialog.value = true
}

async function saveRule() {
  if (!form.value.name.trim() || !form.value.pattern.trim()) {
    message.warning('名称和匹配模式不能为空')
    return
  }
  if (editingRule.value) {
    await replaceRuleStore.updateRule(editingRule.value.id, { ...form.value })
    message.success('已更新')
  } else {
    const rule: ReplaceRule = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...form.value,
      isEnabled: true,
      bookName: '',
      bookOrigin: '',
      timeoutMs: 5000,
    }
    await replaceRuleStore.addRule(rule)
    message.success('已添加')
  }
  showDialog.value = false
}

async function deleteRule(rule: ReplaceRule) {
  await replaceRuleStore.removeRule(rule.id)
  message.success('已删除')
}

onMounted(() => { replaceRuleStore.loadRules() })
</script>

<style scoped>
.btn-sm-primary {
  padding: 8px 18px; font-size: 14px; font-weight: var(--font-medium);
  color: #0f0f0f; background: var(--brand); border: none;
  border-radius: var(--radius-md); cursor: pointer;
  transition: background 0.2s var(--ease-out), transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.btn-sm-primary:hover { background: var(--brand-hover); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(212,160,23,0.3); }
.btn-sm-primary:active { transform: translateY(0); }

.rule-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.rule-item {
  padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.rule-item:hover { border-color: rgba(212, 160, 23, 0.2); box-shadow: var(--shadow-sm); }
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-name { font-size: 14px; font-weight: var(--font-medium); color: var(--text-primary); flex: 1; }
.rule-scope { font-size: 11px; padding: 2px 10px; border-radius: var(--radius-full); background: var(--bg-hover); color: var(--text-muted); font-weight: var(--font-medium); }
.rule-type { font-size: 11px; padding: 2px 10px; border-radius: var(--radius-full); background: rgba(212,160,23,0.12); color: var(--brand); font-weight: var(--font-medium); }
.rule-pattern, .rule-replacement { display: flex; gap: 8px; font-size: 12px; margin: 3px 0; }
.rule-label { color: var(--text-muted); min-width: 36px; font-weight: var(--font-medium); }
.rule-pattern code, .rule-replacement code { color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); }
.rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }

.btn-action {
  padding: 4px 14px; font-size: 12px; color: var(--text-secondary);
  background: transparent; border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}
.btn-action:hover { color: var(--text-primary); border-color: var(--brand); background: var(--bg-hover); }
.btn-danger:hover { color: #e74c3c; border-color: #e74c3c; background: rgba(231,76,60,0.06); }

.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
</style>