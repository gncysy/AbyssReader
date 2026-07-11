import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { toSimplified } from "chinese-simple2traditional";

dayjs.extend(utc);

function chineseNumberToInt(chinese: string): number {
  const numMap: Record<string, number> = {
    "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
    "十": 10, "百": 100, "千": 1000, "万": 10000, "亿": 100000000
  };
  let result = 0;
  let temp = 0;
  for (const char of chinese) {
    const num = numMap[char];
    if (num === undefined) continue;
    if (num >= 10) {
      temp = temp === 0 ? num : temp * num;
    } else {
      temp = temp === 0 ? num : temp + num;
    }
  }
  return result + temp;
}

export const utils = {
  timeFormat(timestamp: number | string, format: string = "YYYY-MM-DD HH:mm:ss"): string {
    const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
    return dayjs(ts).format(format);
  },

  timeFormatUTC(timestamp: number | string, format: string = "YYYY-MM-DD HH:mm:ss", offset: number = 0): string {
    const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
    return dayjs(ts).utcOffset(offset).format(format);
  },

  toNumChapter(str: string): number {
    if (!str) return 0;
    const match = str.match(/[零一二三四五六七八九十百千万亿]+/);
    if (match) {
      return chineseNumberToInt(match[0]);
    }
    const numMatch = str.match(/\d+/);
    if (numMatch) {
      return parseInt(numMatch[0], 10);
    }
    return 0;
  },

  t2s(str: string): string {
    if (!str || typeof str !== "string") return str;
    try {
      return toSimplified(str);
    } catch {
      return str;
    }
  },

  encodeURI(str: string): string {
    return encodeURIComponent(str);
  },

  decodeURI(str: string): string {
    return decodeURIComponent(str);
  },

  escape(str: string): string {
    return encodeURIComponent(str);
  },

  unescape(str: string): string {
    return decodeURIComponent(str);
  },

  log(...args: any[]): void {
    console.log("[书源JS]", ...args);
  },

  // 使用动态 import 延迟加载，避免 Vite 静态分析警告
  async importScript(path: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, "utf-8");
      return content;
    } catch {
      return "";
    }
  },

  random(): number {
    return Math.random();
  },
};
