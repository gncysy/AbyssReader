use crate::error::Result;
use crate::js_runtime::runtime;
use crate::commands::JsExecutionResponse;

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

    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse {
            success: true,
            result,
            error: None,
        }),
        Err(e) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        }),
    }
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

    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse {
            success: true,
            result,
            error: None,
        }),
        Err(e) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        }),
    }
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

    // 分别执行 jsLib、loginUrl JS、loginUi JS
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

    // 执行 action
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

    match runtime::execute(&action_code, &ctx_json) {
        Ok(result) => Ok(JsExecutionResponse {
            success: true,
            result,
            error: None,
        }),
        Err(e) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        }),
    }
}
