// ============================================
// polyfill_core — java 骨架（对齐 Legado JsExtensions）
// ============================================

globalThis.java = globalThis.java || {};
globalThis.__dictMemoryCache = globalThis.__dictMemoryCache || {};

globalThis.window = globalThis.window || globalThis;

// 添加通用迭代器辅助函数
function makeIterable(obj) {
    obj[Symbol.iterator] = function() {
        var self = this;
        var i = 0;
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

// 修复：Deno.core.encode 返回 JSON 对象，改用 op_java_str_to_bytes
// UTF-8 编解码辅助
function utf8Encode(str) {
    return Deno.core.ops.op_java_str_to_bytes(String(str), 'UTF-8');
}

function utf8Decode(bytes) {
    var arr;
    if (bytes instanceof Uint8Array) {
        arr = bytes;
    } else if (Array.isArray(bytes)) {
        arr = new Uint8Array(bytes);
    } else if (bytes && typeof bytes === 'object') {
        // JSON 对象（Deno.core.encode 的返回值）
        var temp = [];
        for (var i = 0; i < Object.keys(bytes).length; i++) {
            var val = bytes[i];
            if (typeof val === 'number') temp.push(val);
        }
        arr = new Uint8Array(temp);
    } else {
        arr = new Uint8Array(0);
    }
    return Deno.core.ops.op_java_bytes_to_str(arr, 'UTF-8');
}

// ISO-8859-1 编解码
function latin1Encode(str) {
    var s = String(str);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i) & 0xFF;
    }
    return bytes;
}

function latin1Decode(bytes) {
    var result = "";
    for (var i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    return result;
}

// 根据 charset 选择编码
function encodeWithCharset(str, charset) {
    var enc = (charset || 'UTF-8').toLowerCase();
    if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'latin-1') {
        return latin1Encode(str);
    }
    return utf8Encode(str);
}

function decodeWithCharset(bytes, charset) {
    var enc = (charset || 'UTF-8').toLowerCase();
    if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'latin-1') {
        return latin1Decode(bytes);
    }
    return utf8Decode(bytes);
}

