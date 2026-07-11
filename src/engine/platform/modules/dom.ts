import * as cheerio from "cheerio";

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
    const elements = $(selector);
    if (elements.length === 0) return [];

    // 支持属性提取：如 "a@href"
    const parts = selector.split("@");
    const attr = parts.length > 1 ? parts[1] : null;
    const sel = parts[0];

    const result: string[] = [];
    $(sel).each((_, el) => {
      if (attr) {
        const val = $(el).attr(attr);
        if (val) result.push(val);
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

  setContent(html: string): void {
    // 存入内部变量供后续解析使用
    (global as any).__lastDomContent = html;
  },
};
