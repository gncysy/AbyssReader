import { ipcMain, dialog, BrowserWindow } from "electron";
import Store from "electron-store";
import vm from "node:vm";
import fs from "fs/promises";
import crypto from "crypto";
import { getMainWindow } from "./window-manager.js";
import {
  search,
  getToc,
  getContent,
  getBookInfo,
} from "../engine/index.js";
import { getExploreCategories, getExploreBooks } from "../engine/explore.js";
import { getGlobalHttpClient } from "../engine/network/client.js";
import { normalizeSource, parseSourcesFromJson } from "../engine/source-helper.js";

const activeSearches = new Map<string, AbortController>();

function safeClone<T>(obj: T): T {
  try { return JSON.parse(JSON.stringify(obj)) }
  catch { return (Array.isArray(obj) ? [] : (obj && typeof obj === 'object' ? {} : obj)) as any }
}

function getEncryptionKey(): string {
  if (process.env.STORE_ENCRYPTION_KEY) return process.env.STORE_ENCRYPTION_KEY;
  try {
    const os = require("os");
    return crypto.createHash("sha256").update((os.hostname() || "unknown") + "abyss-reader-salt-2026").digest("hex");
  } catch { return "abyss-reader-fallback-key-2026" }
}

const store: any = new Store({
  name: "abyssreader-data", encryptionKey: getEncryptionKey(),
  defaults: { books: [], sources: [], readingProgress: {}, settings: { theme: "system", fontSize: 16, lineHeight: 1.6 } },
});

const httpClient = getGlobalHttpClient();
let verificationWindow: BrowserWindow | null = null;
const chapterCache = new Map<string, { chapters: any[]; timestamp: number }>();
const CACHE_TTL = 60000;

function createSecureSandbox(context: any = {}): vm.Context {
  const sandbox: any = { Math, JSON, Date, String, Number, Boolean, Array, Object, trim: (s: any) => String(s).trim(), encodeURI: encodeURIComponent, decodeURI: decodeURIComponent, parseInt, parseFloat, isNaN, isFinite, console: { log: (...args: any[]) => console.log("[Sandbox]", ...args), error: (...args: any[]) => console.error("[Sandbox]", ...args), warn: (...args: any[]) => console.warn("[Sandbox]", ...args), info: (...args: any[]) => console.info("[Sandbox]", ...args) }, context: JSON.parse(JSON.stringify(context || {})) };
  Object.freeze(sandbox.Math); Object.freeze(sandbox.JSON); Object.freeze(sandbox.Date); Object.freeze(sandbox.String); Object.freeze(sandbox.Number); Object.freeze(sandbox.Boolean); Object.freeze(sandbox.Array); Object.freeze(sandbox.Object); Object.freeze(sandbox);
  return vm.createContext(sandbox);
}

