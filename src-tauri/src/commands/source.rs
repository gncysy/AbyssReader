use crate::error::Result;
use crate::storage::BookSource;
use crate::network::http::{parse_request_config, execute_request};
use serde_json::Value;
use serde::Serialize;
use tauri::{State, Emitter};
use crate::commands::AppState;   // 改为 commands::AppState
use crate::storage::db;

#[derive(Serialize, Clone)]
pub struct BookSourceInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub search_url: String,
    pub enabled: bool,
    pub group: Option<String>,
    pub comment: Option<String>,
    pub weight: i32,
    pub header: Option<String>,
    pub enabled_cookie_jar: bool,
    pub js_lib: Option<String>,
    pub login_url: Option<String>,
    pub login_ui: Option<String>,
    pub respond_time: i64,
    pub last_update_time: i64,
    pub book_url_pattern: Option<String>,
}

impl From<&BookSource> for BookSourceInfo {
    fn from(source: &BookSource) -> Self {
        BookSourceInfo {
            id: source.id.clone(),
            name: source.name.clone(),
            url: source.url.clone(),
            search_url: source.search_url.clone(),
            enabled: source.enabled,
            group: source.group.clone(),
            comment: source.comment.clone(),
            weight: source.weight,
            header: source.header.clone(),
            enabled_cookie_jar: source.enabled_cookie_jar,
            js_lib: source.js_lib.clone(),
            login_url: source.login_url.clone(),
            login_ui: source.login_ui.clone(),
            respond_time: source.respond_time,
            last_update_time: source.last_update_time,
            book_url_pattern: source.book_url_pattern.clone(),
        }
    }
}

#[tauri::command]
pub async fn get_book_sources(state: State<'_, AppState>) -> Result<Vec<BookSourceInfo>> {
    let sources = state.sources.lock().await;
    Ok(sources.iter().map(|s| s.into()).collect())
}

