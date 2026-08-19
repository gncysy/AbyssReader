pub mod ajax;
pub mod crypto;
pub mod dom;
pub mod io;
pub mod storage;
pub mod webview_manager;

pub use ajax::*;
pub use crypto::*;
pub use dom::*;
pub use io::*;
pub use storage::*;
pub use webview_manager::*;

use std::sync::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Emitter;

pub static APP_HANDLE: RwLock<Option<tauri::AppHandle>> = RwLock::new(None);
pub static MAIN_WINDOW: RwLock<Option<tauri::WebviewWindow>> = RwLock::new(None);
pub static EMBEDDED_WEBVIEWS: std::sync::LazyLock<RwLock<HashMap<String, tauri::WebviewWindow>>> =
    std::sync::LazyLock::new(|| RwLock::new(HashMap::new()));

pub static VERIFICATION_PENDING: std::sync::LazyLock<parking_lot::Mutex<Option<String>>> =
    std::sync::LazyLock::new(|| parking_lot::Mutex::new(None));

pub fn get_pending_verification() -> Option<String> {
    VERIFICATION_PENDING.lock().take()
}

pub fn set_pending_verification(code: String) {
    *VERIFICATION_PENDING.lock() = Some(code);
}

const MAX_EMBEDDED_WEBVIEWS: usize = 10;

pub fn set_app_handle(handle: tauri::AppHandle) {
    let mut guard = APP_HANDLE.write().unwrap();
    *guard = Some(handle);
}

pub fn get_app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.read().unwrap().clone()
}

pub fn set_main_window(window: tauri::WebviewWindow) {
    let mut guard = MAIN_WINDOW.write().unwrap();
    *guard = Some(window);
}

pub fn get_main_window() -> Option<tauri::WebviewWindow> {
    MAIN_WINDOW.read().unwrap().clone()
}

pub fn save_embedded_webview(label: &str, window: tauri::WebviewWindow) {
    let mut guard = EMBEDDED_WEBVIEWS.write().unwrap();
    if guard.len() >= MAX_EMBEDDED_WEBVIEWS {
        if let Some(oldest_key) = guard.keys().next().cloned() {
            if let Some(old_window) = guard.remove(&oldest_key) {
                let _ = old_window.close();
            }
        }
    }
    guard.insert(label.to_string(), window);
}

pub fn get_embedded_webview(label: &str) -> Option<tauri::WebviewWindow> {
    let guard = EMBEDDED_WEBVIEWS.read().unwrap();
    guard.get(label).cloned()
}

pub fn remove_embedded_webview(label: &str) {
    let mut guard = EMBEDDED_WEBVIEWS.write().unwrap();
    guard.remove(label);
}

pub fn cleanup_all_embedded_webviews() {
    let mut guard = EMBEDDED_WEBVIEWS.write().unwrap();
    for (_, window) in guard.drain() {
        let _ = window.close();
    }
}

pub fn emit_log(level: &str, msg: &str) {
    if let Some(handle) = get_app_handle() {
        let (module, source, message) = if msg.starts_with('{') {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg) {
                (
                    parsed
                        .get("module")
                        .and_then(|v| v.as_str())
                        .unwrap_or("explore")
                        .to_string(),
                    parsed
                        .get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("rust")
                        .to_string(),
                    parsed
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or(msg)
                        .to_string(),
                )
            } else {
                ("explore".to_string(), "rust".to_string(), msg.to_string())
            }
        } else {
            ("explore".to_string(), "rust".to_string(), msg.to_string())
        };

        let _ = handle.emit(
            "global-log",
            &serde_json::json!({
                "level": level,
                "module": module,
                "source": source,
                "message": message
            }),
        );
    }
}

static GLOBAL_UA: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub fn set_global_ua(ua: String) {
    let _ = GLOBAL_UA.set(ua);
}

pub fn get_ua() -> String {
    if let Some(ua) = GLOBAL_UA.get() {
        if !ua.is_empty() {
            return ua.clone();
        }
    }
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string()
}

static COOKIE_SAVE_PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub fn set_cookie_save_dir(dir: PathBuf) {
    let _ = COOKIE_SAVE_PATH.set(dir);
}

pub fn get_cookies_json() -> String {
    let store = storage::COOKIE_STORE.lock();
    serde_json::to_string(&*store).unwrap_or_else(|_| "{}".into())
}

pub fn load_cookies_from_file() -> String {
    if let Some(dir) = COOKIE_SAVE_PATH.get() {
        let path = dir.join("cookies.json");
        if let Ok(content) = std::fs::read_to_string(&path) {
            let decrypted = storage::decrypt_cookie_data(&content);
            if decrypted.is_empty() {
                return "error: cookie 解密失败".into();
            }
            if let Ok(parsed) = serde_json::from_str::<
                std::collections::HashMap<String, std::collections::HashMap<String, String>>,
            >(&decrypted)
            {
                let mut store = storage::COOKIE_STORE.lock();
                *store = parsed;
                return "ok".into();
            }
        }
    }
    "no saved cookies".into()
}

deno_core::extension!(
    abyss_java,
    ops = [
        ajax::op_java_ajax, ajax::op_java_web_js,
        crypto::op_java_base64_encode, crypto::op_java_base64_decode, crypto::op_java_md5_encode,
        crypto::op_java_aes_base64_decode, crypto::op_java_aes_base64_encode,
        crypto::op_java_des_base64_decode, crypto::op_java_des_base64_encode,
        crypto::op_java_rsa_set_public_key, crypto::op_java_rsa_set_private_key,
        crypto::op_java_rsa_encrypt, crypto::op_java_rsa_decrypt, crypto::op_java_sign,
        dom::op_jsoup_before, dom::op_jsoup_after, dom::op_jsoup_prepend, dom::op_jsoup_append,
        io::op_jsoup_parse, io::op_jsoup_select, io::op_jsoup_text, io::op_jsoup_own_text, io::op_jsoup_attr, io::op_jsoup_html, io::op_jsoup_outer_html, io::op_jsoup_remove, io::op_jsoup_size, io::op_jsoup_get, io::op_jsoup_each_text, io::op_jsoup_children, io::op_jsoup_tag_name, io::op_java_cache_file, io::op_java_download_file,
        io::op_java_read_txt_file, io::op_java_read_file_bytes_base64,
        io::op_java_delete_file, io::op_java_get_txt_in_folder,
        io::op_java_file_exists, io::op_java_unarchive_file, io::op_java_zip_content,
        io::op_java_query_ttf, io::op_java_get_verification_code,
        storage::op_java_put, storage::op_java_get,
        storage::op_java_get_cookie, storage::op_java_set_cookie,
        storage::op_java_save_cookies, storage::op_java_load_cookies,
        storage::op_java_login_complete, storage::op_java_up_login_data,
        storage::op_java_emit_log, storage::op_java_start_browser,
        storage::op_java_start_browser_await, storage::op_java_time_format,
        storage::op_java_encode_uri, storage::op_java_decode_uri,
        storage::op_java_t2s, storage::op_java_s2t, storage::op_java_random_uuid,
        storage::op_java_copy_text, storage::op_java_show_photo,
        storage::op_java_open_video_player, storage::op_java_search_book,
        storage::op_java_refresh_explore, storage::op_java_refresh_book_info,
    ],
);