function getLocalBookChaptersSync(bookId: string): any[] {
  const books: any[] = store.get("books") || [];
  const book = books.find((b: any) => b.id === bookId || b.bookUrl === `local://${bookId}`);
  if (!book || !book.content) return [{ id: 0, title: "正文", content: "", index: 0 }];
  const content = book.content; const lines = content.split("\n");
  const chapters: any[] = []; let currentChapter = { id: 0, title: "正文", content: "", index: 0 }; let chapterIndex = 0;
  const patterns = [/^(第[零一二三四五六七八九十百千万]+章)/, /^(第\d+章)/, /^(第[零一二三四五六七八九十百千万]+节)/, /^(第\d+节)/, /^(第[零一二三四五六七八九十百千万]+回)/, /^(第\d+回)/, /^(卷[零一二三四五六七八九十百千万]+)/, /^(卷\d+)/, /^(序章|楔子|尾声|后记|番外|前言|引言|结语)/, /^(Chapter\s+\d+)/i];
  let isFirstLine = true, currentVolume = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (currentChapter.content) currentChapter.content += "\n"; continue }
    const isVolume = /^卷[零一二三四五六七八九十百千万]+$/.test(trimmed) || /^卷\d+$/.test(trimmed);
    if (isVolume) { currentVolume = trimmed; if (currentChapter.content.trim()) { chapters.push({ ...currentChapter }); chapterIndex++; currentChapter = { id: chapterIndex, title: trimmed, content: "", index: chapterIndex } } else currentChapter.title = trimmed; continue }
    let isChapter = false, matchedTitle = "";
    for (const p of patterns) { const m = trimmed.match(p); if (m) { isChapter = true; matchedTitle = m[1] || m[0]; break } }
    if (currentVolume && !isChapter && currentChapter.content) { currentChapter.content += (currentChapter.content ? "\n" : "") + line; continue }
    if (isChapter && currentChapter.content.length > 0) { if (currentChapter.content.trim()) chapters.push({ ...currentChapter }); chapterIndex++; currentChapter = { id: chapterIndex, title: currentVolume ? currentVolume + " " + matchedTitle : matchedTitle, content: "", index: chapterIndex } }
    else if (isChapter && isFirstLine) { currentChapter = { id: chapterIndex, title: currentVolume ? currentVolume + " " + matchedTitle : matchedTitle, content: "", index: chapterIndex } }
    else { currentChapter.content += (currentChapter.content ? "\n" : "") + line }
    isFirstLine = false;
  }
  if (currentChapter.content.trim()) chapters.push({ ...currentChapter });
  if (chapters.length === 0) chapters.push({ id: 0, title: "正文", content, index: 0 });
  return chapters;
}

function validateUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try { const p = new URL(url); return p.protocol === "http:" || p.protocol === "https:" } catch { return false }
}

function sanitizeSourceInput(source: any): any {
  if (!source || typeof source !== "object") return null;
  const clean = JSON.parse(JSON.stringify(source)); delete clean.__proto__; delete clean.constructor; delete clean.prototype;
  return clean;
}

async function runLoginCheck(source: any, responseBody: string): Promise<string> {
  if (!source.loginCheckJs || typeof source.loginCheckJs !== 'string' || !source.loginCheckJs.trim()) return responseBody;
  try {
    const { executeJs } = await import("../engine/rule-parser/js.js");
    const jsResult = executeJs(responseBody, source.loginCheckJs, { source, result: responseBody, src: responseBody });
    if (jsResult && typeof jsResult === 'string' && jsResult.length > 0) return jsResult;
  } catch (e) { console.warn("[loginCheck] 执行失败:", e) }
  return responseBody;
}

