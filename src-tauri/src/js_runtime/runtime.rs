use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions, v8};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Mutex;
use serde_json::Value;

use crate::js_runtime::ops::dom::handle::{next_exec_id, ExecutionGuard};

const POLYFILL_CORE: &str = include_str!("polyfills/core.js");
const POLYFILL_NET: &str = include_str!("polyfills/net.js");
const POLYFILL_JSONPATH: &str = include_str!("polyfills/jsonpath.js");
const POLYFILL_DOM: &str = include_str!("polyfills/dom.js");
const POLYFILL_BIGINT: &str = include_str!("polyfills/bigint.js");
const POLYFILL_SM3: &str = include_str!("polyfills/sm3.js");
const POLYFILL_PACKAGES: &str = include_str!("polyfills/packages.js");

const MAX_JS_LIBS: usize = 50;

static LEAKED_SCRIPT_NAMES: Mutex<Option<HashMap<String, &'static str>>> = Mutex::new(None);

thread_local! {
    static RUNTIME_SLOT: RefCell<Option<JsRuntime>> = RefCell::new(None);
}

fn get_or_create_runtime() -> JsRuntime {
    RUNTIME_SLOT.with(|slot| {
        let mut s = slot.borrow_mut();
        s.take().unwrap_or_else(create_fresh_runtime)
    })
}

fn return_runtime(rt: JsRuntime) {
    RUNTIME_SLOT.with(|slot| {
        let mut s = slot.borrow_mut();
        *s = Some(rt);
    })
}

fn discard_runtime() {
    RUNTIME_SLOT.with(|slot| {
        *slot.borrow_mut() = None;
    })
}

pub fn create_fresh_runtime() -> JsRuntime {
    let mut rt = JsRuntime::new(RuntimeOptions {
        extensions: vec![super::ops::abyss_java::init()],
        ..Default::default()
    });

    rt.execute_script("polyfill_core.js", POLYFILL_CORE)
        .expect("polyfill_core.js 加载失败");
    rt.execute_script("polyfill_net.js", POLYFILL_NET)
        .expect("polyfill_net.js 加载失败");
    rt.execute_script("polyfill_jsonpath.js", POLYFILL_JSONPATH)
        .expect("polyfill_jsonpath.js 加载失败");
    rt.execute_script("polyfill_dom.js", POLYFILL_DOM)
        .expect("polyfill_dom.js 加载失败");
    rt.execute_script("polyfill_bigint.js", POLYFILL_BIGINT)
        .expect("polyfill_bigint.js 加载失败");
    rt.execute_script("polyfill_sm3.js", POLYFILL_SM3)
        .expect("polyfill_sm3.js 加载失败");
    rt.execute_script("polyfill_packages.js", POLYFILL_PACKAGES)
        .expect("polyfill_packages.js 加载失败");

    super::ops::load_cookies_from_file();
    rt
}

fn get_static_script_name(name: &str) -> &'static str {
    let mut guard = LEAKED_SCRIPT_NAMES.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    if let Some(existing) = map.get(name) {
        return existing;
    }
    let leaked: &'static str = Box::leak(name.to_string().into_boxed_str());
    map.insert(name.to_string(), leaked);
    leaked
}

