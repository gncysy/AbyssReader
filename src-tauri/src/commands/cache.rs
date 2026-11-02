use crate::error::Result;
use crate::storage::cache::{self, CacheCategory, cache_stats};
use crate::storage::db;
use crate::utils::{format_size, detect_image_type};
use serde_json::json;

#[tauri::command]
pub async fn cache_get_info() -> Result<serde_json::Value> {
    let stats = cache_stats();
    Ok(json!({
        "path": stats.path,
        "totalSize": stats.total_size,
        "totalSizeFormatted": format_size(stats.total_size),
        "totalFiles": stats.total_files,
        "maxTotalBytes": stats.max_total_bytes,
        "maxTotalFormatted": format_size(stats.max_total_bytes),
        "categories": stats.categories.iter().map(|c| json!({
            "name": c.name,
            "key": c.key,
            "size": c.size,
            "sizeFormatted": format_size(c.size),
            "count": c.count
        })).collect::<Vec<_>>()
    }))
}

#[tauri::command]
pub async fn cache_clear() -> Result<serde_json::Value> {
    let count = cache::cache_clear_all()?;
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_clear_category(category: String) -> Result<serde_json::Value> {
    let cat = match category.as_str() {
        "covers" | "cover" => CacheCategory::Cover,
        "toc" => CacheCategory::Toc,
        "content" | "contents" => CacheCategory::Content,
        "comic" | "comics" => CacheCategory::Comic,
        "image_cache" | "images" | "image" => CacheCategory::Image,
        "lib_cache" | "libs" | "lib" => CacheCategory::Lib,
        _ => return Err(crate::error::AbyssError::ConfigError(format!("未知缓存分类: {}", category))),
    };
    let count = cache::cache_clear_category(cat)?;
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_get_cover(url: String) -> Result<Option<String>> {
    use base64::Engine;
    if let Some(data) = cache::cache_get(CacheCategory::Cover, &url) {
        let ct = detect_image_type(&data);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
        Ok(Some(format!("data:{};base64,{}", ct, b64)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn cache_put_cover(url: String, data_base64: String) -> Result<String> {
    use base64::Engine;
    // 流式解码：移除 data URL 前缀后直接解码
    let clean = if let Some(idx) = data_base64.find(";base64,") {
        data_base64[idx + 8..].to_string()
    } else {
        data_base64
    };
    let data = base64::engine::general_purpose::STANDARD
        .decode(&clean)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("base64 解码失败: {}", e)))?;
    cache::cache_put(CacheCategory::Cover, &url, &data)?;
    Ok(url)
}

#[tauri::command]
pub async fn cache_put_covers(items: Vec<serde_json::Value>) -> Result<usize> {
    use base64::Engine;
    let mut count = 0;
    for item in &items {
        let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let data_str = item.get("data").and_then(|v| v.as_str()).unwrap_or("");
        if url.is_empty() || data_str.is_empty() { continue; }
        let clean = if let Some(idx) = data_str.find(";base64,") {
            data_str[idx + 8..].to_string()
        } else {
            data_str.to_string()
        };
        if let Ok(data) = base64::engine::general_purpose::STANDARD.decode(&clean) {
            if cache::cache_put(CacheCategory::Cover, url, &data).is_ok() { count += 1; }
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn cache_put_toc(book_url: String, data_json: String) -> Result<String> {
    cache::cache_put(CacheCategory::Toc, &book_url, data_json.as_bytes())?;
    Ok(book_url)
}

#[tauri::command]
pub async fn cache_get_toc(book_url: String) -> Result<Option<String>> {
    if let Some(data) = cache::cache_get(CacheCategory::Toc, &book_url) {
        Ok(String::from_utf8(data).ok())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn cache_put_content(book_url: String, data_json: String) -> Result<String> {
    cache::cache_put(CacheCategory::Content, &book_url, data_json.as_bytes())?;
    Ok(book_url)
}

#[tauri::command]
pub async fn cache_get_content(book_url: String) -> Result<Option<String>> {
    if let Some(data) = cache::cache_get(CacheCategory::Content, &book_url) {
        Ok(String::from_utf8(data).ok())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn cache_delete_content(book_url: String) -> Result<()> {
    cache::cache_delete(CacheCategory::Content, &book_url)?;
    Ok(())
}

#[tauri::command]
pub async fn cache_has_cover(url: String) -> Result<bool> {
    Ok(cache::cache_exists(CacheCategory::Cover, &url, 7 * 24 * 3600))
}

#[tauri::command]
pub async fn cache_set_max_size(max_mb: u64) -> Result<serde_json::Value> {
    let max_bytes = max_mb * 1024 * 1024;
    db::store_set("cacheConfig", &json!({ "maxTotalBytes": max_bytes }).to_string())?;
    Ok(json!({ "maxTotalBytes": max_bytes, "maxTotalFormatted": format_size(max_bytes) }))
}

#[tauri::command]
pub async fn cache_migrate(new_path: String) -> Result<serde_json::Value> {
    let new_dir = std::path::PathBuf::from(&new_path);
    cache::set_cache_dir(&new_dir)?;
    Ok(json!({ "path": new_dir.to_string_lossy() }))
}
