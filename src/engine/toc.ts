import { parseAndExecute } from './rule-parser/index.js';
import { getGlobalHttpClient } from './network/index.js';
import {
  parseRequestConfig,
  buildUrl,
  buildHeaders,
  resolveUrl,
  isJsonResponse,
  safeParseJson,
} from './utils/url.js';
import { isJsSource, executeJsToc } from './utils/js-source.js';
import type { BookSource, Chapter } from '../shared/types.js';

/**
 * 深度清洗任意值，确保可 JSON 序列化（无函数、Symbol、DOM 节点）
 */
function deepSanitize(value: any): any {
  // 处理基本类型
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'function') return null;        // 函数不可克隆
  if (typeof value === 'symbol') return null;          // Symbol 不可克隆

  // 数组处理
  if (Array.isArray(value)) {
    return value.map(item => deepSanitize(item));
  }

  // 对象处理
  if (typeof value === 'object') {
    // 检测 cheerio 元素（常见于 parseAndExecute 返回的 DOM 元素）
    if (value.constructor?.name === 'Element' || value.tagName || value.attribs) {
      return null;
    }
    try {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = deepSanitize(val);
      }
      return result;
    } catch {
      return null;
    }
  }

  // 其他类型（如 BigInt）转为字符串
  return String(value);
}

export async function getToc(source: BookSource, tocUrl: string): Promise<Chapter[]> {
  // 最外层捕获所有异常，确保永远不会抛出克隆错误
  try {
    // ===== JS书源支持 =====
    if (isJsSource(source)) {
      try {
        const result = await executeJsToc(source, tocUrl);
        if (result && Array.isArray(result)) {
          return result.map((item: any, index: number) => ({
            id: typeof item.id === 'number' ? item.id : index,
            title: String(item.title || '无标题'),
            url: String(item.url || ''),
            index: typeof item.index === 'number' ? item.index : index,
            isVip: !!item.isVip,
            isPay: !!item.isPay,
            content: item.content ? String(item.content) : null,
            updateTime: item.updateTime ? String(item.updateTime) : undefined,
          }));
        }
        return [];
      } catch (error: any) {
        console.error('[Toc] JS书源获取目录失败:', error.message);
        return [];
      }
    }

    // ===== 规则书源 =====
    const httpClient = getGlobalHttpClient();
    const rule = source.ruleToc;
    if (!rule || !rule.chapterList) {
      return [];
    }

    let allChapters: any[] = [];
    let currentTocUrl: string | null = tocUrl;
    const maxPages = 20;
    let pageCount = 0;

    while (currentTocUrl && pageCount < maxPages) {
      pageCount++;
      try {
        const config = parseRequestConfig(currentTocUrl);
        const url = buildUrl(config.url, source.url, {});
        const headers = buildHeaders(source, config.headers);

        const response = await httpClient.request({
          url,
          method: config.method,
          headers,
          body: config.body,
          charset: config.charset || 'utf-8',
          timeout: 30000,
        });
      console.log('[Toc] 响应状态:', response.status);
      console.log('[Toc] 响应头:', JSON.stringify(response.headers));
      const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      console.log('[Toc] 响应数据前500字符:', dataStr.substring(0, 500));

        if (response.status < 200 || response.status >= 300) break;

        let html = response.data;
        let listResult: any = null;

        if (isJsonResponse(response.headers)) {
          const json = safeParseJson(html);
          if (json) {
            const list = json.data || json.list || json.chapters || json.items || json;
            if (Array.isArray(list)) {
              listResult = list;
            } else {
              const context = { source, baseUrl: source.url, json };
              listResult = parseAndExecute(json, rule.chapterList, context);
            }
          }
        }

        if (listResult === null) {
          const context = { source, baseUrl: source.url };
          listResult = parseAndExecute(html, rule.chapterList, context);
        }

        // 深度清洗 parseAndExecute 返回的结果
        if (listResult && Array.isArray(listResult)) {
          const cleaned = listResult.map((item: any) => deepSanitize(item));
          allChapters = allChapters.concat(cleaned);
        }

        let nextUrl: string | null = null;
        if (rule.nextTocUrl) {
          const context = { source, baseUrl: source.url };
          const nextResult = parseAndExecute(html, rule.nextTocUrl, context);
          if (nextResult && typeof nextResult === 'string') {
            nextUrl = resolveUrl(nextResult, source.url);
          }
        }
        currentTocUrl = nextUrl;
      } catch (err) {
        // 单页出错，继续下一页
        break;
      }
    }

    if (allChapters.length === 0) return [];

    // 构建章节对象
    const chapters: Chapter[] = [];
    let isVolumeActive = false;
    let currentVolume = '';

    for (let i = 0; i < allChapters.length; i++) {
      const item = allChapters[i];
      const cleanItem = deepSanitize(item) || {};

      try {
        const volumeTitle = parseAndExecute(cleanItem, rule.isVolume || '', { source, baseUrl: source.url });
        if (volumeTitle && typeof volumeTitle === 'string' && volumeTitle.trim()) {
          isVolumeActive = true;
          currentVolume = volumeTitle.trim();
          continue;
        }

        const title = parseAndExecute(cleanItem, rule.chapterName || '', { source, baseUrl: source.url }) || '无标题';
        const url = parseAndExecute(cleanItem, rule.chapterUrl || '', { source, baseUrl: source.url });
        const isVip = parseAndExecute(cleanItem, rule.isVip || '', { source, baseUrl: source.url });
        const isPay = parseAndExecute(cleanItem, rule.isPay || '', { source, baseUrl: source.url });
        const updateTime = parseAndExecute(cleanItem, rule.updateTime || '', { source, baseUrl: source.url });

        if (!url) continue;

        let chapterTitle = String(title).trim();
        if (isVolumeActive && currentVolume) {
          chapterTitle = `${currentVolume} ${chapterTitle}`;
        }

        chapters.push({
          id: i,
          title: chapterTitle,
          url: resolveUrl(String(url), source.url),
          index: i,
          isVip: isVip === 'true' || isVip === true,
          isPay: isPay === 'true' || isPay === true,
          content: null,
          updateTime: updateTime ? String(updateTime) : undefined,
        });
      } catch (e) {
        // 单条出错，跳过
        continue;
      }
    }

    // 最终强制清洗，构建绝对安全的数组
    const result = chapters.map((ch: any) => ({
      id: typeof ch.id === 'number' ? ch.id : 0,
      title: String(ch.title || ''),
      url: String(ch.url || ''),
      index: typeof ch.index === 'number' ? ch.index : 0,
      isVip: !!ch.isVip,
      isPay: !!ch.isPay,
      content: ch.content ? String(ch.content) : null,
      updateTime: ch.updateTime ? String(ch.updateTime || '') : undefined,
    }));

    // 尝试序列化，如果失败则返回空数组
    try {
      JSON.stringify(result);
      console.log('[Toc] 成功返回', result.length, '个章节');
      return result;
    } catch (e) {
      console.error('[Toc] 序列化失败，返回空数组', e);
      return [];
    }
  } catch (error) {
    // 捕获所有异常，返回空数组，避免克隆错误传播
    console.error('[Toc] 未知错误，返回空数组:', error);
    return [];
  }
}

