use crate::error::Result;
use crate::network::http::execute_http_request;
use std::fs;
use serde::Serialize;
use tauri::Manager;
use tauri::Emitter;
use tauri::WebviewWindowBuilder;
use tauri::WebviewUrl;
use std::time::Duration;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Serialize, Clone)]
struct DownloadInfo {
    url: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "fileSize")]
    file_size: usize,
    #[serde(rename = "resourceType")]
    resource_type: String,
    count: usize,
    #[serde(rename = "savedPath")]
    saved_path: Option<String>,
    error: Option<bool>,
    message: Option<String>,
}

fn get_downloads_dir() -> std::path::PathBuf {
    dirs_next::download_dir().unwrap_or_else(|| std::env::temp_dir().join("abyss_downloads"))
}

fn detect_resource_type(data: &str, url: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
        if parsed.get("bookSourceUrl").is_some() || parsed.get("bookSourceName").is_some() {
            return "bookSource".into();
        }
        if parsed.get("sourceUrl").is_some() && parsed.get("sourceName").is_some() {
            return "rssSource".into();
        }
        if parsed.get("isRegex").is_some() || (parsed.get("pattern").is_some() && parsed.get("replacement").is_some()) {
            return "replaceRule".into();
        }
        if parsed.get("chapterList").is_some() || parsed.get("chapterName").is_some() {
            return "txtTocRule".into();
        }
    }
    if url.ends_with(".txt") && !data.starts_with('{') && !data.starts_with('[') {
        return "purifyRule".into();
    }
    "unknown".into()
}

fn parse_json_count(data: &str) -> usize {
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(data) {
        return arr.len();
    }
    if serde_json::from_str::<serde_json::Value>(data).is_ok() {
        return 1;
    }
    0
}

async fn download_and_detect(url: &str) -> std::result::Result<DownloadInfo, String> {
    let data = execute_http_request(url, "GET", None, None, None, 30)
        .await
        .map_err(|e| format!("下载失败: {}", e))?;
    let bytes = data.into_bytes();
    let text = String::from_utf8_lossy(&bytes).to_string();
    // 修复：从 URL 中提取文件名（去除查询参数）
    let file_name = url
        .split('?')
        .next()
        .unwrap_or("download")
        .split('/')
        .last()
        .filter(|s| !s.is_empty())
        .unwrap_or("download")
        .to_string();
    let resource_type = detect_resource_type(&text, url);
    let count = if resource_type == "bookSource" || resource_type == "rssSource" {
        parse_json_count(&text)
    } else {
        0
    };
    let saved_path = if resource_type == "unknown" || url.ends_with(".zip") {
        let dir = get_downloads_dir();
        fs::create_dir_all(&dir).ok();
        let path = dir.join(&file_name);
        fs::write(&path, &bytes).ok();
        Some(path.to_string_lossy().to_string())
    } else {
        None
    };
    Ok(DownloadInfo {
        url: url.to_string(),
        file_name,
        file_size: bytes.len(),
        resource_type,
        count,
        saved_path,
        error: None,
        message: None,
    })
}

