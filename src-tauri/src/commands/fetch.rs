use crate::error::Result;
use crate::network::http::execute_http_request;
use std::collections::HashMap;

const DEFAULT_TIMEOUT_SECS: u64 = 30;

#[tauri::command]
pub async fn fetch_url(
    url: String,
    method: Option<String>,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    charset: Option<String>,
    use_webview: Option<bool>,
    web_js: Option<String>,
    timeout_secs: Option<u64>,
    source_type: Option<i32>,
    preserve_style: Option<bool>,
    _body_js: Option<String>,
) -> Result<String> {
    let method_str = method.unwrap_or_else(|| "GET".into());
    let timeout = timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);

    if use_webview == Some(true) {
        let app = crate::js_runtime::ops::get_app_handle()
            .ok_or_else(|| crate::error::AbyssError::WebViewError("AppHandle 未初始化".into()))?;
        return crate::commands::webview::fetch_webview(
            app,
            url,
            Some(method_str),
            body,
            headers,
            charset,
            Some(true),
            web_js,
            Some(timeout),
            source_type,
            preserve_style,
        )
        .await;
    }

    execute_http_request(&url, &method_str, headers, body, charset, timeout).await
}

#[tauri::command]
pub async fn download_binary(
    url: String,
    headers: Option<HashMap<String, String>>,
) -> Result<String> {
    use base64::Engine;
    use reqwest::Client;

    let client = Client::builder()
        .user_agent(crate::utils::DEFAULT_UA)
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let mut req = client.get(&url);
    if let Some(h) = headers {
        for (k, v) in h {
            req = req.header(k, v);
        }
    }

    let response = req
        .send()
        .await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn proxy_image(url: String, source_json: String) -> Result<String> {
    use base64::Engine;
    use reqwest::Client;
    use crate::storage::cache::{self, CacheCategory};
    use crate::utils::detect_image_type;
    use crate::network::headers::build_headers;

    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(e.to_string()))?;

    let cache_key = format!("{:x}", md5::compute(url.as_bytes()));

    if let Some(data) = cache::cache_get(CacheCategory::Image, &cache_key) {
        let ct = detect_image_type(&data);
        return Ok(format!(
            "data:{};base64,{}",
            ct,
            base64::engine::general_purpose::STANDARD.encode(&data)
        ));
    }

    let client = Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let mut req = client.get(&url);
    let headers = build_headers(&source, false);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let response = req
        .send()
        .await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/webp")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    cache::cache_put(CacheCategory::Image, &cache_key, &bytes)?;

    Ok(format!(
        "data:{};base64,{}",
        content_type,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}
