import { getGlobalStore } from '../../context/store.js';

// ===== Legado 兼容：书籍和章节变量 =====
const bookVariables = new Map<string, any>();
const chapterVariables = new Map<string, any>();
let reverseToc = false;

export const storage = {
  // ===== 基础变量 =====
  getVariable(key: string): any {
    const store = getGlobalStore();
    return store.get(key);
  },

  setVariable(key: string, value: any): void {
    const store = getGlobalStore();
    store.put(key, value);
  },

  // ===== 登录相关 =====
  getLoginInfoMap(): Record<string, any> {
    const store = getGlobalStore();
    const all = store.getAll();
    const result: Record<string, any> = {};
    for (const [key, value] of all) {
      if (key.startsWith('login_') || key === 'loginHeaders') {
        result[key] = value;
      }
    }
    return result;
  },

  putLoginHeader(headers: Record<string, string>): void {
    const store = getGlobalStore();
    store.put('loginHeaders', headers);
  },

  getLoginHeader(): Record<string, string> | null {
    const store = getGlobalStore();
    return store.get('loginHeaders') || null;
  },

  // ===== 清除存储 =====
  clear(): void {
    const store = getGlobalStore();
    store.clear();
    bookVariables.clear();
    chapterVariables.clear();
    reverseToc = false;
  },

  // ============================================================
  // Legado 兼容：书籍变量
  // ============================================================

  putBookVariable(key: string, value: any): void {
    bookVariables.set(key, value);
    const store = getGlobalStore();
    store.put(`book_var_${key}`, value);
  },

  getBookVariable(key: string): any {
    // 先查内存
    if (bookVariables.has(key)) {
      return bookVariables.get(key);
    }
    // 再查存储
    const store = getGlobalStore();
    return store.get(`book_var_${key}`);
  },

  getAllBookVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of bookVariables) {
      result[key] = value;
    }
    return result;
  },

  clearBookVariables(): void {
    bookVariables.clear();
  },

  // ============================================================
  // Legado 兼容：章节变量
  // ============================================================

  putChapterVariable(key: string, value: any): void {
    chapterVariables.set(key, value);
    const store = getGlobalStore();
    store.put(`chapter_var_${key}`, value);
  },

  getChapterVariable(key: string): any {
    if (chapterVariables.has(key)) {
      return chapterVariables.get(key);
    }
    const store = getGlobalStore();
    return store.get(`chapter_var_${key}`);
  },

  getAllChapterVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of chapterVariables) {
      result[key] = value;
    }
    return result;
  },

  clearChapterVariables(): void {
    chapterVariables.clear();
  },

  // ============================================================
  // Legado 兼容：目录反转
  // ============================================================

  setReverseToc(value: boolean): void {
    reverseToc = value;
    const store = getGlobalStore();
    store.put('reverseToc', value);
  },

  getReverseToc(): boolean {
    const store = getGlobalStore();
    const stored = store.get('reverseToc');
    return stored !== undefined ? stored : reverseToc;
  }
};