fn load_js_libs(rt: &mut JsRuntime, source: &Value) -> Result<(), String> {
    if let Some(js_lib_str) = source.get("jsLib").and_then(|v| v.as_str()) {
        let trimmed = js_lib_str.trim();
        if trimmed.is_empty() {
            return Ok(());
        }

        let parsed_map: Option<HashMap<String, String>> =
            serde_json::from_str(trimmed).ok();

        let is_url_map = parsed_map
            .as_ref()
            .map(|m| {
                !m.is_empty()
                    && m.values().all(|v| {
                        v.starts_with("http://") || v.starts_with("https://")
                    })
            })
            .unwrap_or(false);

        if is_url_map {
            let libs = parsed_map.unwrap();
            if libs.len() > MAX_JS_LIBS {
                eprintln!("[jsLib] 过多 JS 库: {}，跳过", libs.len());
                return Ok(());
            }
            for (name, url) in libs {
                let cache_key = crate::utils::md5_hex(url.as_bytes());
                let cache_path = crate::storage::cache::get_category_dir(
                    crate::storage::cache::CacheCategory::Lib
                )
                .join(&cache_key);

                let content = if cache_path.exists() {
                    std::fs::read_to_string(&cache_path).unwrap_or_default()
                } else {
                    match crate::network::http::execute_http_request_blocking(
                        &url, "GET", None, None, None, 30,
                    ) {
                        Ok(data) => {
                            let _ = std::fs::write(&cache_path, &data);
                            data
                        }
                        Err(e) => {
                            eprintln!("[jsLib] 下载失败 {}: {}", url, e);
                            continue;
                        }
                    }
                };

                if !content.is_empty() {
                    let script_name = format!("jslib_{}.js", name);
                    let static_name = get_static_script_name(&script_name);
                    let wrapped = wrap_js_lib(&content);
                    if let Err(e) = rt.execute_script(static_name, wrapped) {
                        eprintln!("[jsLib] 执行失败 {}: {}", name, e);
                    }
                }
            }
        } else {
            let script_name = format!("jslib_inline_{}", crate::utils::md5_hex(trimmed.as_bytes()));
            let static_name = get_static_script_name(&script_name);
            let wrapped = wrap_js_lib(trimmed);
            match rt.execute_script(static_name, wrapped) {
                Ok(_) => {
                    eprintln!("[jsLib] 内联 JS 执行成功 ({} 字符)", trimmed.len());
                }
                Err(e) => {
                    eprintln!("[jsLib] 内联 JS 执行失败: {}", e);
                }
            }
        }
    }
    Ok(())
}

fn wrap_js_lib(code: &str) -> String {
    let mut result = String::with_capacity(code.len() + 64);
    result.push_str("(function(){\n");
    for line in code.lines() {
        let trimmed_start = line.trim_start();
        let leading_ws_len = line.len() - trimmed_start.len();
        let leading = &line[..leading_ws_len];

        if trimmed_start.starts_with("const ") {
            result.push_str(leading);
            result.push_str("var ");
            result.push_str(&trimmed_start["const ".len()..]);
        } else if trimmed_start.starts_with("let ") {
            result.push_str(leading);
            result.push_str("var ");
            result.push_str(&trimmed_start["let ".len()..]);
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }
    result.push_str("\n})();\n");
    result
}

pub fn execute_in_runtime(
    rt: &mut JsRuntime,
    code: &str,
    context_json: &serde_json::Value,
) -> Result<String, String> {
    execute_impl(rt, code, &serde_json::to_string(context_json).unwrap_or_else(|_| "{}".into()))
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut rt = get_or_create_runtime();

        if let Ok(ctx) = serde_json::from_str::<serde_json::Value>(context_json) {
            if let Some(source) = ctx.get("source") {
                let _ = load_js_libs(&mut rt, source);
            }
        }

        match execute_impl(&mut rt, code, context_json) {
            Ok(result) => {
                return_runtime(rt);
                Ok(result)
            }
            Err(e) => {
                return_runtime(rt);
                Err(e)
            }
        }
    }));

    match result {
        Ok(inner) => inner,
        Err(_panic) => {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                discard_runtime();
            }));
            Err("沙箱执行崩溃，已重建".to_string())
        }
    }
}

pub fn extract_js_error(result: &str) -> Option<String> {
    let trimmed = result.trim();
    if !trimmed.starts_with("{\"__error\":true") {
        return None;
    }
    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(v) => {
            let msg = v
                .get("__message")
                .and_then(|m| m.as_str())
                .unwrap_or("JS 执行错误");
            Some(msg.to_string())
        }
        Err(_) => Some("JS 执行错误".to_string()),
    }
}

