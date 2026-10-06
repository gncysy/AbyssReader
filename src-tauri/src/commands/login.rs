use crate::error::Result;
use crate::js_runtime::runtime;
use crate::commands::JsExecutionResponse;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoginJsContext {
    pub source: serde_json::Value,
    #[serde(default)]
    pub result: serde_json::Value,
    #[serde(default)]
    pub book: serde_json::Value,
    #[serde(default)]
    pub chapter: serde_json::Value,
    #[serde(default)]
    pub is_long_click: bool,
    #[serde(default)]
    pub base_url: String,
}

/// 把 runtime::execute 的结果转为 JsExecutionResponse。
/// 识别 wrap_user_code 返回的错误 JSON，避免污染上层。
fn to_response(result: std::result::Result<String, String>) -> JsExecutionResponse {
    match result {
        Ok(result) => {
            if let Some(err_msg) = runtime::extract_js_error(&result) {
                JsExecutionResponse {
                    success: false,
                    result: String::new(),
                    error: Some(err_msg),
                }
            } else {
                JsExecutionResponse {
                    success: true,
                    result,
                    error: None,
                }
            }
        }
        Err(e) => JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn execute_login_js(
    code: String,
    context: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<JsExecutionResponse> {
    let timeout_ms = timeout_ms.unwrap_or(60000);

    let source = context.get("source").cloned().unwrap_or(serde_json::Value::Null);
    let result = context.get("result").cloned().unwrap_or(serde_json::Value::Null);
    let book = context.get("book").cloned().unwrap_or(serde_json::Value::Null);
    let chapter = context.get("chapter").cloned().unwrap_or(serde_json::Value::Null);
    let is_long_click = context
        .get("isLongClick")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let base_url = context
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut sandbox_context = serde_json::json!({
        "source": source,
        "result": result,
        "book": book,
        "chapter": chapter,
        "isLongClick": is_long_click,
        "baseUrl": base_url,
    });

    let ua = crate::storage::store_get("userAgent").unwrap_or_default();
    let ua = if let Some(ref u) = ua {
        if u.is_empty() {
            crate::utils::DEFAULT_MOBILE_UA
        } else {
            u.as_str()
        }
    } else {
        crate::utils::DEFAULT_MOBILE_UA
    };
    crate::js_runtime::ops::set_global_ua(ua.to_string());
    if let Some(obj) = sandbox_context.as_object_mut() {
        obj.insert("userAgent".into(), serde_json::Value::String(ua.to_string()));
    }

    let context_json = serde_json::to_string(&sandbox_context).unwrap_or_else(|_| "{}".into());

    let timeout_result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        async { runtime::execute(&code, &context_json) },
    )
    .await;

    match timeout_result {
        Ok(inner) => Ok(to_response(inner)),
        Err(_) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(format!("登录 JS 执行超时（超过 {}ms）", timeout_ms)),
        }),
    }
}

#[tauri::command]
pub async fn source_login(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    if login_url.is_empty() {
        return Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some("书源未配置 loginUrl".into()),
        });
    }

    let code = login_url
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| login_url.trim_start().strip_prefix("<js>"))
        .unwrap_or(login_url)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(login_url)
        .trim()
        .to_string();

    let context = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());

    Ok(to_response(runtime::execute(&code, &context_json)))
}

#[tauri::command]
pub async fn source_login_ui(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");
    if login_ui.is_empty() {
        return Ok(JsExecutionResponse {
            success: false,
            result: "[]".into(),
            error: Some("书源未配置 loginUi".into()),
        });
    }

    let code = login_ui
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| login_ui.trim_start().strip_prefix("<js>"))
        .unwrap_or(login_ui)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(login_ui)
        .trim()
        .to_string();

    let context = serde_json::json!({
        "source": source,
        "book": {},
        "chapter": null,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());

    Ok(to_response(runtime::execute(&code, &context_json)))
}

#[tauri::command]
pub async fn source_login_action(source: serde_json::Value, action: String) -> Result<JsExecutionResponse> {
    let js_lib = source.get("jsLib").and_then(|v| v.as_str()).unwrap_or("");
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");

    let ctx = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });
    let ctx_json = serde_json::to_string(&ctx).unwrap_or_default();

    if !js_lib.is_empty() {
        let _ = runtime::execute(js_lib, "{}");
    }
    if !login_url.is_empty() && login_url.starts_with("@js:") {
        let code = login_url.replace("@js:", "").trim().to_string();
        let _ = runtime::execute(&code, &ctx_json);
    }
    if !login_ui.is_empty() && login_ui.starts_with("@js:") {
        let code = login_ui.replace("@js:", "").trim().to_string();
        let _ = runtime::execute(&code, &ctx_json);
    }

    let action_code = action
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| action.trim_start().strip_prefix("<js>"))
        .unwrap_or(&action)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(&action)
        .trim()
        .to_string();

    Ok(to_response(runtime::execute(&action_code, &ctx_json)))
}
