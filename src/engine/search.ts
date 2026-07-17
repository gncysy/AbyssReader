import { getString, getElements } from './rule-parser/index.js';
import { createHttpClientForSource } from './network/index.js';
import {
  parseRequestConfig,
  buildUrl,
  buildHeaders,
  resolveUrl,
  cleanIntro,
} from './utils/url.js';
import { isJsSource, executeJsSearch } from './utils/index.js';
import type { Book, BookSource } from '../shared/types.js';

export interface SearchOptions {
  page?: number
  timeout?: number
}

const rateLimitMap = new Map<string, { lastRequest: number }>();

function getRateLimiter(key: string) {
  if (!rateLimitMap.has(key)) { rateLimitMap.set(key, { lastRequest: 0 }) }
  return rateLimitMap.get(key)!;
}

async function rateLimitedRequest(httpClient: any, url: string, reqOptions: any, source: BookSource) {
  const rate = source.concurrentRate || 0;
  const key = source.bookSourceName || source.name || source.url;
  const limiter = getRateLimiter(key);
  const now = Date.now();
  const waitTime = Math.max(0, rate - (now - limiter.lastRequest));
  if (waitTime > 0) await new Promise(resolve => setTimeout(resolve, waitTime));
  limiter.lastRequest = Date.now();
  return await httpClient.request({ url, ...reqOptions });
}

function parseBookItem(
  item: any,
  source: BookSource,
  rule: any,
  baseContext: any = {}
): Book | null {
  try {
    const ctx = { ...baseContext, source, baseUrl: source.url }

    const name = getString(item, rule.name || '', ctx)
    if (!name) return null

    const author = getString(item, rule.author || '', ctx) || '未知作者'
    const coverUrl = getString(item, rule.coverUrl || rule.cover || '', ctx)
    const intro = getString(item, rule.intro || '', ctx)
    let bookUrl = getString(item, rule.bookUrl || '', ctx)
    const lastChapter = getString(item, rule.lastChapter || '', ctx)
    const kind = getString(item, rule.kind || '', ctx)

    if (!bookUrl || bookUrl === 'null' || bookUrl === 'undefined') {
      bookUrl = item.id || item.bookUrl || `book_${Date.now()}_${String(name).slice(0, 10)}`
    }

    const resolvedBookUrl = resolveUrl(String(bookUrl).trim(), source.url)

    return {
      id: resolvedBookUrl || `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name).trim(),
      author: String(author).trim(),
      coverUrl: coverUrl ? resolveUrl(String(coverUrl), source.url) : null,
      intro: intro ? cleanIntro(String(intro)) : null,
      kind: kind ? String(kind).trim() : null,
      lastChapter: lastChapter ? String(lastChapter).trim() : null,
      bookUrl: resolvedBookUrl,
      tocUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.warn('[Search] parseBookItem 失败:', error)
    return null
  }
}

export async function search(
  source: BookSource,
  keyword: string,
  options: SearchOptions = {}
): Promise<Book[]> {
  const page = options.page || 1;
  const sourceKey = source.bookSourceName || source.name || source.url;

  if (isJsSource(source)) {
    try {
      const result = await executeJsSearch(source, keyword, page);
      if (result && Array.isArray(result)) {
        return result.map((item: any) => ({
          id: item.id || item.bookUrl || `js_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: item.name || '未命名', author: item.author || '未知作者',
          coverUrl: item.coverUrl || null, intro: item.intro || null,
          kind: item.kind || null, lastChapter: item.lastChapter || null,
          bookUrl: item.bookUrl || item.url || '', tocUrl: item.tocUrl || null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }));
      }
      return [];
    } catch (error: any) {
      console.error('[Search] JS书源搜索失败:', error.message);
      return [];
    }
  }

  const httpClient = createHttpClientForSource(sourceKey);

  let searchUrl = source.searchUrl || '';
  if (!searchUrl) return [];

  searchUrl = searchUrl
    .replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
    .replace(/\{\{page\}\}/g, String(page));

  const config = parseRequestConfig(searchUrl);
  const finalUrl = buildUrl(config.url, source.url, { key: keyword, page: String(page) });
  const headers = buildHeaders(source, config.headers);

  try {
    const response = await rateLimitedRequest(httpClient, finalUrl, {
      method: config.method,
      headers,
      body: config.body,
      charset: config.charset || 'utf-8',
      timeout: options.timeout || 30000,
    }, source);

    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);

    const rule = source.ruleSearch;
    if (!rule || !rule.bookList) return [];

    const rawData = response.data;
    const ctx = { source, baseUrl: source.url, key: keyword, page }

    // 用 getElements 提取书籍列表
    const bookList = getElements(rawData, rule.bookList, ctx)
    if (!bookList || !Array.isArray(bookList) || bookList.length === 0) return []

    const books: Book[] = [];
    for (const item of bookList) {
      const book = parseBookItem(item, source, rule, ctx);
      if (book) books.push(book);
    }
    return books;
  } catch (error: any) {
    throw new Error(`搜索失败 (${sourceKey}): ${error.message || '未知错误'}`);
  }
}

export async function batchSearch(
  sources: BookSource[],
  keyword: string,
  options: SearchOptions = {}
): Promise<Map<string, Book[]>> {
  const results = new Map<string, Book[]>();
  const concurrency = 5;
  const queue = [...sources];

  const worker = async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;
      const key = source.bookSourceName || source.name || source.url;
      try { results.set(key, await search(source, keyword, options)) }
      catch (error) { console.error(`[Search] ${key} 搜索失败:`, error); results.set(key, []) }
    }
  };

  const promises: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) promises.push(worker());
  await Promise.all(promises);
  return results;
}