/// 将用户代码包装在 IIFE 中。
///
/// DOM 对象（Element / Elements）通过 __abyss_is_dom_object 检测，
/// 走 toString() 路径返回 outerHtml 字符串，而不是 JSON.stringify。
fn wrap_user_code(code: &str) -> String {
    let code_json = serde_json::to_string(code).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"
(function() {{
    var __execResult;
    try {{
        __execResult = (0, eval)({code_json});
    }} catch (e) {{
        try {{
            return JSON.stringify({{
                __error: true,
                __message: e && e.message ? e.message : String(e),
                __stack: (e && e.stack ? e.stack : '').substring(0, 2000)
            }});
        }} catch (e2) {{
            return '{{"__error":true,"__message":"' + String(e && e.message ? e.message : e).replace(/"/g, '\\"') + '"}}';
        }}
    }}
    if (__execResult && typeof __execResult.then === 'function') {{
        __execResult = undefined;
    }}
    if (__execResult === null || __execResult === undefined) {{
        return undefined;
    }}
    if (Array.isArray(__execResult)) {{
        try {{
            return JSON.stringify(__execResult);
        }} catch (e) {{
            return undefined;
        }}
    }}
    if (typeof __execResult === 'object') {{
        // DOM 对象优先：走 toString() 得到 outerHtml
        if (typeof globalThis.__abyss_is_dom_object === 'function'
            && globalThis.__abyss_is_dom_object(__execResult)) {{
            try {{
                return String(__execResult);
            }} catch (e) {{
                return undefined;
            }}
        }}
        try {{
            return JSON.stringify(__execResult);
        }} catch (e) {{
            return undefined;
        }}
    }}
    return __execResult;
}})()
"#,
        code_json = code_json
    )
}

fn safe_truncate(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect::<String>()
}

