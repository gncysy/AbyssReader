use std::collections::HashMap;
use serde_json::Value;

/// 从 source 中解析 header 字段。
/// 修复：header 可能是字符串（JSON 编码）或对象，两种都要支持。
fn parse_header_value(header_val: &Value) -> HashMap<String, String> {
    let mut result = HashMap::new();

    // 情况 1：header 是对象
    if let Some(obj) = header_val.as_object() {
        for (k, v) in obj {
            if !v.is_null() {
                result.insert(k.clone(), value_to_string(v));
            }
        }
        return result;
    }

    // 情况 2：header 是字符串
    if let Some(s) = header_val.as_str() {
        let trimmed = s.trim();
        // 2.1 @js: / <js> 前缀，由调用方单独处理
        if trimmed.starts_with("@js:") || trimmed.starts_with("<js>") {
            return result;
        }
        // 2.2 尝试 JSON 解析
        if let Ok(h) = serde_json::from_str::<HashMap<String, Value>>(trimmed) {
            for (k, v) in h {
                if !v.is_null() {
                    result.insert(k, value_to_string(&v));
                }
            }
            return result;
        }
        // 2.3 尝试单引号 JSON
        let fixed = trimmed.replace('\'', "\"");
        if let Ok(h) = serde_json::from_str::<HashMap<String, Value>>(&fixed) {
            for (k, v) in h {
                if !v.is_null() {
                    result.insert(k, value_to_string(&v));
                }
            }
        }
    }

    result
}

fn value_to_string(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        s.to_string()
    } else if let Some(n) = v.as_i64() {
        n.to_string()
    } else if let Some(n) = v.as_f64() {
        n.to_string()
    } else if let Some(b) = v.as_bool() {
        b.to_string()
    } else {
        v.to_string()
    }
}

pub fn build_headers(source: &Value, include_x_requested: bool) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    let book_source_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");

    if let Some(header_val) = source.get("header") {
        // 处理 @js: / <js> 字符串
        if let Some(s) = header_val.as_str() {
            let trimmed = s.trim();
            if trimmed.starts_with("@js:") || trimmed.starts_with("<js>") {
                if let Some(parsed) = evaluate_js_header(trimmed, book_source_url) {
                    for (k, v) in parsed {
                        if !include_x_requested && k.eq_ignore_ascii_case("x-requested-with") {
                            continue;
                        }
                        headers.push((k, v));
                    }
                }
                // 继续追加默认 headers
                if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("User-Agent")) {
                    headers.push(("User-Agent".into(), crate::utils::DEFAULT_MOBILE_UA.into()));
                }
                if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Referer")) && !book_source_url.is_empty() {
                    headers.push(("Referer".into(), book_source_url.to_string()));
                }
                if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Accept")) {
                    headers.push(("Accept".into(), "image/avif,image/webp,image/apng,image/*,*/*;q=0.8".into()));
                }
                return headers;
            }
        }

        // 解析 header（对象或字符串）
        let parsed = parse_header_value(header_val);
        for (k, v) in parsed {
            if !include_x_requested && k.eq_ignore_ascii_case("x-requested-with") {
                continue;
            }
            headers.push((k, v));
        }
    }

    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("User-Agent")) {
        headers.push(("User-Agent".into(), crate::utils::DEFAULT_MOBILE_UA.into()));
    }
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Referer")) {
        if !book_source_url.is_empty() {
            headers.push(("Referer".into(), book_source_url.to_string()));
        }
    }
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Accept")) {
        headers.push(("Accept".into(), "image/avif,image/webp,image/apng,image/*,*/*;q=0.8".into()));
    }
    headers
}

pub fn evaluate_js_header(header_str: &str, book_source_url: &str) -> Option<Vec<(String, String)>> {
    use crate::js_runtime::runtime;

    let code = header_str
        .trim()
        .strip_prefix("@js:")
        .or_else(|| header_str.trim().strip_prefix("<js>"))
        .unwrap_or(header_str)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(header_str)
        .trim()
        .to_string();

    let base_url_json = serde_json::to_string(book_source_url).unwrap_or_else(|_| "\"\"".into());
    let source_url_json = serde_json::to_string(book_source_url).unwrap_or_else(|_| "\"\"".into());

    let wrapped = format!(
        "var baseUrl = {}; var result = ''; var source = {{ bookSourceUrl: {} }}; {}",
        base_url_json, source_url_json, code
    );

    match runtime::execute(&wrapped, "{}") {
        Ok(result) => {
            let trimmed = result.trim();
            if trimmed.is_empty() {
                return None;
            }
            if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(trimmed) {
                return Some(h.into_iter().collect());
            }
            None
        }
        Err(_) => None,
    }
}
