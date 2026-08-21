use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions, v8};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Mutex;
use serde_json::Value;

const POLYFILL_CORE: &str = include_str!("polyfills/core.js");
const POLYFILL_NET: &str = include_str!("polyfills/net.js");
const POLYFILL_DOM: &str = include_str!("polyfills/dom.js");

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
    });
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
    rt.execute_script("polyfill_dom.js", POLYFILL_DOM)
        .expect("polyfill_dom.js 加载失败");

    super::ops::load_cookies_from_file();
    rt
}

/// 获取 'static 生命周期的脚本名。
/// 同名脚本只泄漏一次，泄漏总量受 MAX_JS_LIBS 限制。
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
        if let Ok(libs) = serde_json::from_str::<std::collections::HashMap<String, String>>(js_lib_str) {
            if libs.len() > MAX_JS_LIBS {
                eprintln!("[jsLib] 过多 JS 库: {}，跳过", libs.len());
                return Ok(());
            }
            for (name, url) in libs {
                let cache_key = format!("{:x}", md5::compute(url.as_bytes()));
                let cache_path = crate::storage::cache::get_category_dir(
                    crate::storage::cache::CacheCategory::Lib
                )
                .join(&cache_key);

                let content = if cache_path.exists() {
                    match std::fs::read_to_string(&cache_path) {
                        Ok(data) => data,
                        Err(e) => {
                            eprintln!("[jsLib] 读取缓存失败 {}: {}", url, e);
                            continue;
                        }
                    }
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
                    if let Err(e) = rt.execute_script(static_name, content) {
                        eprintln!("[jsLib] 执行失败 {}: {}", name, e);
                    }
                }
            }
        }
    }
    Ok(())
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

/// 将用户代码包装在 IIFE 中。
/// 使用 eval 获取 completion value（最后一个表达式的值），
/// 对齐 Legado Rhino 引擎行为——支持 if 块内最后表达式、多语句等。
fn wrap_user_code(code: &str) -> String {
    let code_json = serde_json::to_string(code).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"
(function() {{
    var __execResult;
    try {{
        __execResult = eval({code_json});
    }} catch (e) {{
        return {{
            __error: true,
            __message: e.message || String(e),
            __stack: (e.stack || '').substring(0, 2000)
        }};
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
    let sanitized_context = context_json
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");

    let inject = format!("globalThis.__sandbox_data = {};", sanitized_context);

    if let Err(e) = rt.execute_script("inject_context", inject) {
        return Err(format!("注入上下文失败: {}", e));
    }

    let setup_wrapper = r#"
var D = globalThis.__sandbox_data || {};
var result = D.result || '';
var src = D.src || result;
var source = D.source || {};
var baseUrl = D.baseUrl || source.bookSourceUrl || source.key || '';
var key = D.key || '';
var page = D.page || 1;
var book = D.book || {};
var chapter = D.chapter || {};
var title = D.title || chapter.title || '';
var nextChapterUrl = D.nextChapterUrl || '';

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
if (typeof source.getLoginHeader !== 'function') {
    source.getLoginHeader = function() { return java.get('loginHeader_' + _sourceUrl); };
}
if (typeof source.putLoginHeader !== 'function') {
    source.putLoginHeader = function(h) { return java.put('loginHeader_' + _sourceUrl, String(h)); };
}
if (typeof source.getLoginInfo !== 'function') {
    source.getLoginInfo = function() { return java.get('userInfo_' + _sourceUrl); };
}
if (typeof source.putLoginInfo !== 'function') {
    source.putLoginInfo = function(i) { return java.put('userInfo_' + _sourceUrl, String(i)); };
}
if (typeof source.putConcurrent !== 'function') {
    source.putConcurrent = function(v) { return java.put('concurrent_' + _sourceUrl, String(v)); };
}

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
