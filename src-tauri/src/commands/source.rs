use crate::error::Result;
use crate::network::http::execute_http_request;
use crate::storage;
use serde_json::Value;
use std::time::Instant;
use tauri::Emitter;

const TEST_CONCURRENCY: usize = 5;

#[tauri::command]
pub async fn get_book_sources() -> Result<Value> {
    Ok(serde_json::Value::Array(storage::load_book_sources()?))
}

#[tauri::command]
pub async fn add_book_source(source_json: String) -> Result<String> {
    let new_items = parse_sources_json(&source_json)?;
    if new_items.is_empty() {
        return Err(crate::error::AbyssError::ParseError("未找到有效的书源数据".into()));
    }
    let mut existing = storage::load_book_sources()?;
    let mut added = 0;
    let mut updated = 0;

    for item in &new_items {
        let item_key = item.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
        if item_key.is_empty() {
            continue;
        }
        if let Some(existing_idx) = existing.iter().position(|e| {
            e.get("bookSourceUrl").and_then(|v| v.as_str()) == Some(item_key)
        }) {
            if !sources_equal(&existing[existing_idx], item) {
                existing[existing_idx] = item.clone();
                updated += 1;
            }
        } else {
            existing.push(item.clone());
            added += 1;
        }
    }

    storage::save_book_sources(&existing)?;

    let mut msg = String::new();
    if added > 0 {
        msg.push_str(&format!("新增 {} 个书源", added));
    }
    if updated > 0 {
        if !msg.is_empty() { msg.push_str("，"); }
        msg.push_str(&format!("更新 {} 个书源", updated));
    }
    if msg.is_empty() {
        msg.push_str("书源已是最新，无变化");
    }
    Ok(msg)
}

fn sources_equal(a: &Value, b: &Value) -> bool {
    match (a.as_object(), b.as_object()) {
        (Some(ao), Some(bo)) => {
            if ao.len() != bo.len() {
                return false;
            }
            for (key, av) in ao {
                match bo.get(key) {
                    Some(bv) => {
                        if !json_value_equal(av, bv) {
                            return false;
                        }
                    }
                    None => return false,
                }
            }
            true
        }
        _ => a == b,
    }
}

fn json_value_equal(a: &Value, b: &Value) -> bool {
    if a == b {
        return true;
    }
    let a_is_empty = a.is_null() || a.as_str().map(|s| s.is_empty()).unwrap_or(false);
    let b_is_empty = b.is_null() || b.as_str().map(|s| s.is_empty()).unwrap_or(false);
    a_is_empty && b_is_empty
}

#[tauri::command]
pub async fn import_sources_from_url(url: String) -> Result<String> {
    let body = execute_http_request(&url, "GET", None, None, Some("utf-8".into()), 30).await?;
    add_book_source(body).await
}

#[tauri::command]
pub async fn toggle_book_source(source_index: usize, enabled: bool) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() {
        return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string()));
    }
    if let Some(obj) = sources[source_index].as_object_mut() {
        obj.insert("enabled".into(), Value::Bool(enabled));
    }
    storage::save_book_sources(&sources)?;
    Ok(enabled)
}

