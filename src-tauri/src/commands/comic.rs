use crate::error::Result;
use crate::storage::cache::{self, CacheCategory};
use crate::network::headers::build_headers;
use crate::utils::detect_image_type;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::LazyLock;
use tokio::sync::Mutex;

static DOWNLOAD_MUTEXES: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// 修复：复用全局 reqwest::Client，避免每次请求都创建新 Client
static IMAGE_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

const PREFETCH_CONCURRENCY: usize = 3;
const MIN_IMAGE_BYTES: usize = 100;

#[tauri::command]
pub async fn comic_fetch_image(url: String, source_json: String, comic_id: String) -> Result<serde_json::Value> {
    let cache_key = format!("{}/{}", comic_id, format!("{:x}", md5::compute(url.as_bytes())));

    if let Some(cached) = cache::cache_get(CacheCategory::Comic, &cache_key) {
        let ct = detect_image_type(&cached);
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &cached);
        return Ok(serde_json::json!({ "url": url, "cached": true, "data": format!("data:{};base64,{}", ct, b64) }));
    }

    let mtx: Arc<Mutex<()>> = {
        let mut map = DOWNLOAD_MUTEXES.lock().await;
        map.entry(url.clone())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = mtx.lock().await;

    if let Some(cached) = cache::cache_get(CacheCategory::Comic, &cache_key) {
        let ct = detect_image_type(&cached);
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &cached);
        return Ok(serde_json::json!({ "url": url, "cached": true, "data": format!("data:{};base64,{}", ct, b64) }));
    }

    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;

    let result = match download_image_bare(&url).await {
        Ok(bytes) => {
            let img_type = detect_image_type(&bytes);
            cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
            Ok(serde_json::json!({ "url": url, "cached": false, "data": format!("data:{};base64,{}", img_type, b64) }))
        }
        Err(_e1) => {
            let headers_clean = build_headers(&source, false);
            match download_image(&url, &headers_clean).await {
                Ok(bytes) => {
                    let img_type = detect_image_type(&bytes);
                    cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
                    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
                    Ok(serde_json::json!({ "url": url, "cached": false, "data": format!("data:{};base64,{}", img_type, b64) }))
                }
                Err(_e2) => {
                    let headers_full = build_headers(&source, true);
                    match download_image(&url, &headers_full).await {
                        Ok(bytes) => {
                            let img_type = detect_image_type(&bytes);
                            cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
                            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
                            Ok(serde_json::json!({ "url": url, "cached": false, "data": format!("data:{};base64,{}", img_type, b64) }))
                        }
                        Err(_e3) => {
                            Ok(serde_json::json!({ "url": url, "cached": false, "direct": true, "src": url }))
                        }
                    }
                }
            }
        }
    };

    drop(_guard);
    {
        let mut map = DOWNLOAD_MUTEXES.lock().await;
        map.remove(&url);
    }
    result
}

async fn download_image_bare(url: &str) -> std::result::Result<Vec<u8>, String> {
    // 修复：复用全局 Client
    let response = IMAGE_CLIENT.get(url).send().await.map_err(|e| format!("request: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("read: {}", e))?;
    if bytes.len() < MIN_IMAGE_BYTES {
        return Err(format!("too small: {} bytes", bytes.len()));
    }
    Ok(bytes.to_vec())
}

async fn download_image(url: &str, headers: &[(String, String)]) -> std::result::Result<Vec<u8>, String> {
    // 修复：复用全局 Client
    let mut req = IMAGE_CLIENT.get(url);
    for (k, v) in headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let response = req.send().await.map_err(|e| format!("request: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("read: {}", e))?;
    if bytes.len() < MIN_IMAGE_BYTES {
        return Err(format!("too small: {} bytes", bytes.len()));
    }
    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn comic_prefetch_images(urls: Vec<String>, source_json: String, comic_id: String) -> Result<usize> {
    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;
    let headers = build_headers(&source, false);
    // 修复：复用全局 Client
    let client = IMAGE_CLIENT.clone();

    let mut count = 0;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(PREFETCH_CONCURRENCY));

    let mut tasks = Vec::new();
    for url in urls {
        let client = client.clone();
        let headers = headers.clone();
        let comic_id = comic_id.clone();
        let semaphore = semaphore.clone();

        tasks.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await;
            let cache_key = format!("{}/{}", comic_id, format!("{:x}", md5::compute(url.as_bytes())));
            if cache::cache_get(CacheCategory::Comic, &cache_key).is_some() {
                return 1usize;
            }

            let mut success = false;
            if let Ok(response) = client.get(&url).send().await {
                if let Ok(bytes) = response.bytes().await {
                    if bytes.len() >= MIN_IMAGE_BYTES {
                        if cache::cache_put(CacheCategory::Comic, &cache_key, &bytes).is_ok() {
                            success = true;
                        }
                    }
                }
            }

            if !success {
                let mut req = client.get(&url);
                for (k, v) in &headers {
                    req = req.header(k.as_str(), v.as_str());
                }
                if let Ok(response) = req.send().await {
                    if let Ok(bytes) = response.bytes().await {
                        if bytes.len() >= MIN_IMAGE_BYTES {
                            if cache::cache_put(CacheCategory::Comic, &cache_key, &bytes).is_ok() {
                                success = true;
                            }
                        }
                    }
                }
            }

            if success { 1usize } else { 0usize }
        }));
    }

    for task in tasks {
        if let Ok(c) = task.await {
            count += c;
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn comic_clear_cache(comic_id: String) -> Result<usize> {
    let dir = cache::get_category_dir(CacheCategory::Comic);
    let prefix = format!("{}/", comic_id);
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with(&prefix) {
                    std::fs::remove_file(entry.path()).ok();
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}