// 安全的分块 bytesToBase64（避免栈溢出）
function bytesToBase64Chunked(bytes) {
    var binary = '';
    var chunkSize = 8192;
    for (var i = 0; i < bytes.length; i += chunkSize) {
        var chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return Deno.core.ops.op_java_base64_encode(binary);
}

// 将任意值转换为 Uint8Array（兼容 Uint8Array、普通数组、JSON 对象、字符串）
function toUint8Array(data) {
    if (data === null || data === undefined) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return new Uint8Array(data);
    if (data && typeof data === 'object') {
        // JSON 对象（如 {"0":116,"1":101}）
        var temp = [];
        for (var i = 0; i < Object.keys(data).length; i++) {
            var val = data[i];
            if (typeof val === 'number') temp.push(val);
            else if (typeof val === 'string') {
                var num = parseInt(val, 10);
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

Object.assign(globalThis.java, {
    put: function(key, value) { return Deno.core.ops.op_java_put("default", String(key), String(value)); },
    get: function(key) { return Deno.core.ops.op_java_get("default", String(key)); },

    // getString 方法
    getString: function(key) {
        var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return Deno.core.ops.op_java_get(srcKey, String(key));
    },
    setString: function(key, value) {
        var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return Deno.core.ops.op_java_put(srcKey, String(key), String(value));
    },
    removeString: function(key) {
        var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        Deno.core.ops.op_java_put(srcKey, String(key), "");
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
        var s = String(str);
        var bytes = utf8Encode(s);
        var result = "";
        for (var i = 0; i < bytes.length; i++) {
            result += bytes[i].toString(16).padStart(2, '0');
        }
        return result;
    },
    hexDecodeToString: function(hex) {
        if (!/^[0-9a-fA-F]+$/.test(hex)) return hex;
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return utf8Decode(bytes);
    },

    md5Encode: function(str) { return Deno.core.ops.op_java_md5_encode(String(str)); },
    md5Encode16: function(str) { var full = Deno.core.ops.op_java_md5_encode(String(str)); return full.substring(8, 24); },

    timeFormat: function(ts) { return Deno.core.ops.op_java_time_format(Number(ts)); },
    timeFormatUTC: function(time, format, sh) {
        try {
            var d = new Date(time);
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
        var arr;
        if (bytes instanceof Uint8Array) {
            arr = bytes;
        } else if (Array.isArray(bytes)) {
            arr = new Uint8Array(bytes);
        } else if (bytes && typeof bytes === 'object') {
            var temp = [];
            for (var i = 0; i < Object.keys(bytes).length; i++) {
                var val = bytes[i];
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

    log: function(msg) { Deno.core.ops.op_java_emit_log("info", String(msg)); return msg; },
    toast: function(msg) { Deno.core.ops.op_java_emit_log("warn", String(msg)); return msg; },
    longToast: function(msg) { Deno.core.ops.op_java_emit_log("error", String(msg)); return msg; },
    logType: function(any) {
        if (any === null) { globalThis.java.log("null"); return; }
        if (any === undefined) { globalThis.java.log("undefined"); return; }
        globalThis.java.log(typeof any + (any && any.constructor ? " (" + any.constructor.name + ")" : ""));
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
    },

    openVideoPlayer: function(url, title) {
        return Deno.core.ops.op_java_open_video_player(String(url), String(title || ""));
    },

    startBrowser: function(url, title) {
        Deno.core.ops.op_java_start_browser(String(url));
    },

    startBrowserAwait: function(url, title) {
        return Deno.core.ops.op_java_start_browser_await(String(url), String(title || ""));
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
    },

    refreshExplore: function() {
        Deno.core.ops.op_java_refresh_explore();
    },

    refreshBookInfo: function() {
        Deno.core.ops.op_java_refresh_book_info();
    },

    source: {
        setVariable: function(k, v) {
            var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
            return Deno.core.ops.op_java_put(srcKey, "source_" + String(k), String(v));
        },
        getVariable: function(k) {
            var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
            return Deno.core.ops.op_java_get(srcKey, "source_" + String(k));
        },
        getKey: function() { return Deno.core.ops.op_java_get("default", "bookSourceUrl"); },
        getTag: function() { return Deno.core.ops.op_java_get("default", "bookSourceName"); },
        putLoginHeader: function(h) { Deno.core.ops.op_java_put("default", "loginHeader", String(h)); },
        getLoginHeader: function() { return Deno.core.ops.op_java_get("default", "loginHeader"); },
        getLoginInfoMap: function() {
            var v = Deno.core.ops.op_java_get("default", "loginHeader");
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
        getFromMemory: function(k) { var v = Deno.core.ops.op_java_get("dict", String(k)); return v || null; },
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
        var b64 = Deno.core.ops.op_java_read_file_bytes_base64(String(path));
        if (!b64 || b64.startsWith("error:")) return null;
        return b64;
    },
    deleteFile: function(path) {
        var r = Deno.core.ops.op_java_delete_file(String(path));
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
            var raw = Deno.core.ops.op_java_query_ttf(String(data));
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.cmap === undefined) return null;
            var unicodeToGlyph = {};
            for (var i = 0; i < parsed.cmap.length; i++) {
                var pair = parsed.cmap[i];
                unicodeToGlyph[pair[0]] = pair[1];
            }
            var glyfToUnicode = {};
            if (parsed.glyfMap) {
                for (var i = 0; i < parsed.glyfMap.length; i++) {
                    var entry = parsed.glyfMap[i];
                    glyfToUnicode[entry.data] = entry.cp;
                }
            }
            return {
                getGlyfIdByUnicode: function(unicode) { return unicodeToGlyph[unicode] || 0; },
                getGlyfByUnicode: function(unicode) {
                    var gid = unicodeToGlyph[unicode];
                    if (gid === undefined) return null;
                    for (var i = 0; i < parsed.glyfMap.length; i++) {
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
        var result = "";
        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            var code = ch.codePointAt(0) || ch.charCodeAt(0);
            if (errorQueryTTF.isBlankUnicode(code)) { result += ch; continue; }
            var glyf = errorQueryTTF.getGlyfByUnicode(code);
            if (filter && !glyf) continue;
            var newCode = correctQueryTTF.getUnicodeByGlyf(glyf);
            if (newCode !== 0 && newCode !== undefined) {
                result += String.fromCodePoint(newCode);
            } else if (!filter) {
                result += ch;
            }
        }
        return result;
    },

    createSymmetricCrypto: function(algorithm, key, iv) {
        var algo = String(algorithm).toUpperCase();
        var isDes = algo.indexOf("DES") !== -1;
        var isAes = algo.indexOf("AES") !== -1;

        if (isAes || isDes) {
            var keyArr = toUint8Array(key);
            var ivArr = iv ? toUint8Array(iv) : new Uint8Array(0);
            var decryptFn = isDes ? Deno.core.ops.op_java_des_decrypt_bytes : Deno.core.ops.op_java_aes_decrypt_bytes;
            var encryptFn = isDes ? Deno.core.ops.op_java_des_encrypt_bytes : Deno.core.ops.op_java_aes_encrypt_bytes;

            return {
                decrypt: function(data) {
                    try {
                        var dataBytes = toUint8Array(data);
                        return decryptFn(dataBytes, keyArr, ivArr);
                    } catch(e) { return null; }
                },
                encrypt: function(data) {
                    try {
                        var dataBytes = toUint8Array(data);
                        return encryptFn(dataBytes, keyArr, ivArr);
                    } catch(e) { return null; }
                },
                decryptStr: function(data) {
                    try {
                        var dataBytes = toUint8Array(data);
                        var decrypted = decryptFn(dataBytes, keyArr, ivArr);
                        return Deno.core.ops.op_java_bytes_to_str(toUint8Array(decrypted), 'UTF-8');
                    } catch(e) { return ""; }
                },
                encryptStr: function(data) {
                    try {
                        var dataBytes = toUint8Array(data);
                        var encrypted = encryptFn(dataBytes, keyArr, ivArr);
                        return Deno.core.ops.op_java_bytes_to_str(toUint8Array(encrypted), 'UTF-8');
                    } catch(e) { return ""; }
                },
                encryptBase64: function(data) {
                    try {
                        var dataBytes = toUint8Array(data);
                        var encrypted = encryptFn(dataBytes, keyArr, ivArr);
                        return bytesToBase64Chunked(encrypted);
                    } catch(e) { return ""; }
                },
                decryptBase64: function(data) {
                    try {
                        var decoded = Deno.core.ops.op_java_base64_decode_bytes(String(data));
                        var decrypted = decryptFn(toUint8Array(decoded), keyArr, ivArr);
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
        var key = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || "default";
        return {
            sign: function(data) {
                return Deno.core.ops.op_java_sign(String(key), String(data), String(algorithm));
            }
        };
    },

    getStringList: function(rule, isUrl) {
        try {
            var data = globalThis.__sandbox_data ? (globalThis.__sandbox_data.result || '') : '';
            var result = Deno.core.ops.op_jsoup_each_text(data, rule || '');
            var texts = JSON.parse(result);
            return makeIterable({
                size: function() { return texts.length; },
                get: function(i) { return texts[i] || ''; },
                toArray: function() { return texts; }
            });
        } catch(e) {
            return makeIterable({ size: function() { return 0; }, get: function() { return ''; }, toArray: function() { return []; } });
        }
    },

    getElements: function(rule, isUrl) {
        try {
            var data = globalThis.__sandbox_data ? (globalThis.__sandbox_data.result || '') : '';
            var result = Deno.core.ops.op_jsoup_select(data, rule || '');
            var elements = JSON.parse(result);
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

    setContent: function(html, baseUrl) {
        globalThis.__sandbox_data = globalThis.__sandbox_data || {};
        globalThis.__sandbox_data.result = html;
        globalThis.__sandbox_data.baseUrl = baseUrl || "";
    },

    upLoginData: function(i) { Deno.core.ops.op_java_up_login_data(String(i)); },

    eventListener: false,
    on: function() {},
    emit: function() {},
});

globalThis.cache = globalThis.java.cache;
globalThis.cookie = globalThis.cookie || {};