fn show_loading(window: &tauri::WebviewWindow) {
    let _ = window.eval(r#"(function(){var m=document.createElement('div');m.id='__rss_loading';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;color:#fff;font-size:16px;font-family:system-ui';m.innerHTML='<div style="text-align:center"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#d4a017;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div><div>正在下载...</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';document.body.appendChild(m);})()"#);
}

fn hide_loading(window: &tauri::WebviewWindow) {
    let _ = window.eval("(function(){var m=document.getElementById('__rss_loading');if(m)m.remove()})()");
}

// 修复：精确判断下载 URL
// 1. yuedu:// 协议
// 2. 文件扩展名匹配（排除带查询参数的普通网页）
// 3. Content-Disposition 由后端判断
fn is_download_url(url: &str) -> bool {
    if url.starts_with("yuedu://") {
        return true;
    }
    let path = url.split('?').next().unwrap_or(url).to_lowercase();
    path.ends_with(".json")
        || path.ends_with(".zip")
        || path.ends_with(".txt")
}

#[tauri::command]
pub async fn rss_open_url(app: tauri::AppHandle, url: String, title: String) -> Result<()> {
    let parsed_url = url::Url::parse(&url)
        .map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    let label = format!("rss_{}", uuid::Uuid::new_v4());
    let (pos_x, pos_y, win_w, win_h) =
        if let Some(main) = app.get_webview_window("main") {
            let p = main.outer_position().unwrap_or_default();
            let s = main.outer_size().unwrap_or_default();
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        } else {
            (0.0, 0.0, 1000.0, 700.0)
        };
    let w = (win_w * 0.9).max(600.0);
    let h = (win_h * 0.9).max(400.0);
    let x = pos_x + (win_w - w) / 2.0;
    let y = pos_y + (win_h - h) / 2.0;
    let app1 = app.clone();
    let lbl1 = label.clone();
    let app2 = app.clone();
    let lbl2 = label.clone();

    // 修复：使用 AtomicBool 跟踪窗口是否已关闭，线程在窗口关闭后自动退出
    let window_alive = Arc::new(AtomicBool::new(true));
    let window_alive_nav = window_alive.clone();
    let window_alive_new = window_alive.clone();
    let window_alive_nav_thread = window_alive.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url.clone()))
        .title(&title)
        .inner_size(w, h)
        .position(x.max(0.0), y.max(0.0))
        .decorations(false)
        .resizable(true)
        .visible(true)
        .focused(true)
        .initialization_script(
            r#"
            window.__ABYSS_CLOSE_WINDOW__ = function() {
                if (window.__TAURI_INTERNALS__) {
                    window.__TAURI_INTERNALS__.invoke('plugin:window|close');
                } else if (window.__TAURI__ && window.__TAURI__.window) {
                    window.__TAURI__.window.getCurrent().close();
                } else {
                    window.close();
                }
            };
        "#,
        )
        .on_navigation(move |nav_url| {
            let mut url_str = nav_url.as_str().to_string();
            if url_str.starts_with("yuedu://") {
                if let Some(pos) = url_str.find("src=") {
                    let raw = &url_str[pos + 4..];
                    url_str = urlencoding::decode(raw)
                        .unwrap_or_else(|_| raw.into())
                        .into_owned();
                } else {
                    return true;
                }
            }
            if is_download_url(&url_str) {
                let app = app1.clone();
                let lbl = lbl1.clone();
                let u = url_str.clone();
                let alive = window_alive_nav.clone();
                if let Some(win) = app1.get_webview_window(&lbl) {
                    show_loading(&win);
                }
                tauri::async_runtime::spawn(async move {
                    match download_and_detect(&u).await {
                        Ok(info) => {
                            if alive.load(Ordering::SeqCst) {
                                if let Some(w) = app.get_webview_window(&lbl) {
                                    hide_loading(&w);
                                }
                            }
                            let _ = app.emit_to(
                                "main",
                                "rss-download",
                                serde_json::json!({
                                    "url": info.url,
                                    "fileName": info.file_name,
                                    "fileSize": info.file_size,
                                    "resourceType": info.resource_type,
                                    "count": info.count,
                                    "savedPath": info.saved_path
                                }),
                            );
                        }
                        Err(e) => {
                            if alive.load(Ordering::SeqCst) {
                                if let Some(w) = app.get_webview_window(&lbl) {
                                    hide_loading(&w);
                                }
                            }
                            let _ = app.emit_to(
                                "main",
                                "rss-download",
                                serde_json::json!({ "error": true, "message": e }),
                            );
                        }
                    }
                });
                false
            } else {
                true
            }
        })
        .on_new_window(move |new_url, _| {
            let url_str = new_url.as_str().to_string();
            if is_download_url(&url_str) {
                let app = app2.clone();
                let lbl = lbl2.clone();
                let u = url_str.clone();
                let alive = window_alive_new.clone();
                if let Some(win) = app2.get_webview_window(&lbl) {
                    show_loading(&win);
                }
                tauri::async_runtime::spawn(async move {
                    match download_and_detect(&u).await {
                        Ok(info) => {
                            if alive.load(Ordering::SeqCst) {
                                if let Some(w) = app.get_webview_window(&lbl) {
                                    hide_loading(&w);
                                }
                            }
                            let _ = app.emit_to(
                                "main",
                                "rss-download",
                                serde_json::json!({
                                    "url": info.url,
                                    "fileName": info.file_name,
                                    "fileSize": info.file_size,
                                    "resourceType": info.resource_type,
                                    "count": info.count,
                                    "savedPath": info.saved_path
                                }),
                            );
                        }
                        Err(e) => {
                            if alive.load(Ordering::SeqCst) {
                                if let Some(w) = app.get_webview_window(&lbl) {
                                    hide_loading(&w);
                                }
                            }
                            let _ = app.emit_to(
                                "main",
                                "rss-download",
                                serde_json::json!({ "error": true, "message": e }),
                            );
                        }
                    }
                });
            } else {
                let a = app2.clone();
                let l = lbl2.clone();
                let escaped = url_str.replace('\\', "\\\\").replace('"', "\\\"");
                tauri::async_runtime::spawn(async move {
                    if let Some(w) = a.get_webview_window(&l) {
                        let _ = w.eval(&format!("window.location.href = \"{}\"", escaped));
                    }
                });
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;

    let nav_js = include_str!("rss_nav.js");
    let w = window.clone();
    let nav = nav_js.to_string();
    let alive_thread = window_alive_nav_thread.clone();

    // 修复：使用 tauri::async_runtime::spawn 替代 std::thread::spawn
    // 并检查窗口是否已关闭
    tauri::async_runtime::spawn(async move {
        for _ in 0..5 {
            if !alive_thread.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(2000)).await;
            if alive_thread.load(Ordering::SeqCst) {
                let _ = w.eval(&nav);
            }
        }
    });

    // 监听窗口关闭事件，设置 alive 标志
    let alive_close = window_alive.clone();
    let _ = window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            alive_close.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}