#[tauri::command]
pub async fn delete_book_source(source_index: usize) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() {
        return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string()));
    }
    sources.remove(source_index);
    storage::save_book_sources(&sources)?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_failed_sources() -> Result<usize> {
    let sources = storage::load_book_sources()?;
    let mut keep = Vec::new();
    let mut removed = 0;

    for source in &sources {
        let test_url = source
            .get("bookSourceUrl")
            .or_else(|| source.get("url"))
            .or_else(|| source.get("searchUrl"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if test_url.is_empty() {
            removed += 1;
            continue;
        }
        match execute_http_request(test_url, "GET", None, None, None, 10).await {
            Ok(_) => keep.push(source.clone()),
            Err(_) => removed += 1,
        }
    }
    storage::save_book_sources(&keep)?;
    Ok(removed)
}

#[tauri::command]
pub async fn test_book_source(source_index: usize) -> Result<String> {
    let sources = storage::load_book_sources()?;
    let source = sources
        .get(source_index)
        .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;

    let test_url = source
        .get("bookSourceUrl")
        .or_else(|| source.get("url"))
        .or_else(|| source.get("searchUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if test_url.is_empty() {
        return Err(crate::error::AbyssError::ConfigError("URL 无效".into()));
    }

    let start = Instant::now();
    match execute_http_request(test_url, "GET", None, None, None, 10).await {
        Ok(html) => {
            let time_ms = start.elapsed().as_millis();
            let size_kb = (html.len() as f64 / 1024.0).round() as u64;
            let mut sources = storage::load_book_sources()?;
            if let Some(obj) = sources[source_index].as_object_mut() {
                obj.insert("respondTime".into(), Value::Number((time_ms as i64).into()));
            }
            storage::save_book_sources(&sources)?;
            Ok(format!("连接成功 · {}ms · {}KB", time_ms, size_kb))
        }
        Err(e) => {
            let mut sources = storage::load_book_sources()?;
            if let Some(obj) = sources[source_index].as_object_mut() {
                let comment = obj.get("bookSourceComment").and_then(|v| v.as_str()).unwrap_or("");
                let error_line = format!("// Error: {}", e);
                let new_comment = if comment.is_empty() {
                    error_line
                } else {
                    format!("{}\n\n{}", error_line, comment)
                };
                obj.insert("bookSourceComment".into(), Value::String(new_comment));
            }
            storage::save_book_sources(&sources)?;
            Err(crate::error::AbyssError::NetworkError(format!("连接失败: {}", e)))
        }
    }
}

#[tauri::command]
pub async fn test_all_sources(app: tauri::AppHandle) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?;
    let mut results = Vec::with_capacity(sources.len());
    let mut sources_to_update = sources.clone();

    use std::sync::Arc;
    // 修复：使用 tokio::sync::Semaphore 正确限流，permit 在任务完成前不释放
    let semaphore = Arc::new(tokio::sync::Semaphore::new(TEST_CONCURRENCY));
    let mut tasks = Vec::with_capacity(sources.len());

    for (i, source) in sources.iter().enumerate() {
        let test_url = source
            .get("bookSourceUrl")
            .or_else(|| source.get("url"))
            .or_else(|| source.get("searchUrl"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let app = app.clone();
        let sem = semaphore.clone();
        let source_clone = source.clone();

        tasks.push(tokio::spawn(async move {
            // 修复：permit 在整个任务执行期间持有，真正限制并发
            let _permit = sem.acquire().await;

            let start = Instant::now();
            let (status, error, time_ms, size_kb): (String, String, u128, usize) =
                if test_url.is_empty() {
                    ("fail".into(), "URL 无效".into(), 0, 0)
                } else {
                    match execute_http_request(&test_url, "GET", None, None, None, 10).await {
                        Ok(html) => {
                            let kb = (html.len() as f64 / 1024.0).round() as usize;
                            ("ok".into(), String::new(), start.elapsed().as_millis(), kb)
                        }
                        Err(e) => {
                            ("fail".into(), e.to_string(), 0, 0)
                        }
                    }
                };

            let result = serde_json::json!({
                "index": i,
                "name": source_clone.get("bookSourceName").or_else(|| source_clone.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
                "status": status,
                "time_ms": time_ms,
                "size_kb": size_kb,
                "error": error
            });
            let _ = app.emit("source-test-result", &result);
            (i, result, status)
        }));
    }

    for task in tasks {
        if let Ok((i, result, status)) = task.await {
            if status == "fail" {
                if let Some(obj) = sources_to_update[i].as_object_mut() {
                    let err_str = result.get("error").and_then(|v| v.as_str()).unwrap_or("");
                    let comment = obj.get("bookSourceComment").and_then(|v| v.as_str()).unwrap_or("");
                    let error_line = format!("// Error: {}", err_str);
                    let new_comment = if comment.is_empty() {
                        error_line
                    } else {
                        format!("{}\n\n{}", error_line, comment)
                    };
                    obj.insert("bookSourceComment".into(), Value::String(new_comment));
                }
            }
            results.push(result);
        }
    }

    results.sort_by_key(|r| r.get("index").and_then(|v| v.as_u64()).unwrap_or(0));

    storage::save_book_sources(&sources_to_update).ok();

    Ok(results)
}

#[tauri::command]
pub async fn clear_source_error_comment(source_index: usize) -> Result<String> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() {
        return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string()));
    }
    if let Some(obj) = sources[source_index].as_object_mut() {
        let comment = obj.get("bookSourceComment").and_then(|v| v.as_str()).unwrap_or("");
        let cleaned: String = comment
            .split("\n\n")
            .filter(|line| !line.starts_with("// Error: "))
            .collect::<Vec<_>>()
            .join("\n\n");
        obj.insert("bookSourceComment".into(), Value::String(cleaned));
    }
    storage::save_book_sources(&sources)?;
    Ok("已清理错误注释".into())
}

#[tauri::command]
pub async fn get_explore_categories(source_index: usize) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?;
    let source = sources
        .get(source_index)
        .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;

    let explore_url = source.get("exploreUrl").and_then(|v| v.as_str()).unwrap_or("");
    if explore_url.is_empty() {
        return Ok(vec![]);
    }
    if explore_url.trim().starts_with('[') {
        return Ok(serde_json::from_str(explore_url).unwrap_or_default());
    }
    if explore_url.contains("@js:") || explore_url.contains("<js>") {
        let js_code = prepare_js_code(explore_url);
        let ctx = serde_json::json!({
            "source": source,
            "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
        });
        match crate::js_runtime::runtime::execute(&js_code, &serde_json::to_string(&ctx).unwrap_or_default()) {
            Ok(result) => {
                let trimmed = result.trim();
                if let Ok(cats) = serde_json::from_str::<Vec<Value>>(trimmed) {
                    return Ok(cats);
                }
                if let Ok(obj) = serde_json::from_str::<serde_json::Map<String, Value>>(trimmed) {
                    if let Some(arr) = obj.get("categories").or_else(|| obj.get("data")).and_then(|v| v.as_array()) {
                        return Ok(arr.clone());
                    }
                }
                return Ok(vec![]);
            }
            Err(_e) => {
                return Ok(vec![]);
            }
        }
    }
    if explore_url.contains('\n') && explore_url.contains("::") {
        let cats: Vec<Value> = explore_url
            .split('\n')
            .filter(|l| l.contains("::"))
            .map(|l| {
                let p: Vec<&str> = l.splitn(2, "::").collect();
                serde_json::json!({"title": p[0].trim(), "url": p.get(1).unwrap_or(&"").trim()})
            })
            .collect();
        return Ok(cats);
    }
    if explore_url.contains("::") {
        let p: Vec<&str> = explore_url.splitn(2, "::").collect();
        if p.len() >= 2 {
            return Ok(vec![serde_json::json!({"title": p[0].trim(), "url": p[1].trim()})]);
        }
    }
    Ok(vec![])
}

fn prepare_js_code(code: &str) -> String {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return code.to_string();
    }
    let js = trimmed
        .strip_prefix("@js:")
        .unwrap_or(trimmed);
    let js = js
        .trim_start()
        .strip_prefix("<js>")
        .and_then(|s| s.strip_suffix("</js>"))
        .unwrap_or(js)
        .trim();

    if js.contains("return ") || js.contains("return(") || js.contains("\nreturn") {
        return js.to_string();
    }

    let lines: Vec<&str> = js.lines().collect();
    if lines.is_empty() {
        return js.to_string();
    }

    let mut last = lines.len();
    while last > 0 && lines[last - 1].trim().is_empty() {
        last -= 1;
    }
    if last == 0 {
        return js.to_string();
    }

    let decl = ["var ", "let ", "const ", "function ", "class ", "import ", "export "];
    let stmt = ["if ", "for ", "while ", "switch ", "try ", "throw ", "break ", "continue ", "debugger "];

    let mut expr_idx: Option<usize> = None;
    let mut i = last;
    while i > 0 {
        i -= 1;
        let line = lines[i].trim();
        if line.is_empty() { continue; }
        if !decl.iter().any(|k| line.starts_with(k)) && !stmt.iter().any(|k| line.starts_with(k)) {
            expr_idx = Some(i);
            break;
        }
    }

    match expr_idx {
        Some(idx) => {
            let mut result = String::new();
            for (j, line) in lines.iter().enumerate() {
                if j == idx {
                    result.push_str(&format!("return {};", line.trim().trim_end_matches(';').trim()));
                } else {
                    result.push_str(line);
                }
                if j < lines.len() - 1 {
                    result.push('\n');
                }
            }
            result
        }
        None => js.to_string(),
    }
}

fn parse_sources_json(json_str: &str) -> Result<Vec<Value>> {
    let data: Value = serde_json::from_str(json_str)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("JSON 解析失败: {}", e)))?;

    if data.get("bookSourceUrl").or_else(|| data.get("bookSourceName")).is_some() {
        return Ok(vec![data]);
    }
    if let Some(arr) = data.as_array() {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("sources").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("bookSources").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("list").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(inner) = data.get("data").and_then(|v| v.as_object()) {
        if let Some(arr) = inner.get("sources").and_then(|v| v.as_array()) {
            return Ok(arr.clone());
        }
        if let Some(arr) = inner.get("list").and_then(|v| v.as_array()) {
            return Ok(arr.clone());
        }
    }
    if let Some(obj) = data.as_object() {
        for (_, v) in obj {
            if let Some(arr) = v.as_array() {
                if let Some(f) = arr.first() {
                    if f.get("bookSourceUrl").or_else(|| f.get("bookSourceName")).is_some() {
                        return Ok(arr.clone());
                    }
                }
            }
        }
    }
    Ok(vec![])
}
