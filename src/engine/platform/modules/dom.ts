import * as cheerio from "cheerio";

// 内容缓存（用于 Legado 兼容）
let contentCache: string = '';
let contentBaseUrl: string = '';

export const dom = {
  getElements(selector: string, html: string): any[] {
    if (!html || !selector) return [];
    const $ = cheerio.load(html);
    const elements = $(selector);
    if (elements.length === 0) return [];
    return elements.toArray();
  },

  getString(selector: string, html: string): string {
    if (!html || !selector) return "";
    const $ = cheerio.load(html);
    const el = $(selector);
    return el.length > 0 ? el.text().trim() : "";
  },

  getStringList(selector: string, html: string): string[] {
    if (!html || !selector) return [];
    const $ = cheerio.load(html);

    // 支持属性提取：如 "a@href"
    const parts = selector.split("@");
    const attr = parts.length > 1 ? parts[1] : null;
    const sel = parts[0];

    const result: string[] = [];
    $(sel).each((_, el) => {
      if (attr) {
        const val = $(el).attr(attr);
        if (val !== undefined && val !== null) result.push(String(val));
      } else {
        const text = $(el).text().trim();
        if (text) result.push(text);
      }
    });
    return result;
  },

  getElement(selector: string, html: string): any | null {
    if (!html || !selector) return null;
    const $ = cheerio.load(html);
    const el = $(selector).first();
    return el.length > 0 ? el : null;
  },

  // ===== Legado 兼容：setContent =====
  setContent(html: string, baseUrl?: string): void {
    contentCache = html || '';
    contentBaseUrl = baseUrl || '';
  },

  // ===== 获取缓存的内容 =====
  getContent(): string {
    return contentCache;
  },

  // ===== 获取缓存的 baseUrl =====
  getContentBaseUrl(): string {
    return contentBaseUrl;
  },

  // ===== 清除缓存 =====
  clearContentCache(): void {
    contentCache = '';
    contentBaseUrl = '';
  }
};
