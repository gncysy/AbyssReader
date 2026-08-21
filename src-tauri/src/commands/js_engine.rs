use crate::error::Result;
use crate::js_runtime::runtime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsExecutionResponse {
    pub success: bool,
    pub result: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn execute_js_rule(
    code: String,
    context: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<JsExecutionResponse> {
    let code = preprocess_code(&code);
    let mut context = context;
    let timeout_ms = timeout_ms.unwrap_or(30000);

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
    if let Some(obj) = context.as_object_mut() {
        obj.insert("userAgent".into(), serde_json::Value::String(ua.to_string()));
    }
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());

    // 使用 tokio::time::timeout 实现真正的超时控制
    let timeout_result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        async {
            runtime::execute(&code, &context_json)
        },
    ).await;

    match timeout_result {
        Ok(Ok(result)) => Ok(JsExecutionResponse { success: true, result, error: None }),
        Ok(Err(e)) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(e) }),
        Err(_) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(format!("JS 执行超时（超过 {}ms）", timeout_ms)),
        }),
    }
}

fn preprocess_code(code: &str) -> String {
    let trimmed = code.trim_start();
    let without_prefix = trimmed
        .strip_prefix("@js:")
        .or_else(|| trimmed.strip_prefix("<js>"))
        .unwrap_or(trimmed);
    without_prefix
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(without_prefix)
        .trim()
        .to_string()
}

fn parse_legado_url(url_str: &str) -> (String, Option<serde_json::Value>, String, Option<String>) {
    let mut clean_url = url_str.to_string();
    let mut headers = None;
    let mut method = "GET".to_string();
    let mut body = None;

    if let Some(brace_idx) = url_str.rfind(",{") {
        let json_part = &url_str[brace_idx + 1..];
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
            if let Some(h) = json.get("headers").cloned() {
                headers = Some(h);
            }
            if let Some(m) = json.get("method").and_then(|v| v.as_str()) {
                method = m.to_uppercase();
            }
            if let Some(b) = json.get("body") {
                if b.is_string() {
                    body = b.as_str().map(|s| s.to_string());
                } else {
                    body = Some(b.to_string());
                }
            }
            clean_url = url_str[..brace_idx].to_string();
        }
    }

    (clean_url, headers, method, body)
}