fn execute_impl(rt: &mut JsRuntime, code: &str, context_json: &str) -> Result<String, String> {
    // RAII guard：进入作用域设置 CURRENT_EXEC_ID，退出时释放该 execution 的所有 DOM 句柄。
    let _exec_guard = ExecutionGuard::new(next_exec_id());

    let sanitized_context = context_json
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");

    let inject = format!("globalThis.__sandbox_data = {};", sanitized_context);

    if let Err(e) = rt.execute_script("inject_context", inject) {
        return Err(format!("注入上下文失败: {}", e));
    }

    let setup_wrapper = r#"
(function() {
    var D = globalThis.__sandbox_data || {};

    globalThis.result = D.result || '';
    globalThis.src = D.src || globalThis.result;
    globalThis.source = D.source || {};
    globalThis.baseUrl = D.baseUrl || globalThis.source.bookSourceUrl || globalThis.source.key || '';
    globalThis.key = D.key || '';
    globalThis.page = D.page || 1;
    globalThis.book = D.book || {};
    globalThis.chapter = D.chapter || {};
    globalThis.title = D.title || globalThis.chapter.title || '';
    globalThis.nextChapterUrl = D.nextChapterUrl || '';
    globalThis.isLongClick = D.isLongClick || false;

    var source = globalThis.source;
    var _sourceUrl = source.bookSourceUrl || source.key || '';
    if (typeof source.key === 'undefined' || source.key === null || source.key === '') {
        source.key = _sourceUrl;
    }
    if (typeof source.getKey !== 'function') {
        source.getKey = function() { return _sourceUrl; };
    }
    if (typeof source.getTag !== 'function') {
        source.getTag = function() { return source.bookSourceName || source.sourceName || source.name || ''; };
    }
    if (typeof source.getSource !== 'function') {
        source.getSource = function() { return source; };
    }
    if (typeof source.put !== 'function') {
        source.put = function(k, v) { return java.put('source_' + _sourceUrl + '_' + String(k), String(v)); };
    }
    if (typeof source.get !== 'function') {
        source.get = function(k) { return java.get('source_' + _sourceUrl + '_' + String(k)); };
    }
    if (typeof source.setVariable !== 'function') {
        source.setVariable = function(v) { return java.put('source_' + _sourceUrl + '__variable', String(v)); };
    }
    if (typeof source.getVariable !== 'function') {
        source.getVariable = function(k) {
            if (k === undefined) {
                return java.get('source_' + _sourceUrl + '__variable');
            }
            return java.get('source_' + _sourceUrl + '_' + String(k));
        };
    }
    if (typeof source.putVariable !== 'function') {
        source.putVariable = function(k, v) { return java.put('source_' + _sourceUrl + '_' + String(k), String(v)); };
    }
    if (typeof source.removeVariable !== 'function') {
        source.removeVariable = function(k) { return java.remove('source_' + _sourceUrl + '_' + String(k)); };
    }
    if (typeof source.getLoginHeader !== 'function') {
        source.getLoginHeader = function() { return java.get('loginHeader_' + _sourceUrl); };
    }
    if (typeof source.putLoginHeader !== 'function') {
        source.putLoginHeader = function(h) { return java.put('loginHeader_' + _sourceUrl, String(h)); };
    }
    if (typeof source.removeLoginHeader !== 'function') {
        source.removeLoginHeader = function() { return java.remove('loginHeader_' + _sourceUrl); };
    }
    if (typeof source.getLoginInfo !== 'function') {
        source.getLoginInfo = function() { return java.get('userInfo_' + _sourceUrl); };
    }
    if (typeof source.putLoginInfo !== 'function') {
        source.putLoginInfo = function(i) { return java.put('userInfo_' + _sourceUrl, String(i)); };
    }
    if (typeof source.removeLoginInfo !== 'function') {
        source.removeLoginInfo = function() { return java.remove('userInfo_' + _sourceUrl); };
    }
    if (typeof source.getLoginInfoMap !== 'function') {
        source.getLoginInfoMap = function() {
            var v = java.get('userInfo_' + _sourceUrl);
            if (!v) return {};
            try { return JSON.parse(v.replace(/^#/, '')); } catch(e) { return {}; }
        };
    }
    if (typeof source.putConcurrent !== 'function') {
        source.putConcurrent = function(v) { return java.put('concurrent_' + _sourceUrl, String(v)); };
    }

    var book = globalThis.book;
    var _bookUrl = book.bookUrl || '';
    if (typeof book.setReverseToc !== 'function') {
        book.setReverseToc = function(v) { java.put('book_' + _bookUrl + '__reverseToc', v ? '1' : '0'); };
    }
    if (typeof book.putVariable !== 'function') {
        book.putVariable = function(k, v) { java.put('book_' + _bookUrl + '__' + k, String(v)); };
    }
    if (typeof book.getVariable !== 'function') {
        book.getVariable = function(k) { return java.get('book_' + _bookUrl + '__' + k); };
    }

    try {
        if (typeof globalThis.__loadJsLib === 'function') {
            globalThis.__loadJsLib(source, globalThis.java);
        }
    } catch (e) {}

    if (typeof D.ruleName === 'string' && D.ruleName.length > 0
        && typeof globalThis.__createRegexJsExtensions === 'function') {
        globalThis.java = globalThis.__createRegexJsExtensions(D.ruleName);
    }
})();
"#;

    if let Err(e) = rt.execute_script("setup_vars", setup_wrapper) {
        return Err(format!("变量设置失败: {}", e));
    }

    let wrapped_code = wrap_user_code(code);

    match rt.execute_script("user_code", wrapped_code) {
        Ok(global) => {
            let context_global = rt.main_context();
            let scope_storage = v8::HandleScope::new(rt.v8_isolate());
            let scope = std::pin::pin!(scope_storage);
            let mut scope = scope.init();
            let context_local = v8::Local::new(&mut scope, context_global);
            let mut context_scope = v8::ContextScope::new(&mut scope, context_local);
            let local = v8::Local::new(&mut context_scope, &global);

            if let Some(s) = local.to_string(&context_scope) {
                let result_str = s.to_rust_string_lossy(&context_scope);

                if result_str == "[object Promise]" {
                    return Ok(String::new());
                }

                if result_str.starts_with("{\"__error\":true") {
                    let diag_msg = format!("DIAG|error|{}", result_str);
                    crate::js_runtime::ops::emit_log("error", &diag_msg);
                }

                let diag_msg = format!(
                    "DIAG|final|{}",
                    serde_json::json!({
                        "t": "",
                        "u": "",
                        "r": 0,
                        "o": result_str.len(),
                        "p": safe_truncate(&result_str, 200),
                        "a": -1
                    })
                );
                crate::js_runtime::ops::emit_log("info", &diag_msg);

                return Ok(result_str);
            }
            Ok(String::new())
        }
        Err(e) => {
            Err(format!("执行失败: {}", e))
        }
    }
}