fn import_single_source(sources: &mut Vec<BookSource>, json: &Value) -> Result<String> {
    let id = json.get("bookSourceUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let name = json.get("bookSourceName")
        .and_then(|v| v.as_str())
        .unwrap_or("未命名书源")
        .to_string();

    let source = BookSource {
        id: id.clone(),
        name: name.clone(),
        url: json.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        search_url: json.get("searchUrl").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        rule_search: json.get("ruleSearch").cloned().unwrap_or(Value::Null),
        rule_book_info: json.get("ruleBookInfo").cloned().unwrap_or(Value::Null),
        rule_toc: json.get("ruleToc").cloned().unwrap_or(Value::Null),
        rule_content: json.get("ruleContent").cloned().unwrap_or(Value::Null),
        enabled: json.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
        explore_url: json.get("exploreUrl").and_then(|v| v.as_str()).map(|s| s.to_string()),
        rule_explore: json.get("ruleExplore").cloned().unwrap_or(Value::Null),
        group: json.get("bookSourceGroup").and_then(|v| v.as_str()).map(|s| s.to_string()),
        comment: json.get("bookSourceComment").and_then(|v| v.as_str()).map(|s| s.to_string()),
        weight: json.get("weight").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        header: json.get("header").and_then(|v| v.as_str()).map(|s| s.to_string()),
        enabled_cookie_jar: json.get("enabledCookieJar").and_then(|v| v.as_bool()).unwrap_or(false),
        js_lib: json.get("jsLib").and_then(|v| v.as_str()).map(|s| s.to_string()),
        login_url: json.get("loginUrl").and_then(|v| v.as_str()).map(|s| s.to_string()),
        login_ui: json.get("loginUi").and_then(|v| v.as_str()).map(|s| s.to_string()),
        respond_time: json.get("respondTime").and_then(|v| v.as_i64()).unwrap_or(0),
        last_update_time: json.get("lastUpdateTime").and_then(|v| v.as_i64()).unwrap_or(0),
        book_url_pattern: json.get("bookUrlPattern").and_then(|v| v.as_str()).map(|s| s.to_string()),
    };

    sources.retain(|s| s.id != id);
    sources.push(source.clone());
    db::save_book_source_to_db(&source)?;
    Ok(name)
}

fn import_from_json_str(sources: &mut Vec<BookSource>, json_str: &str) -> Result<Vec<String>> {
    let parsed: Value = serde_json::from_str(json_str)?;
    let mut names = Vec::new();
    if let Some(arr) = parsed.as_array() {
        for item in arr {
            names.push(import_single_source(sources, item)?);
        }
    } else {
        names.push(import_single_source(sources, &parsed)?);
    }
    Ok(names)
}

#[tauri::command]
pub async fn add_book_source(state: State<'_, AppState>, source_json: String) -> Result<String> {
    let mut sources = state.sources.lock().await;
    let names = import_from_json_str(&mut sources, &source_json)?;
    Ok(format!("成功导入 {} 个书源", names.len()))
}

#[tauri::command]
pub async fn import_sources_from_url(state: State<'_, AppState>, url: String) -> Result<String> {
    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let body = client.get(&url).send().await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?
        .text().await
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let mut sources = state.sources.lock().await;
    let names = import_from_json_str(&mut sources, &body)?;
    Ok(format!("从 URL 成功导入 {} 个书源", names.len()))
}

#[tauri::command]
pub async fn upload_local_source(state: State<'_, AppState>, file_path: String) -> Result<String> {
    let content = tokio::fs::read_to_string(&file_path).await
        .map_err(|e| crate::error::AbyssError::IoError(e.to_string()))?;
    let mut sources = state.sources.lock().await;
    let names = import_from_json_str(&mut sources, &content)?;
    Ok(format!("成功导入 {} 个书源", names.len()))
}

#[tauri::command]
pub async fn delete_book_source(state: State<'_, AppState>, source_id: String) -> Result<()> {
    let mut sources = state.sources.lock().await;
    sources.retain(|s| s.id != source_id);
    db::delete_book_source_from_db(&source_id)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_book_sources(state: State<'_, AppState>, source_ids: Vec<String>) -> Result<usize> {
    let mut sources = state.sources.lock().await;
    let before = sources.len();
    sources.retain(|s| !source_ids.contains(&s.id));
    for id in &source_ids {
        let _ = db::delete_book_source_from_db(id);
    }
    Ok(before - sources.len())
}

#[tauri::command]
pub async fn toggle_book_source(state: State<'_, AppState>, source_id: String, enabled: bool) -> Result<()> {
    let mut sources = state.sources.lock().await;
    if let Some(source) = sources.iter_mut().find(|s| s.id == source_id) {
        source.enabled = enabled;
        db::save_book_source_to_db(source)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn test_book_source(state: State<'_, AppState>, source_id: String) -> Result<String> {
    let source = {
        let sources = state.sources.lock().await;
        sources.iter().find(|s| s.id == source_id)
            .cloned()
            .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_id.clone()))?
    };
    let start = std::time::Instant::now();
    let config = parse_request_config(&source.url);
    match execute_request(&config).await {
        Ok(html) => {
            let elapsed = start.elapsed().as_millis();
            Ok(format!("连接成功 · {}ms · {}KB", elapsed, html.len() / 1024))
        }
        Err(e) => Err(crate::error::AbyssError::NetworkError(format!("连接失败: {}", e)))
    }
}

#[tauri::command]
pub async fn test_all_sources(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>> {
    let sources = {
        let locked = state.sources.lock().await;
        locked.clone()
    };

    let mut results = Vec::new();
    for source in &sources {
        let id = source.id.clone();
        let name = source.name.clone();
        let url = source.url.clone();

        let start = std::time::Instant::now();
        let config = parse_request_config(&url);
        let (status, error, time_ms, size_kb) = match execute_request(&config).await {
            Ok(html) => ("ok".to_string(), String::new(), start.elapsed().as_millis(), html.len() / 1024),
            Err(e) => ("fail".to_string(), e.to_string(), 0, 0),
        };

        let result = serde_json::json!({
            "id": id,
            "name": name,
            "status": status,
            "time_ms": time_ms,
            "size_kb": size_kb,
            "error": error
        });

        let _ = app.emit("source-test-result", &result);
        results.push(result);
    }
    Ok(results)
}

#[tauri::command]
pub async fn delete_failed_sources(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<usize> {
    let sources = {
        let locked = state.sources.lock().await;
        locked.clone()
    };

    let mut failed_ids = Vec::new();
    let total = sources.len();
    let mut tested = 0;

    for source in &sources {
        let id = source.id.clone();
        let url = source.url.clone();
        let config = parse_request_config(&url);
        let failed = match execute_request(&config).await {
            Ok(_) => false,
            Err(_) => {
                failed_ids.push(id.clone());
                true
            }
        };
        tested += 1;
        let _ = app.emit("delete-failed-progress", serde_json::json!({
            "tested": tested,
            "total": total,
            "failed_count": failed_ids.len(),
            "current_id": id,
            "status": if failed { "fail" } else { "ok" }
        }));
    }

    let mut sources = state.sources.lock().await;
    let before = sources.len();
    sources.retain(|s| !failed_ids.contains(&s.id));
    for id in &failed_ids {
        let _ = db::delete_book_source_from_db(id);
    }
    let deleted = before - sources.len();
    let _ = app.emit("delete-failed-complete", serde_json::json!({
        "deleted": deleted,
        "failed_count": failed_ids.len()
    }));
    Ok(deleted)
}

#[tauri::command]
pub async fn get_explore_categories(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<Vec<serde_json::Value>> {
    let source = {
        let sources = state.sources.lock().await;
        sources.iter().find(|s| s.id == source_id)
            .cloned()
            .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_id.clone()))?
    };

    let explore_url = source.explore_url.unwrap_or_default();
    if explore_url.is_empty() {
        return Ok(vec![]);
    }

    let categories = if explore_url.starts_with('[') {
        serde_json::from_str::<Vec<Value>>(&explore_url).unwrap_or_default()
    } else if explore_url.contains('\n') {
        explore_url
            .split('\n')
            .filter(|line| line.contains("::"))
            .map(|line| {
                let parts: Vec<&str> = line.splitn(2, "::").collect();
                serde_json::json!({
                    "title": parts[0].trim(),
                    "url": parts.get(1).unwrap_or(&"").trim()
                })
            })
            .collect()
    } else {
        vec![]
    };

    Ok(categories)
}
