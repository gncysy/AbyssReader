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
import fs from 'fs';

export async function getToc(source: BookSource, tocUrl: string): Promise<Chapter[]> {
  // ===== JS书源支持 =====
  if (isJsSource(source)) {
    try {
      const result = await executeJsToc(source, tocUrl);
      if (result && Array.isArray(result)) {
        return result.map((item: any, index: number) => ({
          id: item.id ?? index,
          title: item.title || '无标题',
          url: item.url || '',
          index: item.index ?? index,
          isVip: !!item.isVip,
          isPay: !!item.isPay,
          content: item.content || null,
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

  // ===== 多页目录支持 =====
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

      if (response.status < 200 || response.status >= 300) {
        break;
      }

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

      if (listResult && Array.isArray(listResult)) {
        allChapters = allChapters.concat(listResult);
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
      break;
    }
  }

  if (allChapters.length === 0) {
    return [];
  }

  // ===== 处理章节列表 =====
  const chapters: Chapter[] = [];
  let isVolumeActive = false;
  let currentVolume = '';

  for (let i = 0; i < allChapters.length; i++) {
    const item = allChapters[i];

    const volumeTitle = parseAndExecute(item, rule.isVolume || '', { source, baseUrl: source.url });
    if (volumeTitle && typeof volumeTitle === 'string' && volumeTitle.trim()) {
      isVolumeActive = true;
      currentVolume = volumeTitle.trim();
      continue;
    }

    const title = parseAndExecute(item, rule.chapterName || '', { source, baseUrl: source.url }) || '无标题';
    const url = parseAndExecute(item, rule.chapterUrl || '', { source, baseUrl: source.url });
    const isVip = parseAndExecute(item, rule.isVip || '', { source, baseUrl: source.url });
    const isPay = parseAndExecute(item, rule.isPay || '', { source, baseUrl: source.url });
    const updateTime = parseAndExecute(item, rule.updateTime || '', { source, baseUrl: source.url });

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
      updateTime: updateTime || undefined,
    });
  }

  // 记录调试信息到文件
  try {
    fs.writeFileSync('D:\\toc-debug.json', JSON.stringify({
      sourceName: source.name,
      tocUrl: tocUrl,
      chapterCount: chapters.length,
      firstChapter: chapters[0] || null,
      allChaptersSample: chapters.slice(0, 3).map(c => ({ title: c.title, url: c.url })),
    }, null, 2));
  } catch (e) {}

  // 清洗数据，移除所有不可克隆的属性
  const cleanChapters = chapters.map((ch: any) => ({
    id: typeof ch.id === 'number' ? ch.id : 0,
    title: String(ch.title || ''),
    url: String(ch.url || ''),
    index: typeof ch.index === 'number' ? ch.index : 0,
    isVip: !!ch.isVip,
    isPay: !!ch.isPay,
    content: ch.content ? String(ch.content) : null,
    updateTime: String(ch.updateTime || ''),
  }));
  
  console.log('[Toc] 返回章节数:', cleanChapters.length);
  return cleanChapters;
}
