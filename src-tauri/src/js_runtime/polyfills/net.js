// ============================================
// polyfill_net — ajax, cookie（对齐 Legado）
// ============================================
(function() {
    var j = globalThis.java;

    function parseAjaxResponse(raw) {
        try {
            if (typeof raw === 'string' && raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && 'body' in parsed) {
                    return parsed;
                }
            }
        } catch(e) {}
        return { body: String(raw), url: '', headers: {}, status: 0 };
    }

    function makeResponse(raw, originalUrl) {
        var parsed = parseAjaxResponse(raw);

        var responseObj = {
            _raw: raw,
            _parsed: parsed,
            headers: function(name) {
                var h = parsed.headers || {};
                if (name) {
                    var lower = String(name).toLowerCase();
                    for (var k in h) {
                        if (k.toLowerCase() === lower) return h[k];
                    }
                    return '';
                }
                return h;
            },
            header: function(name) {
                var h = parsed.headers || {};
                if (name) {
                    var lower = String(name).toLowerCase();
                    for (var k in h) {
                        if (k.toLowerCase() === lower) return h[k];
                    }
                    return null;
                }
                return h;
            },
            statusCode: function() { return parsed.status || 0; },
            url: function() { return { toString: function() { return parsed.url || originalUrl || ''; } }; },
            body: function() { return parsed.body || ''; },
            toString: function() { return parsed.body || ''; },
            // 修复：添加 raw() 方法，返回模拟的 okhttp Response 对象
            raw: function() {
                return {
                    body: function() { return parsed.body || ''; },
                    headers: function(name) {
                        var h = parsed.headers || {};
                        if (name) {
                            var lower = String(name).toLowerCase();
                            for (var k in h) {
                                if (k.toLowerCase() === lower) return h[k];
                            }
                            return '';
                        }
                        return h;
                    },
                    header: function(name) {
                        var h = parsed.headers || {};
                        if (name) {
                            var lower = String(name).toLowerCase();
                            for (var k in h) {
                                if (k.toLowerCase() === lower) return h[k];
                            }
                            return null;
                        }
                        return h;
                    },
                    statusCode: function() { return parsed.status || 0; },
                    url: function() { return { toString: function() { return parsed.url || originalUrl || ''; } }; },
                    toString: function() { return parsed.body || ''; }
                };
            }
        };

        return responseObj;
    }

    j.ajax = function(url, callTimeout) {
        var urlStr = Array.isArray(url) ? String(url[0]) : String(url);
        if (!/^https?:\/\//i.test(urlStr)) {
            return "";
        }

        var hasOptions = urlStr.indexOf(',{') !== -1;

        if (!hasOptions) {
            var autoHeaders = {};
            var source = globalThis.__sandbox_data && globalThis.__sandbox_data.source;
            if (source && source.header) {
                var headerStr = source.header;
                if (typeof headerStr === 'string') {
                    try {
                        if (headerStr.startsWith('@js:') || headerStr.startsWith('<js>')) {
                            var jsCode = headerStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, '');
                            var fn = new Function('source', 'baseUrl', 'result', 'java', 'cookie', jsCode);
                            var hResult = fn(source, source.bookSourceUrl || '', '', j, globalThis.cookie);
                            var parsedH = JSON.parse(hResult);
                            if (parsedH && typeof parsedH === 'object') Object.assign(autoHeaders, parsedH);
                        } else {
                            var parsedH2 = JSON.parse(headerStr.replace(/'/g, '"'));
                            if (parsedH2 && typeof parsedH2 === 'object') Object.assign(autoHeaders, parsedH2);
                        }
                    } catch(e) {}
                }
            }

            try {
                var baseUrl = source ? (source.bookSourceUrl || '') : '';
                var cookieStr = globalThis.cookie ? globalThis.cookie.getCookie(baseUrl, '') : '';
                if (cookieStr && !autoHeaders['Cookie']) autoHeaders['Cookie'] = cookieStr;
            } catch(e) {}

            if (!autoHeaders['User-Agent']) autoHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
            if (source && source.bookSourceUrl && !autoHeaders['Referer']) autoHeaders['Referer'] = source.bookSourceUrl;

            if (callTimeout) autoHeaders['_callTimeout'] = String(callTimeout);

            var optionObj = { headers: autoHeaders };
            urlStr = urlStr + ',' + JSON.stringify(optionObj);
        }

        var rawResult = Deno.core.ops.op_java_ajax(urlStr);
        var respObj = makeResponse(rawResult, urlStr);
        var body = respObj.body();

        try {
            var setCookieHeader = respObj.headers('Set-Cookie') || respObj.headers('set-cookie');
            if (setCookieHeader) {
                globalThis.cookie.setCookie(urlStr, setCookieHeader);
            }
        } catch(e) {}

        try { j.saveCookies(); } catch(e) {}
        return body;
    };

    j.ajaxAll = function(urlList) {
        var urls = Array.isArray(urlList) ? urlList : [urlList];
        var results = [];
        for (var i = 0; i < urls.length; i++) results.push(j.ajax(urls[i]));
        return results;
    };

    j.ajaxTestAll = function(urlList, timeout) {
        return j.ajaxAll(urlList);
    };

    j.connect = function(urlStr, header, callTimeout) {
        var h = {};
        if (header && typeof header === 'string') {
            try { var parsed = JSON.parse(header.replace(/'/g, '"')); if (parsed) h = parsed; } catch(e) {}
        } else if (header && typeof header === 'object') {
            h = header;
        }
        var url = String(urlStr);
        if (Object.keys(h).length > 0) {
            var optionObj = { headers: h };
            url = url + ',' + JSON.stringify(optionObj);
        }
        var raw = Deno.core.ops.op_java_ajax(url);
        return makeResponse(raw, urlStr);
    };

    j.get = function(urlStr, headers, timeout) {
        if (arguments.length === 1 && !/^https?:\/\//i.test(String(urlStr))) {
            return Deno.core.ops.op_java_get("default", String(urlStr));
        }
        var h = headers || {};
        var url = String(urlStr);
        if (Object.keys(h).length > 0) {
            var optionObj = { headers: h };
            url = url + ',' + JSON.stringify(optionObj);
        }
        var raw = Deno.core.ops.op_java_ajax(url);
        return makeResponse(raw, urlStr);
    };

    j.post = function(urlStr, body, headers, timeout) {
        var h = headers || {};
        var bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        var optionObj = { method: "POST", body: bodyStr, headers: h };
        var url = String(urlStr) + ',' + JSON.stringify(optionObj);
        var raw = Deno.core.ops.op_java_ajax(url);
        return makeResponse(raw, urlStr);
    };

    j.head = function(urlStr, headers, timeout) {
        var h = headers || {};
        var optionObj = { method: "HEAD", headers: h };
        var url = String(urlStr) + ',' + JSON.stringify(optionObj);
        var raw = Deno.core.ops.op_java_ajax(url);
        return makeResponse(raw, urlStr);
    };

    j.webView = function(html, url, js) {
        return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML');
    };
    j.webViewGetSource = function(html, url, js, sourceRegex) {
        return j.webView(html, url, js);
    };
    j.webViewGetOverrideUrl = function(html, url, js, regex) {
        return j.webView(html, url, js);
    };
    j.webJsExecute = function(html, js) {
        return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML');
    };

    j.getCookie = function(tag, key) {
        return Deno.core.ops.op_java_get_cookie(String(tag), key ? String(key) : '');
    };
    j.setCookie = function(url, s) {
        Deno.core.ops.op_java_set_cookie(String(url), String(s));
    };
    j.putLoginHeader = function(h) { Deno.core.ops.op_java_put('default', 'loginHeader', String(h)); };
    j.getLoginHeader = function() { return Deno.core.ops.op_java_get('default', 'loginHeader'); };
    j.getLoginInfoMap = function() {
        var v = Deno.core.ops.op_java_get('default', 'loginHeader');
        if (!v) return {};
        try { return JSON.parse(v.replace(/^#/, '')); } catch(e) { return {}; }
    };
    j.putLoginInfo = function(i) { Deno.core.ops.op_java_put('default', 'loginHeader', '#' + i); };
    j.loadCookies = function() { Deno.core.ops.op_java_load_cookies(); };
    j.saveCookies = function() { Deno.core.ops.op_java_save_cookies(); };
    j.loginComplete = function(url, cookieStr) {
        return Deno.core.ops.op_java_login_complete(String(url), String(cookieStr));
    };

    globalThis.cookie = {
        getCookie: function(t, k) { return j.getCookie(t, k || ''); },
        getKey: function(t, k) { return j.getCookie(t, k); },
        setCookie: function(u, c) { j.setCookie(u, c); },
        removeCookie: function(u) { j.setCookie(u, ''); }
    };

    globalThis.JavaImporter = function() {
        var args = arguments;
        return {
            get: function(target, name) {
                for (var i = 0; i < args.length; i++) {
                    if (args[i][name] !== undefined) return args[i][name];
                }
                return undefined;
            }
        };
    };
})();
