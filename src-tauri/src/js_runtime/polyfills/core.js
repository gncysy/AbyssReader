// ============================================
// polyfill_core — java 骨架（对齐 Legado JsExtensions）
// ============================================

globalThis.java = globalThis.java || {};
globalThis.__dictMemoryCache = globalThis.__dictMemoryCache || {};

globalThis.window = globalThis.window || globalThis;

function makeIterable(obj) {
    obj[Symbol.iterator] = function() {
        const self = this;
        let i = 0;
        return {
            next: function() {
                if (i < self.size()) {
                    return { value: self.get(i++), done: false };
                }
                return { done: true };
            }
        };
    };
    return obj;
}

function utf8Encode(str) {
    return Deno.core.ops.op_java_str_to_bytes(String(str), 'UTF-8');
}

function utf8Decode(bytes) {
    let arr;
    if (bytes instanceof Uint8Array) {
        arr = bytes;
    } else if (Array.isArray(bytes)) {
        arr = new Uint8Array(bytes);
    } else if (bytes && typeof bytes === 'object') {
        const temp = [];
        for (let i = 0; i < Object.keys(bytes).length; i++) {
            const val = bytes[i];
            if (typeof val === 'number') temp.push(val);
        }
        arr = new Uint8Array(temp);
    } else {
        arr = new Uint8Array(0);
    }
    return Deno.core.ops.op_java_bytes_to_str(arr, 'UTF-8');
}

function latin1Encode(str) {
    const s = String(str);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i) & 0xFF;
    }
    return bytes;
}

function latin1Decode(bytes) {
    let result = "";
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    return result;
}

function encodeWithCharset(str, charset) {
    const enc = (charset || 'UTF-8').toLowerCase();
    if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'latin-1') {
        return latin1Encode(str);
    }
    return utf8Encode(str);
}

function decodeWithCharset(bytes, charset) {
    const enc = (charset || 'UTF-8').toLowerCase();
    if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'latin-1') {
        return latin1Decode(bytes);
    }
    return utf8Decode(bytes);
}

function bytesToBase64Chunked(bytes) {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return Deno.core.ops.op_java_base64_encode(binary);
}

function toUint8Array(data) {
    if (data === null || data === undefined) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return new Uint8Array(data);
    if (data && typeof data === 'object') {
        const temp = [];
        for (let i = 0; i < Object.keys(data).length; i++) {
            const val = data[i];
            if (typeof val === 'number') temp.push(val);
            else if (typeof val === 'string') {
                const num = parseInt(val, 10);
                if (!isNaN(num)) temp.push(num);
            }
        }
        return new Uint8Array(temp);
    }
    if (typeof data === 'string') {
        return Deno.core.ops.op_java_str_to_bytes(data, 'UTF-8');
    }
    return new Uint8Array(0);
}

/**
 * 取当前沙箱的内容（与 java.getElements 一致）。
 */
function getSandboxContent() {
    return globalThis.__sandbox_data ? (globalThis.__sandbox_data.result || '') : '';
}

/**
 * 取当前沙箱的 baseUrl。
 * 优先 __sandbox_data.baseUrl，其次 source.bookSourceUrl。
 */
function getSandboxBaseUrl() {
    if (globalThis.__sandbox_data) {
        if (globalThis.__sandbox_data.baseUrl) {
            return String(globalThis.__sandbox_data.baseUrl);
        }
        const src = globalThis.__sandbox_data.source;
        if (src && src.bookSourceUrl) {
            return String(src.bookSourceUrl);
        }
    }
    return '';
}

/**
 * 把 str 解析为绝对路径。
 * 依赖 dom.js 提供的 Element / Elements。
 */