export function setupIpcHandlers() {
  try {
    const jar = (httpClient as any).getCookieJar?.();
    import('../engine/rule-parser/js.js').then(mod => { if (jar) mod.setCookieJar(jar); }).catch(() => {});
  } catch {}

  ipcMain.handle("store-get", (_e: any, key: string) => { const v = store.get(key); return v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined });
  ipcMain.handle("store-set", (_e: any, key: string, value: any) => { if (JSON.stringify(value).length > 50*1024*1024) throw new Error("数据过大"); store.set(key, value) });
  ipcMain.handle("store-delete", (_e: any, key: string) => { store.delete(key as any) });
  ipcMain.handle("store-get-all", () => JSON.parse(JSON.stringify(store.store)));

  ipcMain.handle("search-abort", (_e: any, searchId: string) => { const c = activeSearches.get(searchId); if (c) { c.abort(); activeSearches.delete(searchId); return {success:true} } return {success:false,error:"未找到"} });

  ipcMain.handle("fetch", async (_e: any, url: string, options: any = {}) => {
    if (!validateUrl(url)) throw new Error("无效的 URL");
    const { method = "GET", headers = {}, body, charset, responseType } = options;
    try {
      const response = await httpClient.request({ url, method, headers, body, timeout: 30000, responseType: responseType || 'text' });
      let data = response.data;
      if (responseType === 'arraybuffer' || options.binary === true) {
        if (Buffer.isBuffer(data)) data = data.toString('base64');
        else if (data instanceof ArrayBuffer) data = Buffer.from(data).toString('base64');
        return { status: response.status, data, _binary: true, _encoding: 'base64', headers: response.headers };
      }
      if (charset && charset.toLowerCase() !== "utf-8") {
        try { const iconv = await import("iconv-lite"); data = iconv.decode(Buffer.from(response.data, "binary"), charset) } catch {}
      }
      return { status: response.status, data, headers: response.headers };
    } catch (error: any) { if (error.response) return { status: error.response.status, data: error.response.data }; throw error }
  });

  ipcMain.handle("download-binary", async (_e: any, url: string, options: any = {}) => {
    if (!validateUrl(url)) throw new Error("无效的 URL");
    try {
      const response = await httpClient.request({ url, method: options.method || "GET", headers: options.headers || {}, body: options.body, timeout: 30000, responseType: 'arraybuffer' });
      let data = response.data;
      if (Buffer.isBuffer(data)) return { status: response.status, data: data.toString('base64'), _binary: true, _encoding: 'base64', headers: response.headers };
      if (data instanceof ArrayBuffer) return { status: response.status, data: Buffer.from(data).toString('base64'), _binary: true, _encoding: 'base64', headers: response.headers };
      return { status: response.status, data, headers: response.headers };
    } catch (error: any) { if (error.response) return { status: error.response.status, data: error.response.data }; throw error }
  });

  ipcMain.handle("read-file", async (_e: any, filePath: string) => { if (filePath.includes("..")||filePath.includes("~")) throw new Error("非法路径"); return await fs.readFile(filePath, "utf-8") });
  ipcMain.handle("show-open-dialog", async (_e: any, options: any) => { const win = BrowserWindow.getFocusedWindow() || getMainWindow(); return await dialog.showOpenDialog(win!, options) });
  ipcMain.handle("get-app-path", () => process.env.APP_PATH || process.cwd());

  ipcMain.handle("minimize-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.minimize() });
  ipcMain.handle("maximize-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.isMaximized() ? w.unmaximize() : w.maximize() });
  ipcMain.handle("close-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close() });

  ipcMain.handle("open-verification", async (_e: any, url: string, title: string = "人机验证") => {
    if (!validateUrl(url)) throw new Error("无效的 URL");
    if (verificationWindow) { verificationWindow.focus(); return }
    const parentWin = BrowserWindow.getFocusedWindow() || getMainWindow();
    verificationWindow = new BrowserWindow({ width: 850, height: 650, parent: parentWin || undefined, modal: true, webPreferences: { nodeIntegration: false, sandbox: true, webviewTag: true }, title, show: false });
    verificationWindow.loadURL(url);
    verificationWindow.once("ready-to-show", () => verificationWindow?.show());
    verificationWindow.on("closed", () => { verificationWindow = null; if (parentWin) parentWin.webContents.send("verification-cancel") });
  });
  ipcMain.handle("close-verification", async () => { if (verificationWindow) { verificationWindow.close(); verificationWindow = null } });

  ipcMain.handle("add-book-source", async (_e: any, jsonStr: string) => {
    if (typeof jsonStr !== "string") throw new Error("输入必须是 JSON 字符串");
    const sourceList = parseSourcesFromJson(jsonStr); if (sourceList.length === 0) throw new Error("未找到有效的书源数据");
    const existing: any[] = store.get("sources") || []; let added = 0;
    for (const s of sourceList) { const source = normalizeSource(sanitizeSourceInput(s)); if (source.name && source.url) { existing.push(source); added++ } }
    store.set("sources", existing); return "成功导入 " + added + " 个书源";
  });
  ipcMain.handle("import-sources-from-url", async (_e: any, url: string) => {
    if (!validateUrl(url)) throw new Error("无效的 URL");
    const response = await httpClient.request({ url, method: "GET", timeout: 30000 });
    if (response.status < 200 || response.status >= 300) throw new Error("HTTP " + response.status);
    const sourceList = parseSourcesFromJson(response.data); if (sourceList.length === 0) throw new Error("未找到有效的书源数据");
    const existing: any[] = store.get("sources") || []; let added = 0;
    for (const s of sourceList) { const source = normalizeSource(sanitizeSourceInput(s)); if (source.name && source.url) { existing.push(source); added++ } }
    store.set("sources", existing); return "从 URL 成功导入 " + added + " 个书源";
  });

  ipcMain.handle("delete-source", async (_e: any, index: number) => { const sources: any[] = store.get("sources") || []; if (index < 0 || index >= sources.length) return safeClone({success:false,error:"索引越界"}); sources.splice(index,1); store.set("sources", sources); return safeClone({success:true}) });
  ipcMain.handle("test-source", async (_e: any, index: number) => {
    const sources: any[] = store.get("sources") || []; if (index < 0 || index >= sources.length) throw new Error("书源索引无效");
    const source = sources[index]; const start = Date.now(); const testUrl = source.url || source.searchUrl;
    if (!validateUrl(testUrl)) throw new Error("书源 URL 无效");
    try {
      const response = await httpClient.request({ url: testUrl, method: "GET", headers: source.header ? (await import("../engine/source-helper.js")).parseHeader(source.header) || {} : {}, timeout: 10000 });
      return "连接成功 · " + (Date.now()-start) + "ms · " + Math.round((response.data?response.data.length:0)/1024) + "KB";
    } catch (err: any) { throw new Error("连接失败: " + err.message) }
  });
  ipcMain.handle("test-all-sources", async (_e: any) => {
    const sources: any[] = store.get("sources") || []; const totalTimeout = 60000; const startTime = Date.now();
    for (let i = 0; i < sources.length; i++) {
      if (Date.now() - startTime > totalTimeout) { _e.sender.send("source-test-result", {index:i,name:sources[i].name,status:"timeout",error:"总体测试超时",time_ms:totalTimeout,size_kb:0}); continue }
      const source = sources[i]; const start = Date.now(); let status = "ok", error = "", sizeKb = 0, timeMs = 0;
      try {
        const testUrl = source.url || source.searchUrl; if (!validateUrl(testUrl)) throw new Error("URL 无效");
        const response = await httpClient.request({ url: testUrl, method: "GET", headers: source.header ? (await import("../engine/source-helper.js")).parseHeader(source.header) || {} : {}, timeout: 8000 });
        timeMs = Date.now() - start; sizeKb = Math.round((response.data?response.data.length:0)/1024);
      } catch (err: any) { status = "fail"; error = err.message; timeMs = Date.now() - start }
      _e.sender.send("source-test-result", {index:i,name:source.name,status,time_ms:timeMs,size_kb:sizeKb,error});
    }
    return [];
  });
  ipcMain.handle("toggle-source", async (_e: any, index: number) => { const sources: any[] = store.get("sources") || []; if (index < 0 || index >= sources.length) return safeClone({success:false,error:"索引越界"}); sources[index].enabled = !sources[index].enabled; store.set("sources", sources); return safeClone({success:true,enabled:sources[index].enabled}) });
  ipcMain.handle("delete-failed-sources", async (_e: any) => {
    const sources: any[] = store.get("sources") || []; const toKeep: any[] = [];
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]; let failed = false;
      try { const testUrl = source.url || source.searchUrl; if (!validateUrl(testUrl)) failed = true; else await httpClient.request({ url: testUrl, method: "GET", headers: source.header ? (await import("../engine/source-helper.js")).parseHeader(source.header) || {} : {}, timeout: 8000 }) } catch { failed = true }
      if (!failed) toKeep.push(source);
      _e.sender.send("delete-failed-progress", {tested:i+1,total:sources.length,failed_count:sources.length-toKeep.length,status:failed?"fail":"ok"});
    }
    store.set("sources", toKeep); const deleted = sources.length - toKeep.length;
    _e.sender.send("delete-failed-complete", {deleted,failed_count:deleted}); return deleted;
  });
  ipcMain.handle("get-explore-categories", async (_e: any, index: number) => {
    const sources: any[] = store.get("sources") || []; if (index < 0 || index >= sources.length) return safeClone([]);
    const source = sources[index]; if (!source.exploreUrl) return safeClone([]);
    const exploreUrl = source.exploreUrl || ""; let result: any[] = [];
    try {
      if (exploreUrl.startsWith("[")) result = JSON.parse(exploreUrl);
      else if (exploreUrl.includes("\n") && exploreUrl.includes("::")) result = exploreUrl.split("\n").filter((l:string) => l.trim() && l.includes("::")).map((l:string) => { const p = l.split("::"); return {title:p[0].trim(),url:p.slice(1).join("::").trim()} }).filter((it:any) => validateUrl(it.url));
      else if (validateUrl(exploreUrl)) {
        try {
          const response = await httpClient.request({ url: exploreUrl, method: "GET", headers: source.header ? (await import("../engine/source-helper.js")).parseHeader(source.header) || {} : {}, timeout: 10000 });
          const data = response.data;
          if (typeof data === "string") { try { const parsed = JSON.parse(data); if (Array.isArray(parsed)) result = parsed } catch { result = data.split("\n").filter((l:string) => l.trim() && l.includes("::")).map((l:string) => { const p = l.split("::"); return {title:p[0].trim(),url:p.slice(1).join("::").trim()} }).filter((it:any) => validateUrl(it.url)) } }
        } catch {}
      }
    } catch {}
    return safeClone(result);
  });

  ipcMain.handle("import-txt", async (_e: any, name: string, content: string) => {
    if (!content || content.trim().length === 0) throw new Error("内容为空");
    if (content.length > 100*1024*1024) throw new Error("文件过大");
    const books: any[] = store.get("books") || []; const bookId = "local_" + Date.now();
    const book = { id: bookId, sourceId: "local", sourceName: "本地文件", name: name || "未命名", author: "本地文件", coverUrl: null, intro: content.substring(0,500)+(content.length>500?"...":""), kind: "本地TXT", lastChapter: null, bookUrl: "local://"+bookId, tocUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content };
    books.unshift(book); store.set("books", books);
    const chapters = getLocalBookChaptersSync(bookId); await store.set("local_chapters_"+bookId, chapters);
    return book;
  });
  ipcMain.handle("get-local-book-chapters", async (_e: any, bookId: string) => { const cached = await store.get("local_chapters_"+bookId); if (cached) return cached; const chapters = getLocalBookChaptersSync(bookId); await store.set("local_chapters_"+bookId, chapters); return chapters });
  ipcMain.handle("get-local-chapter-content", async (_e: any, bookId: string, chapterId: number) => { const chapters = await store.get("local_chapters_"+bookId); if (!chapters) return ""; const chapter = chapters.find((c:any) => Number(c.id) === Number(chapterId)); return chapter ? chapter.content : "" });

  // ===== Engine API =====
  ipcMain.handle("engine-search", async (_e: any, source: any, keyword: string, page: number = 1) => {
    try {
      let result = await search(safeClone(source), keyword, { page });
      if (source.loginCheckJs) {
        const checked = await runLoginCheck(source, JSON.stringify(result));
        if (checked) { try { result = JSON.parse(checked) } catch {} }
      }
      return { success: true, data: safeClone(result) };
    } catch (error: any) { return { success: false, error: error.message } }
  });

  ipcMain.handle("engine-batch-search-stream", async (event: any, sources: any[], keyword: string, options: any = {}) => {
    const searchId = "search_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
    const abortController = new AbortController(); activeSearches.set(searchId, abortController);
    const page = options.page || 1;
    try {
      const total = sources.length; let completed = 0; const concurrency = 5;
      const queue = sources.map((s:any,i:number) => ({source:s,index:i}));
      const results: any[] = new Array(sources.length);
      const worker = async () => {
        while (queue.length > 0) {
          if (abortController.signal.aborted) return;
          const item = queue.shift(); if (!item) break;
          try { results[item.index] = safeClone(await search(safeClone(item.source), keyword, { page }) || []) } catch { results[item.index] = [] }
          completed++;
          if (!abortController.signal.aborted) event.sender.send("search-progress", {completed,total,index:item.index,sourceName:item.source.name,books:results[item.index]||[],searchId,page});
        }
      };
      const promises: Promise<void>[] = [];
      for (let i = 0; i < Math.min(concurrency, sources.length); i++) promises.push(worker());
      await Promise.all(promises);
      if (abortController.signal.aborted) return { success: false, error: "搜索已取消", searchId };
      const data: Record<string,any[]> = {};
      for (let i = 0; i < sources.length; i++) { const key = sources[i].bookSourceName || sources[i].name || "source_"+i; data[key] = results[i] || [] }
      return { success: true, data: safeClone(data), searchId };
    } catch (error: any) { return { success: false, error: error.message, searchId } }
    finally { activeSearches.delete(searchId) }
  });

  ipcMain.handle("engine-get-toc", async (_e: any, source: any, tocUrl: string, options: any = {}) => {
    try {
      const chapters = await getToc(source, tocUrl, { book: options.book });
      return { success: true, data: safeClone(chapters.map((ch:any) => ({id:Number(ch.id),title:String(ch.title||''),url:String(ch.url||''),index:Number(ch.index||0),isVip:!!ch.isVip,isPay:!!ch.isPay,content:ch.content?String(ch.content):null,updateTime:ch.updateTime?String(ch.updateTime):undefined}))) };
    } catch (error: any) { return { success: false, error: error.message } }
  });

  ipcMain.handle("engine-get-content", async (_e: any, source: any, chapterUrl: string) => {
    try { return { success: true, data: await getContent(safeClone(source), chapterUrl) } }
    catch (error: any) { return { success: false, error: error.message } }
  });

  ipcMain.handle("engine-get-book-info", async (_e: any, source: any, bookUrl: string) => {
    try { return { success: true, data: safeClone(await getBookInfo(safeClone(source), bookUrl)) } }
    catch (error: any) { return { success: false, error: error.message } }
  });

  ipcMain.handle("explore-books-by-id", async (_e: any, index: number, categoryUrl: string, page: number) => {
    try {
      const sources: any[] = store.get("sources") || []; if (index < 0 || index >= sources.length) return {success:false,data:[],error:"索引无效"};
      return { success: true, data: safeClone(await getExploreBooks(safeClone(sources[index]), categoryUrl, page)) };
    } catch (error: any) { return { success: false, data: [], error: error.message } }
  });

  ipcMain.handle("execute-js", async (_e: any, code: string, context: any = {}, timeout: number = 5000) => {
    try {
      const sandbox = vm.createContext({ JSON, console, String, Number, Boolean, Array, Object, parseInt, parseFloat, isNaN, isFinite, ...context });
      const script = new vm.Script(code);
      const result = script.runInContext(sandbox, { timeout });
      if (typeof result === "string") return { success: true, result };
      return { success: true, result: JSON.stringify(result) };
    } catch (error: any) { return { success: false, error: error.message } }
  });

  ipcMain.handle("parse-rule", async (_e: any, source: any, rule: string, data: any, context: any = {}) => {
    try { const { parseAndExecute } = await import("../engine/rule-parser/index.js"); return { success: true, data: parseAndExecute(data, rule, { source, ...context }) } }
    catch (error: any) { return { success: false, error: error.message } }
  });

  // ===== 标题栏覆盖层更新（修复版） =====
  ipcMain.handle("update-title-bar-overlay", async (_e: any, options: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow() || getMainWindow();
      if (!win) return { success: false };

      let backgroundColor: string;
      let symbolColor: string;

      // 兼容旧版调用（直接传 theme 字符串）
      if (typeof options === 'string') {
        const isDark = options === 'dark' || (options === 'system' && process.platform !== 'win32');
        backgroundColor = isDark ? '#1a1a1a' : '#ffffff';
        symbolColor = isDark ? '#f0f0f0' : '#1a1a1a';
      } else if (options && typeof options === 'object') {
        // 新版：直接接收从 CSS 变量中读取的颜色值
        backgroundColor = options.backgroundColor || '#1a1a1a';
        symbolColor = options.symbolColor || '#f0f0f0';
      } else {
        backgroundColor = '#1a1a1a';
        symbolColor = '#f0f0f0';
      }

      win.setTitleBarOverlay({
        color: backgroundColor,
        symbolColor: symbolColor,
        height: 40  // 和 CSS 标题栏高度一致
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  });
}

export function clearChapterCache() { chapterCache.clear() }