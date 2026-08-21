use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::WebviewWindowBuilder;

const IDLE_TIMEOUT_SECS: u64 = 300;

static PERSISTENT_WEBVIEW: OnceLock<Arc<Mutex<Option<tauri::WebviewWindow>>>> = OnceLock::new();
static LAST_USED: OnceLock<Arc<Mutex<Instant>>> = OnceLock::new();

fn get_last_used_slot() -> Arc<Mutex<Instant>> {
    LAST_USED.get_or_init(|| Arc::new(Mutex::new(Instant::now()))).clone()
}

fn touch_last_used() {
    let slot = get_last_used_slot();
    // 使用裸 lock()（std::sync::Mutex 的 lock 返回 Result，但我们直接使用 unwrap_or_else）
    let mut guard = match slot.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    *guard = Instant::now();
}

pub fn cleanup_idle_webview() {
    let slot = get_last_used_slot();
    let last_used = {
        let guard = match slot.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        *guard
    };
    if last_used.elapsed().as_secs() > IDLE_TIMEOUT_SECS {
        close_persistent_webview();
    }
}

pub fn get_persistent_slot() -> Arc<Mutex<Option<tauri::WebviewWindow>>> {
    PERSISTENT_WEBVIEW.get_or_init(|| Arc::new(Mutex::new(None))).clone()
}

pub fn get_or_create_persistent_webview(
    app: &tauri::AppHandle,
    initial_url: tauri::WebviewUrl,
) -> Result<tauri::WebviewWindow, String> {
    let slot = get_persistent_slot();
    let mut guard = match slot.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(existing) = guard.as_ref() {
        touch_last_used();
        return Ok(existing.clone());
    }

    let label = format!("webview_persistent_{}", uuid::Uuid::new_v4());
    let window = WebviewWindowBuilder::new(app, &label, initial_url)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .title("")
        .user_agent(crate::utils::DEFAULT_UA)
        .build()
        .map_err(|e| e.to_string())?;

    crate::js_runtime::ops::emit_log("info", &format!("[webview-manager] 创建持久 WebView: {}", label));
    *guard = Some(window.clone());
    touch_last_used();
    Ok(window)
}

pub fn close_persistent_webview() {
    let slot = get_persistent_slot();
    let mut guard = match slot.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(window) = guard.take() {
        crate::js_runtime::ops::emit_log("info", "[webview-manager] 清理持久 WebView");
        let _ = window.close();
    }
}

pub fn navigate_persistent_webview(window: &tauri::WebviewWindow, url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    window.navigate(parsed).map_err(|e| e.to_string())
}

pub fn eval_persistent_webview(window: &tauri::WebviewWindow, js: &str) -> Result<(), String> {
    window.eval(js).map_err(|e| e.to_string())
}
