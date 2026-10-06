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

// 复用全局 reqwest::Client
static IMAGE_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

const PREFETCH_CONCURRENCY: usize = 3;
const MIN_IMAGE_BYTES: usize = 100;

/// 统一下载函数，headers 为空则不附加。
/// 修复：合并原 download_image_bare / download_image 两个近乎重复的函数。
async fn download_image(
    url: &str,
    headers: &[(String, String)],
) -> std::result::Result<Vec<u8>, String> {
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

fn make_data_url(bytes: &[u8]) -> String {
    let ct = detect_image_type(bytes);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    format!("data:{};base64,{}", ct, b64)
}

fn make_cache_key(comic_id: &str, url: &str) -> String {
    format!("{}/{}", comic_id, crate::utils::md5_hex(url.as_bytes()))
}

#[tauri::command]
pub async fn comic_fetch_image(url: String, source_json: String, comic_id: String) -> Result<serde_json::Value> {
    let cache_key = make_cache_key(&comic_id, &url);

    // 检查缓存（两次，快速路径 + 等待锁后）
    if let Some(cached) = cache::cache_get(CacheCategory::Comic, &cache_key) {
        return Ok(serde_json::json!({ "url": url, "cached": true, "data": make_data_url(&cached) }));
    }

    let mtx: Arc<Mutex<()>> = {
        let mut map = DOWNLOAD_MUTEXES.lock().await;
        map.entry(url.clone())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = mtx.lock().await;

    if let Some(cached) = cache::cache_get(CacheCategory::Comic, &cache_key) {
        return Ok(serde_json::json!({ "url": url, "cached": true, "data": make_data_url(&cached) }));
    }

    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;

    // 三级降级：裸请求 → 精简 headers → 完整 headers
    let result = match download_image(&url, &[]).await {
        Ok(bytes) => {
            cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
            Ok(serde_json::json!({ "url": url, "cached": false, "data": make_data_url(&bytes) }))
        }
        Err(_) => {
            let headers_clean = build_headers(&source, false);
            match download_image(&url, &headers_clean).await {
                Ok(bytes) => {
                    cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
                    Ok(serde_json::json!({ "url": url, "cached": false, "data": make_data_url(&bytes) }))
                }
                Err(_) => {
                    let headers_full = build_headers(&source, true);
                    match download_image(&url, &headers_full).await {
                        Ok(bytes) => {
                            cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;
                            Ok(serde_json::json!({ "url": url, "cached": false, "data": make_data_url(&bytes) }))
                        }
                        Err(_) => {
                            // 全部失败 → 让前端直连
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

#[tauri::command]
pub async fn comic_prefetch_images(urls: Vec<String>, source_json: String, comic_id: String) -> Result<usize> {
    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;
    let headers = build_headers(&source, false);
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
            let cache_key = make_cache_key(&comic_id, &url);
            if cache::cache_get(CacheCategory::Comic, &cache_key).is_some() {
                return 1usize;
            }

            // 尝试裸请求 + 带 headers
            if let Ok(response) = client.get(&url).send().await {
                if let Ok(bytes) = response.bytes().await {
                    if bytes.len() >= MIN_IMAGE_BYTES {
                        if cache::cache_put(CacheCategory::Comic, &cache_key, &bytes).is_ok() {
                            return 1usize;
                        }
                    }
                }
            }

            let mut req = client.get(&url);
            for (k, v) in &headers {
                req = req.header(k.as_str(), v.as_str());
            }
            if let Ok(response) = req.send().await {
                if let Ok(bytes) = response.bytes().await {
                    if bytes.len() >= MIN_IMAGE_BYTES {
                        if cache::cache_put(CacheCategory::Comic, &cache_key, &bytes).is_ok() {
                            return 1usize;
                        }
                    }
                }
            }

            0usize
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
