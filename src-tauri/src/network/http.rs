use crate::error::{AbyssError, Result};
use reqwest::{Client, Method};
use reqwest::cookie::Jar;
use encoding_rs::Encoding;
use std::collections::HashMap;
use std::sync::Arc;

static CLIENT_CACHE: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, Client>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

#[derive(Debug, Clone)]
pub struct RequestConfig {
    pub url: String,
    pub method: String,
    pub body: Option<String>,
    pub charset: Option<String>,
    pub headers: HashMap<String, String>,
    pub use_cookie_jar: bool,
}

impl Default for RequestConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            method: "GET".to_string(),
            body: None,
            charset: None,
            headers: HashMap::new(),
            use_cookie_jar: false,
        }
    }
}

pub fn parse_request_config(raw: &str) -> RequestConfig {
    let mut config = RequestConfig::default();

    if let Some(idx) = raw.find(",{") {
        let url_part = &raw[..idx];
        let config_str = &raw[idx + 1..];

        if config_str.trim().starts_with('{') {
            config.url = url_part.to_string();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(config_str) {
                if let Some(method) = json.get("method").and_then(|m| m.as_str()) {
                    config.method = method.to_uppercase();
                }
                if let Some(body) = json.get("body").and_then(|b| b.as_str()) {
                    config.body = Some(body.to_string());
                }
                if let Some(charset) = json.get("charset").and_then(|c| c.as_str()) {
                    config.charset = Some(charset.to_string());
                }
                if let Some(headers_obj) = json.get("headers").and_then(|h| h.as_object()) {
                    for (k, v) in headers_obj {
                        if let Some(val) = v.as_str() {
                            config.headers.insert(k.clone(), val.to_string());
                        }
                    }
                }
            }
            return config;
        }
    }

    config.url = raw.to_string();
    config
}

async fn get_client(config: &RequestConfig) -> Result<Client> {
    let domain = url::Url::parse(&config.url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| "default".to_string());

    let mut cache = CLIENT_CACHE.lock().await;
    if let Some(client) = cache.get(&domain) {
        return Ok(client.clone());
    }

    let mut builder = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true);

    if config.use_cookie_jar {
        let jar = Arc::new(Jar::default());
        builder = builder.cookie_provider(jar);
    }

    let client = builder.build()?;
    cache.insert(domain, client.clone());
    Ok(client)
}

pub async fn execute_request(config: &RequestConfig) -> Result<String> {
    let client = get_client(config).await?;

    let method = match config.method.as_str() {
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "DELETE" => Method::DELETE,
        _ => Method::GET,
    };

    let mut req_builder = client.request(method, &config.url);
    req_builder = req_builder.header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    req_builder = req_builder.header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");

    for (k, v) in &config.headers {
        req_builder = req_builder.header(k, v);
    }

    if let Some(body) = &config.body {
        req_builder = req_builder.header("Content-Type", "application/x-www-form-urlencoded");
        req_builder = req_builder.body(body.clone());
    }

    let response = req_builder.send().await?;
    let status = response.status();
    let bytes = response.bytes().await?;

    if !status.is_success() {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(500)]);
        return Err(AbyssError::NetworkError(format!(
            "HTTP {}: {}...", status.as_u16(), preview
        )));
    }

    let content = if let Some(charset_name) = &config.charset {
        let encoding = Encoding::for_label(charset_name.as_bytes()).unwrap_or(encoding_rs::UTF_8);
        let (decoded, _, _) = encoding.decode(&bytes);
        decoded.into_owned()
    } else {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        if preview.to_lowercase().contains("charset=gbk") || preview.to_lowercase().contains("charset=gb2312") {
            let encoding = Encoding::for_label(b"gbk").unwrap_or(encoding_rs::UTF_8);
            let (decoded, _, _) = encoding.decode(&bytes);
            decoded.into_owned()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    Ok(content)
}
