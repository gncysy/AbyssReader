// ============================================
// useDict — 字典查询逻辑（错误结果不缓存）
// ============================================

import { ref, reactive } from 'vue'
import { store } from '@/services/store.js'
import { queryDict as queryDictService } from '@/services/dict.js'
import type { DictRule } from '@/types/dict.js'

const DICT_QUERY_TIMEOUT = 20

function isDictRuleArray(value: unknown): value is DictRule[] {
  return Array.isArray(value)
}

function isDictRule(value: unknown): value is DictRule {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.name === 'string' &&
    typeof obj.urlRule === 'string' &&
    typeof obj.showRule === 'string'
}

export function useDict() {
  const dictVisible = ref(false)
  const dictRules = ref<DictRule[]>([])
  const dictActiveTab = ref(0)
  const dictLoading = ref(false)
  // 修复：用 reactive 替代 ref<Record>，通过逐键赋值触发响应式
  const dictContents = reactive<Record<number, string>>({})
  const dictCachedTabs = ref<Set<number>>(new Set())
  const selectedText = ref('')

  async function loadDictRules(): Promise<void> {
    try {
      const raw = await store.get('dictRule')
      const rules = isDictRuleArray(raw) ? raw : []
      dictRules.value = rules.filter((r): r is DictRule => isDictRule(r) && r.enabled)
    } catch {
      dictRules.value = []
    }
  }

  async function queryDictRule(i: number): Promise<void> {
    const rule = dictRules.value[i]
    if (!rule) return

    dictLoading.value = true
    try {
      const result = await queryDictService(
        rule.urlRule || '',
        rule.showRule || '',
        selectedText.value || '',
        DICT_QUERY_TIMEOUT,
      )
      const isError = result.startsWith('<p>查询失败') || result.startsWith('<p>获取页面内容失败') || result.startsWith('<p>未匹配到内容')
      // 修复：逐键赋值，reactive 会正确触发
      dictContents[i] = result
      if (!isError) {
        const next = new Set(dictCachedTabs.value)
        next.add(i)
        dictCachedTabs.value = next
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      dictContents[i] = '<p>查询失败: ' + msg + '</p>'
      const next = new Set(dictCachedTabs.value)
      next.delete(i)
      dictCachedTabs.value = next
    } finally {
      dictLoading.value = false
    }
  }

  function openDictPanel(text: string): void {
    selectedText.value = text
    loadDictRules().then(() => {
      dictActiveTab.value = 0
      // 清空 reactive 对象的所有键
      for (const key of Object.keys(dictContents)) {
        delete dictContents[Number(key)]
      }
      dictCachedTabs.value = new Set()
      dictVisible.value = true
      if (dictRules.value.length > 0) queryDictRule(0)
    })
  }

  function switchDictTab(i: number): void {
    dictActiveTab.value = i
    if (dictCachedTabs.value.has(i)) return
    queryDictRule(i)
  }

  function closeDict(): void {
    dictVisible.value = false
  }

  return {
    dictVisible, dictRules, dictActiveTab, dictLoading, dictContents, selectedText,
    loadDictRules, queryDictRule, openDictPanel, switchDictTab, closeDict,
  }
}
