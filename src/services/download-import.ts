// ============================================
// 下载导入编排服务
// ============================================

import type { DownloadInfo } from '@engine/business/source/download.js'
import { network } from './network.js'
import { store } from './store.js'
import { source } from './source.js'
import { logError } from '@engine/log/index.js'

interface RssSourceLike {
  sourceUrl: string
  [key: string]: unknown
}

interface ReplaceRuleLike {
  name: string
  pattern: string
  [key: string]: unknown
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export async function executeDownloadImport(info: DownloadInfo): Promise<string> {
  switch (info.resourceType) {
    case 'bookSource': {
      const count = await installBookSources(info.url)
      return `已安装 ${count} 个书源`
    }
    case 'rssSource': {
      const rawSources = await store.get('rssSources')
      const existingSources = asArray(rawSources) as RssSourceLike[]
      // 修复：installRssSources 返回合并后的新数组，不再原地修改入参
      const { merged, count } = await installRssSources(info.url, existingSources)
      await store.set('rssSources', merged)
      return `已安装 ${count} 个订阅源`
    }
    case 'replaceRule': {
      const count = await installReplaceRules(info.url)
      return `已导入 ${count} 条替换规则`
    }
    case 'txtTocRule': {
      const count = await installTxtTocRules(info.url)
      return `已导入 ${count} 条目录规则`
    }
    case 'purifyRule': {
      await installPurifyRule(info.url)
      return '已导入净化规则'
    }
    default:
      return '文件已保存到下载目录'
  }
}

async function fetchText(url: string): Promise<string> {
  const content = await network.fetch(url, { method: 'GET' })
  return typeof content === 'string' ? content : JSON.stringify(content)
}

async function installBookSources(url: string): Promise<number> {
  const text = await fetchText(url)
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error('书源 JSON 解析失败: ' + msg)
  }
  const items = Array.isArray(data) ? data : [data]
  for (const item of items) {
    await source.add(JSON.stringify(item))
  }
  return items.length
}

/**
 * 修复：返回新的合并数组，不再原地修改传入的 existingSources。
 */
async function installRssSources(
  url: string,
  existingSources: RssSourceLike[],
): Promise<{ merged: RssSourceLike[]; count: number }> {
  const text = await fetchText(url)
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error('订阅源 JSON 解析失败: ' + msg)
  }
  const items = Array.isArray(data) ? data : [data]
  const merged = [...existingSources]
  const existing = new Set(existingSources.map((s) => s.sourceUrl))
  let count = 0
  for (const item of items) {
    const obj = item as RssSourceLike
    if (obj.sourceUrl && !existing.has(obj.sourceUrl)) {
      merged.push(obj)
      existing.add(obj.sourceUrl)
      count++
    }
  }
  return { merged, count }
}

async function installReplaceRules(url: string): Promise<number> {
  const text = await fetchText(url)
  let rules: unknown
  try {
    rules = JSON.parse(text)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error('替换规则 JSON 解析失败: ' + msg)
  }
  const rawExisting = await store.get('replaceRule')
  const existing = asArray(rawExisting) as ReplaceRuleLike[]
  const incoming = Array.isArray(rules) ? rules : [rules]
  // 修复：用副本，不修改原数组
  const merged = [...existing]
  let count = 0
  for (const rule of incoming) {
    const r = rule as ReplaceRuleLike
    if (!merged.find((er) => er.name === r.name && er.pattern === r.pattern)) {
      merged.push(r)
      count++
    }
  }
  if (count > 0) await store.set('replaceRule', merged)
  return count
}

async function installTxtTocRules(url: string): Promise<number> {
  const text = await fetchText(url)
  let rules: unknown
  try {
    rules = JSON.parse(text)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error('目录规则 JSON 解析失败: ' + msg)
  }
  const items = Array.isArray(rules) ? rules : [rules]
  await store.set('txtTocRule', items)
  return items.length
}

async function installPurifyRule(url: string): Promise<void> {
  const text = await fetchText(url)
  try {
    JSON.parse(text)
  } catch {
    logError('storage', 'frontend', '[导入] 净化规则不是 JSON，作为纯文本保存')
  }
  await store.set('purifyRule', text)
}