function resolveAbsoluteUrl(str, baseUrl) {
    if (!str) return str;
    if (/^https?:\/\//i.test(str)) return str;
    if (/^\/\//.test(str)) return 'https:' + str;
    if (/^data:/i.test(str)) return str;
    if (!baseUrl) return str;
    try {
        return new URL(str, baseUrl).href;
    } catch (e) {
        return str;
    }
}

Object.assign(globalThis.java, {
    put: function(key, value) { return Deno.core.ops.op_java_put("default", String(key), String(value)); },
    get: function(key) { return Deno.core.ops.op_java_get("default", String(key)); },

    getString: function(key) {
        const srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return Deno.core.ops.op_java_get(srcKey, String(key));
    },
    setString: function(key, value) {
        const srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return Deno.core.ops.op_java_put(srcKey, String(key), String(value));
    },
    removeString: function(key) {
        const srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        Deno.core.ops.op_java_remove(srcKey, String(key));
    },

    encodeURI: function(str, enc) {
        try {
            if (enc) return encodeURIComponent(String(str));
            return encodeURIComponent(String(str));
        } catch(e) { return ""; }
    },
    decodeURI: function(str) { return decodeURIComponent(String(str)); },

    base64Encode: function(str) { return Deno.core.ops.op_java_base64_encode(String(str)); },
    base64Decode: function(str) { return Deno.core.ops.op_java_base64_decode(String(str)); },
    base64DecodeToByteArray: function(str) {
        if (!str) return null;
        return Deno.core.ops.op_java_base64_decode_bytes(String(str));
    },

    hexEncodeToString: function(str) {
        if (!str) return "";
        const s = String(str);
        const bytes = utf8Encode(s);
        let result = "";
        for (let i = 0; i < bytes.length; i++) {
            result += bytes[i].toString(16).padStart(2, '0');
        }
        return result;
    },
    hexDecodeToString: function(hex) {
        if (!/^[0-9a-fA-F]+$/.test(hex)) return hex;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return utf8Decode(bytes);
    },

    md5Encode: function(str) { return Deno.core.ops.op_java_md5_encode(String(str)); },
    md5Encode16: function(str) { const full = Deno.core.ops.op_java_md5_encode(String(str)); return full.substring(8, 24); },

    timeFormat: function(ts) { return Deno.core.ops.op_java_time_format(Number(ts)); },
    timeFormatUTC: function(time, format, sh) {
        try {
            const d = new Date(time);
            d.setHours(d.getHours() + (sh || 0));
            return d.toISOString();
        } catch(e) { return ""; }
    },

    randomUUID: function() { return Deno.core.ops.op_java_random_uuid(); },

    strToBytes: function(str, charset) {
        return Deno.core.ops.op_java_str_to_bytes(String(str), charset || 'UTF-8');
    },
    bytesToStr: function(bytes, charset) {
        if (!bytes || bytes.length === 0) return "";
        let arr;
        if (bytes instanceof Uint8Array) {
            arr = bytes;
        } else if (Array.isArray(bytes)) {
            arr = new Uint8Array(bytes);
        } else if (bytes && typeof bytes === 'object') {
            const temp = [];
            for (let i = 0; i < Object.keys(bytes).length; i++) {
                const val = bytes[i];
                if (typeof val === 'number') temp.push(val);
            }
            arr = new Uint8Array(temp);
        } else {
            arr = new Uint8Array(0);
        }
        return Deno.core.ops.op_java_bytes_to_str(arr, charset || 'UTF-8');
    },
    getByteArray: function(data) {
        if (typeof data === "string") {
            return utf8Encode(String(data));
        }
        return new Uint8Array();
    },

    t2s: function(text) { return Deno.core.ops.op_java_t2s(String(text)); },
    s2t: function(text) { return Deno.core.ops.op_java_s2t(String(text)); },

    androidId: function() { return "abyss-reader-android-id"; },
    getWebViewUA: function() { return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"; },

    log: function(msg) {
        Deno.core.ops.op_java_emit_log("info", String(msg));
        return undefined;
    },
    toast: function(msg) {
        Deno.core.ops.op_java_toast(String(msg), false);
        return undefined;
    },
    longToast: function(msg) {
        Deno.core.ops.op_java_toast(String(msg), true);
        return undefined;
    },
    logType: function(any) {
        if (any === null) { globalThis.java.log("null"); return undefined; }
        if (any === undefined) { globalThis.java.log("undefined"); return undefined; }
        globalThis.java.log(typeof any + (any && any.constructor ? " (" + any.constructor.name + ")" : ""));
        return undefined;
    },

    htmlFormat: function(str) {
        if (!str) return "";
        return String(str)
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"")
            .replace(/<br\s*\/?>/gi,"\n")
            .replace(/<\/p>/gi,"\n")
            .replace(/<[^>]+>/g,"")
            .replace(/&nbsp;/g," ")
            .replace(/&amp;/g,"&")
            .replace(/&lt;/g,"<")
            .replace(/&gt;/g,">")
            .replace(/&quot;/g,'"');
    },

    toNumChapter: function(s) {
        if (!s) return null;
        return s;
    },

    toURL: function(url, baseUrl) {
        try {
            return { toString: function() { return baseUrl ? new URL(url, baseUrl).href : url; } };
        } catch(e) {
            return { toString: function() { return url; } };
        }
    },

    getReadBookConfig: function() { return "{}"; },
    getThemeMode: function() { return "0"; },
    getThemeConfig: function() { return "{}"; },

    openUrl: function(url, mimeType) {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            Deno.core.ops.op_java_start_browser(String(url));
        }
        return undefined;
    },

    openVideoPlayer: function(url, title) {
        Deno.core.ops.op_java_open_video_player(String(url), String(title || ""));
        return undefined;
    },

    startBrowser: function(url, title) {
        Deno.core.ops.op_java_start_browser(String(url));
        return undefined;
    },

    startBrowserAwait: function(url, title) {
        Deno.core.ops.op_java_start_browser_await(String(url), String(title || ""));
        return undefined;
    },

    getVerificationCode: function(svg) {
        return Deno.core.ops.op_java_get_verification_code(String(svg));
    },

    searchBook: function(keyword, sourceJson) {
        Deno.core.ops.op_java_search_book(String(keyword), String(sourceJson || ""));
        return keyword;
    },

    showPhoto: function(src) {
        Deno.core.ops.op_java_show_photo(String(src));
        return src;
    },

    copyText: function(text) {
        Deno.core.ops.op_java_copy_text(String(text));
        return undefined;
    },

    refreshExplore: function() {
        Deno.core.ops.op_java_refresh_explore();
        return undefined;
    },

    refreshBookInfo: function() {
        Deno.core.ops.op_java_refresh_book_info();
        return undefined;
    },

    /**
     * 对齐 Legado 的 java.upLoginData(Map<String, Any?>?)
     * - data 为 null/undefined → 传空字符串（前端识别为"用 default 重建"）
     * - data 是对象 → JSON.stringify
     */
    upLoginData: function(i) {
        var str;
        if (i === null || i === undefined) {
            str = '';
        } else {
            try {
                str = JSON.stringify(i);
            } catch (e) {
                str = '';
            }
        }
        Deno.core.ops.op_java_up_login_data(str);
        return undefined;
    },

    /**
     * 对齐 Legado 的 java.reLoginView(Boolean)
     * 触发前端重建登录界面。
     */
    reLoginView: function(deltaUp) {
        Deno.core.ops.op_java_re_login_view(!!deltaUp);
        return undefined;
    },

    source: {
        setVariable: function(k, v) {
            const srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
            return Deno.core.ops.op_java_put(srcKey, "source_" + String(k), String(v));
        },
        getVariable: function(k) {
            const srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
            return Deno.core.ops.op_java_get(srcKey, "source_" + String(k));
        },
        getKey: function() { return Deno.core.ops.op_java_get("default", "bookSourceUrl"); },
        getTag: function() { return Deno.core.ops.op_java_get("default", "bookSourceName"); },
        putLoginHeader: function(h) { Deno.core.ops.op_java_put("default", "loginHeader", String(h)); },
        getLoginHeader: function() { return Deno.core.ops.op_java_get("default", "loginHeader"); },
        getLoginInfoMap: function() {
            const v = Deno.core.ops.op_java_get("default", "loginHeader");
            if (!v) return {};
            try { return JSON.parse(v.replace(/^#/, "")); } catch(e) { return {}; }
        },
        putLoginInfo: function(i) { Deno.core.ops.op_java_put("default", "loginHeader", "#" + i); }
    },

    cache: {
        _store: {},
        get: function(k) { return this._store[k] || null; },
        put: function(k, v) { this._store[k] = v; },
        delete: function(k) { delete this._store[k]; },
        clear: function() { this._store = {}; },
        getFromMemory: function(k) { const v = Deno.core.ops.op_java_get("dict", String(k)); return v || null; },
        putMemory: function(k, v) { Deno.core.ops.op_java_put("dict", String(k), String(v)); },
        deleteMemory: function(k) { Deno.core.ops.op_java_put("dict", String(k), ""); }
    },

    cacheFile: function(urlStr, saveTime) {
        return Deno.core.ops.op_java_cache_file(String(urlStr));
    },
    importScript: function(path) {
        if (path.startsWith("http")) return globalThis.java.cacheFile(path);
        return globalThis.java.readTxtFile(path);
    },
    readTxtFile: function(path, charset) {
        return Deno.core.ops.op_java_read_txt_file(String(path));
    },
    readFile: function(path) {
        const b64 = Deno.core.ops.op_java_read_file_bytes_base64(String(path));
        if (!b64 || b64.startsWith("error:")) return null;
        return b64;
    },
    deleteFile: function(path) {
        const r = Deno.core.ops.op_java_delete_file(String(path));
        return r === "true";
    },
    getTxtInFolder: function(path) {
        return Deno.core.ops.op_java_get_txt_in_folder(String(path));
    },
    unArchiveFile: function(path) {
        return Deno.core.ops.op_java_unarchive_file(String(path));
    },
    unzipFile: function(path) { return globalThis.java.unArchiveFile(path); },
    un7zFile: function(path) { return globalThis.java.unArchiveFile(path); },
    unrarFile: function(path) { return globalThis.java.unArchiveFile(path); },

    downloadFile: function(url) {
        return Deno.core.ops.op_java_download_file(String(Array.isArray(url) ? url[0] : url));
    },

    queryTTF: function(data) {
        try {
            const raw = Deno.core.ops.op_java_query_ttf(String(data));
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.cmap === undefined) return null;
            const unicodeToGlyph = {};
            for (var i = 0; i < parsed.cmap.length; i++) {
                const pair = parsed.cmap[i];
                unicodeToGlyph[pair[0]] = pair[1];
            }
            const glyfToUnicode = {};
            if (parsed.glyfMap) {
                for (var i = 0; i < parsed.glyfMap.length; i++) {
                    const entry = parsed.glyfMap[i];
                    glyfToUnicode[entry.data] = entry.cp;
                }
            }
            return {
                getGlyfIdByUnicode: function(unicode) { return unicodeToGlyph[unicode] || 0; },
                getGlyfByUnicode: function(unicode) {
                    const gid = unicodeToGlyph[unicode];
                    if (gid === undefined) return null;
                    for (let i = 0; i < parsed.glyfMap.length; i++) {
                        if (parsed.glyfMap[i].gid === gid) return parsed.glyfMap[i].data;
                    }
                    return null;
                },
                getUnicodeByGlyf: function(glyfData) {
                    if (!glyfData) return 0;
                    return glyfToUnicode[glyfData] || 0;
                },
                isBlankUnicode: function(unicode) {
                    return unicode === 0x0020 || unicode === 0x00A0 || unicode === 0x3000;
                }
            };
        } catch(e) { return null; }
    },
    queryBase64TTF: function(data) { return globalThis.java.queryTTF(data); },

    replaceFont: function(text, errorQueryTTF, correctQueryTTF, filter) {
        if (!errorQueryTTF || !correctQueryTTF || !text) return text;
        let result = "";
        for (let i = 0; i < text.length; i++) {
            const ch = text.charAt(i);
            const code = ch.codePointAt(0) || ch.charCodeAt(0);
            if (errorQueryTTF.isBlankUnicode(code)) { result += ch; continue; }
            const glyf = errorQueryTTF.getGlyfByUnicode(code);
            if (filter && !glyf) continue;
            const newCode = correctQueryTTF.getUnicodeByGlyf(glyf);
            if (newCode !== 0 && newCode !== undefined) {
                result += String.fromCodePoint(newCode);
            } else if (!filter) {
                result += ch;
            }
        }
        return result;
    },

    createSymmetricCrypto: function(algorithm, key, iv) {
        const algo = String(algorithm).toUpperCase();
        const isDes = algo.indexOf("DES") !== -1;
        const isAes = algo.indexOf("AES") !== -1;

        if (isAes || isDes) {
            const keyArr = toUint8Array(key);
            const ivArr = iv ? toUint8Array(iv) : new Uint8Array(0);
            const decryptFn = isDes ? Deno.core.ops.op_java_des_decrypt_bytes : Deno.core.ops.op_java_aes_decrypt_bytes;
            const encryptFn = isDes ? Deno.core.ops.op_java_des_encrypt_bytes : Deno.core.ops.op_java_aes_encrypt_bytes;

            return {
                decrypt: function(data) {
                    try {
                        const dataBytes = toUint8Array(data);
                        return decryptFn(dataBytes, keyArr, ivArr);
                    } catch(e) { return null; }
                },
                encrypt: function(data) {
                    try {
                        const dataBytes = toUint8Array(data);
                        return encryptFn(dataBytes, keyArr, ivArr);
                    } catch(e) { return null; }
                },
                decryptStr: function(data) {
                    try {
                        const dataBytes = toUint8Array(data);
                        const decrypted = decryptFn(dataBytes, keyArr, ivArr);
                        return Deno.core.ops.op_java_bytes_to_str(toUint8Array(decrypted), 'UTF-8');
                    } catch(e) { return ""; }
                },
                encryptStr: function(data) {
                    try {
                        const dataBytes = toUint8Array(data);
                        const encrypted = encryptFn(dataBytes, keyArr, ivArr);
                        return Deno.core.ops.op_java_bytes_to_str(toUint8Array(encrypted), 'UTF-8');
                    } catch(e) { return ""; }
                },
                encryptBase64: function(data) {
                    try {
                        const dataBytes = toUint8Array(data);
                        const encrypted = encryptFn(dataBytes, keyArr, ivArr);
                        return bytesToBase64Chunked(encrypted);
                    } catch(e) { return ""; }
                },
                decryptBase64: function(data) {
                    try {
                        const decoded = Deno.core.ops.op_java_base64_decode_bytes(String(data));
                        const decrypted = decryptFn(toUint8Array(decoded), keyArr, ivArr);
                        return Deno.core.ops.op_java_bytes_to_str(toUint8Array(decrypted), 'UTF-8');
                    } catch(e) { return ""; }
                }
            };
        }

        return {
            decrypt: function(d){ return null; },
            encrypt: function(d){ return null; },
            decryptStr: function(d){ return ""; },
            encryptStr: function(d){ return ""; },
            encryptBase64: function(d){ return ""; },
            decryptBase64: function(d){ return ""; }
        };
    },

    createSign: function(algorithm) {
        const key = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return {
            sign: function(data) {
                return Deno.core.ops.op_java_sign(String(key), String(data), String(algorithm));
            }
        };
    },

    /**
     * 对齐 Legado 的 java.getElements(rule, isUrl?)。
     * 从当前沙箱内容取所有匹配元素，返回可迭代的 Elements 对象。
     *
     * 修复：原实现在 dom.js 里通过 Element 构造，但 core.js 先于 dom.js
     * 加载，所以这里引用 Element 是在函数体内（延迟求值），运行时 dom.js
     * 已加载完，安全。
     */
    getElements: function(rule, isUrl) {
        try {
            const data = getSandboxContent();
            const result = Deno.core.ops.op_jsoup_select(data, rule || '');
            const elements = JSON.parse(result);
            return makeIterable({
                size: function() { return elements.length; },
                get: function(i) { return elements[i] || ''; },
                toArray: function() { return elements; },
                first: function() { return elements.length > 0 ? elements[0] : ''; },
                last: function() { return elements.length > 0 ? elements[elements.length - 1] : ''; }
            });
        } catch(e) {
            return makeIterable({
                size: function() { return 0; },
                get: function() { return ''; },
                toArray: function() { return []; },
                first: function() { return ''; },
                last: function() { return ''; }
            });
        }
    },

    /**
     * 对齐 Legado 的 java.getElement(rule, isUrl?)。
     * 从当前沙箱内容取首个匹配元素，返回 Element 对象；无匹配返回 null。
     *
     * 为什么返回 null 而不是空 Element：
     * - 书源常用 `java.getElement(A) || java.getElement(B) || java.getElement(C)` 的
     *   `||` 链式回退。若返回 truthy 空对象，链会停在第一个，回退失效。
     * - Legado 的 getElement 返回 Java 引用，无匹配就是 null，语义对齐。
     *
     * Element 由 dom.js 提供（带 .select/.attr/.text/.html/.outerHtml/.tagName/.children）。
     * core.js 先于 dom.js 加载，但此处是函数体，延迟到调用时才查找 Element，安全。
     */
    getElement: function(rule, isUrl) {
        try {
            const data = getSandboxContent();
            const selector = rule || '';
            const count = Deno.core.ops.op_jsoup_size(data, selector);
            if (!count || count <= 0) {
                return null;
            }
            const firstHtml = Deno.core.ops.op_jsoup_get(data, selector, 0);
            if (!firstHtml) {
                return null;
            }
            // Element 由 dom.js 提供，运行时已加载
            return new globalThis.Element(firstHtml);
        } catch(e) {
            return null;
        }
    },

    /**
     * 对齐 Legado 的 java.getString(rule, isUrl?)。
     * 从当前沙箱内容取首个匹配元素的文本；无匹配返回空字符串。
     * isUrl 为 true 时解析为绝对路径。
     *
     * 语义对齐 Legado AnalyzeRule.getString：
     * - 返回首个匹配元素的 text（不是 html）
     * - isUrl 时走 resolveUrl
     */
    getString: function(rule, isUrl) {
        try {
            const data = getSandboxContent();
            const selector = rule || '';
            const count = Deno.core.ops.op_jsoup_size(data, selector);
            if (!count || count <= 0) {
                return '';
            }
            const firstHtml = Deno.core.ops.op_jsoup_get(data, selector, 0);
            if (!firstHtml) {
                return '';
            }
            const text = Deno.core.ops.op_jsoup_text(firstHtml);
            if (isUrl === true) {
                return resolveAbsoluteUrl(text, getSandboxBaseUrl());
            }
            return text;
        } catch(e) {
            return '';
        }
    },

    getStringList: function(rule, isUrl) {
        try {
            const data = getSandboxContent();
            const result = Deno.core.ops.op_jsoup_each_text(data, rule || '');
            const texts = JSON.parse(result);
            return makeIterable({
                size: function() { return texts.length; },
                get: function(i) { return texts[i] || ''; },
                toArray: function() { return texts; }
            });
        } catch(e) {
            return makeIterable({ size: function() { return 0; }, get: function() { return ''; }, toArray: function() { return []; } });
        }
    },

    setContent: function(html, baseUrl) {
        globalThis.__sandbox_data = globalThis.__sandbox_data || {};
        globalThis.__sandbox_data.result = html;
        globalThis.__sandbox_data.baseUrl = baseUrl || "";
    },

    upLoginData: function(i) {
        var str;
        if (i === null || i === undefined) {
            str = '';
        } else {
            try {
                str = JSON.stringify(i);
            } catch (e) {
                str = '';
            }
        }
        Deno.core.ops.op_java_up_login_data(str);
        return undefined;
    },

    reLoginView: function(deltaUp) {
        Deno.core.ops.op_java_re_login_view(!!deltaUp);
        return undefined;
    },

    eventListener: false,
    on: function() {},
    emit: function() {},
});

globalThis.cache = globalThis.java.cache;
globalThis.cookie = globalThis.cookie || {};