#[tauri::command]
pub async fn dict_query(
    url_rule: String,
    show_rule: String,
    key: String,
    timeout_secs: Option<u64>,
) -> Result<JsExecutionResponse> {
    let timeout = timeout_secs.unwrap_or(20);

    let url_result = if url_rule.starts_with("@js:") || url_rule.starts_with("<js>") {
        let js_code = preprocess_code(&url_rule);
        let ctx = serde_json::json!({ "result": "", "key": key, "baseUrl": "", "source": {}, "book": {} });
        let ctx_json = serde_json::to_string(&ctx).unwrap_or_default();
        match runtime::execute(&js_code, &ctx_json) {
            Ok(result) => result.trim().to_string(),
            Err(e) => return Ok(JsExecutionResponse {
                success: false,
                result: String::new(),
                error: Some(format!("urlRule 执行失败: {}", e)),
            }),
        }
    } else {
        url_rule.replace("{{key}}", &urlencoding::encode(&key))
    };

    if url_result.is_empty() || url_result == "undefined" || url_result == "null" {
        return Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some("urlRule 返回空".into()),
        });
    }

    let (clean_url, headers_json, method, body) = parse_legado_url(&url_result);

    let headers_map: std::collections::HashMap<String, String> =
        if let Some(h) = headers_json {
            if let Ok(map) = serde_json::from_value::<std::collections::HashMap<String, String>>(h) {
                map
            } else {
                std::collections::HashMap::new()
            }
        } else {
            std::collections::HashMap::new()
        };

    let html = if clean_url.starts_with("data:") {
        parse_data_url(&clean_url).unwrap_or_default()
    } else if clean_url.starts_with("http://") || clean_url.starts_with("https://") {
        match crate::network::http::execute_http_request(
            &clean_url, &method, Some(headers_map), body, None, timeout,
        ).await {
            Ok(body) => body,
            Err(e) => return Ok(JsExecutionResponse {
                success: false,
                result: String::new(),
                error: Some(format!("HTTP 请求失败: {}", e)),
            }),
        }
    } else {
        clean_url.clone()
    };

    if html.is_empty() {
        return Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some("HTML 为空".into()),
        });
    }

    let has_js = show_rule.contains("@js:") || show_rule.contains("<js>");
    if has_js {
        if let Some(js_code) = extract_js_from_show_rule(&show_rule) {
            let ctx = serde_json::json!({
                "result": html,
                "key": key,
                "baseUrl": clean_url,
                "source": {},
                "book": {}
            });
            let ctx_json = serde_json::to_string(&ctx).unwrap_or_default();
            match runtime::execute(&js_code, &ctx_json) {
                Ok(result) => return Ok(JsExecutionResponse { success: true, result, error: None }),
                Err(e) => return Ok(JsExecutionResponse {
                    success: false,
                    result: String::new(),
                    error: Some(format!("showRule JS 执行失败: {}", e)),
                }),
            }
        }
    }

    use scraper::{Html, Selector};
    let doc = Html::parse_document(&html);
    let parts: Vec<&str> = show_rule.split('@').collect();
    let css = if parts.len() > 1 {
        parts[0].replace("tag.", "").replace("class.", ".")
    } else {
        show_rule.replace("tag.", "").replace("class.", ".")
    };
    let attr = if parts.len() > 1 { parts[1].trim() } else { "html" };

    if css.is_empty() || css == "body" {
        if attr == "html" || attr == "all" || attr == "outerHTML" {
            Ok(JsExecutionResponse { success: true, result: html, error: None })
        } else {
            let text = doc.root_element().text().collect::<Vec<_>>().join("\n");
            Ok(JsExecutionResponse { success: true, result: text, error: None })
        }
    } else {
        match Selector::parse(&css) {
            Ok(sel) => {
                let results: Vec<String> = doc.select(&sel).map(|el| match attr {
                    "html" | "all" | "outerHTML" => el.html(),
                    "text" => el.text().collect::<Vec<_>>().join("\n"),
                    "innerHTML" => el.inner_html(),
                    _ => el.value().attr(attr).unwrap_or("").to_string(),
                }).collect();
                Ok(JsExecutionResponse { success: true, result: results.join("\n"), error: None })
            }
            Err(e) => Ok(JsExecutionResponse {
                success: false,
                result: String::new(),
                error: Some(format!("CSS 选择器无效: {}", e)),
            }),
        }
    }
}

fn extract_js_from_show_rule(show_rule: &str) -> Option<String> {
    if let Some(js_start) = show_rule.find("@js:") {
        let after = &show_rule[js_start + 4..];
        let trimmed = after.trim_start();
        if let Some(js_end) = trimmed.find("</js>") {
            return Some(trimmed[..js_end].trim().to_string());
        }
        return Some(trimmed.to_string());
    }
    if let Some(js_start) = show_rule.find("<js>") {
        let after = &show_rule[js_start + 4..];
        if let Some(js_end) = after.find("</js>") {
            return Some(after[..js_end].trim().to_string());
        }
        return Some(after.trim().to_string());
    }
    None
}

fn parse_data_url(data_url: &str) -> Option<String> {
    use base64::Engine;
    if data_url.starts_with("data:;base64,") {
        let after_prefix = &data_url["data:;base64,".len()..];
        if let Some(comma_pos) = after_prefix.find(',') {
            let base64_part = &after_prefix[..comma_pos];
            match base64::engine::general_purpose::STANDARD.decode(base64_part) {
                Ok(bytes) => Some(String::from_utf8_lossy(&bytes).to_string()),
                Err(_) => None,
            }
        } else {
            match base64::engine::general_purpose::STANDARD.decode(after_prefix) {
                Ok(bytes) => Some(String::from_utf8_lossy(&bytes).to_string()),
                Err(_) => None,
            }
        }
    } else if data_url.starts_with("data:") {
        if let Some(base64_start) = data_url.find(";base64,") {
            let base64_part = &data_url[base64_start + 8..];
            match base64::engine::general_purpose::STANDARD.decode(base64_part) {
                Ok(bytes) => Some(String::from_utf8_lossy(&bytes).to_string()),
                Err(_) => None,
            }
        } else {
            data_url.find(',').map(|p| data_url[p + 1..].to_string())
        }
    } else {
        None
    }
}
