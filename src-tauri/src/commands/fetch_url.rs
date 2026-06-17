use crate::error::Result;
use reqwest::Client;
use std::collections::HashMap;

#[tauri::command]
pub async fn fetch_url(
    url: String,
    method: Option<String>,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    charset: Option<String>,
) -> Result<String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .build()?;

    let method = method.unwrap_or_else(|| "GET".to_string());
    let mut req_builder = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };

    req_builder = req_builder
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");

    if let Some(h) = &headers {
        for (k, v) in h {
            req_builder = req_builder.header(k, v);
        }
    }

    if let Some(b) = &body {
        req_builder = req_builder
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(b.clone());
    }

    let response = req_builder.send().await?;
    let bytes = response.bytes().await?;

    let content = if let Some(charset_name) = &charset {
        let encoding = encoding_rs::Encoding::for_label(charset_name.as_bytes())
            .unwrap_or(encoding_rs::UTF_8);
        let (decoded, _, _) = encoding.decode(&bytes);
        decoded.into_owned()
    } else {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        if preview.to_lowercase().contains("gbk") || preview.to_lowercase().contains("gb2312") {
            let encoding = encoding_rs::Encoding::for_label(b"gbk").unwrap_or(encoding_rs::UTF_8);
            let (decoded, _, _) = encoding.decode(&bytes);
            decoded.into_owned()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    Ok(content)
}
