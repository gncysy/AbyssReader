use deno_core::op2;
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::Mutex;
use tauri::Emitter;

pub static STORAGE: LazyLock<Mutex<HashMap<String, HashMap<String, String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
pub static COOKIE_STORE: LazyLock<Mutex<HashMap<String, HashMap<String, String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const COOKIE_MAX_STRING_LENGTH: usize = 4096;
const COOKIE_MAX_KEY_COUNT: usize = 50;
const MAX_STORAGE_VALUE_LENGTH: usize = 1024 * 1024; // 1MB

const KEYRING_SERVICE: &str = "com.gncysy.abyss-reader";
const KEYRING_USERNAME: &str = "cookie-encryption-key";
const KEYRING_KEY_LENGTH: usize = 32;

static ENCRYPTION_KEY: LazyLock<Mutex<Option<[u8; KEYRING_KEY_LENGTH]>>> =
    LazyLock::new(|| Mutex::new(None));

fn get_or_create_encryption_key() -> [u8; KEYRING_KEY_LENGTH] {
    {
        let cache = ENCRYPTION_KEY.lock();
        if let Some(key) = *cache {
            return key;
        }
    }

    let entry = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME) {
        Ok(e) => e,
        Err(_) => {
            // 修复：keyring 不可用时使用随机密钥，而不是可预测的主机名
            // 随机密钥仅在当前进程内有效，重启后 cookie 解密会失败
            // 但这是比使用可预测密钥更安全的选择
            use rand::RngCore;
            let mut key = [0u8; KEYRING_KEY_LENGTH];
            rand::rngs::OsRng.fill_bytes(&mut key);
            crate::js_runtime::ops::emit_log(
                "warn",
                "[storage] keyring 不可用，使用临时随机密钥（重启后 cookie 需要重新登录）",
            );
            let mut cache = ENCRYPTION_KEY.lock();
            *cache = Some(key);
            return key;
        }
    };

    match entry.get_password() {
        Ok(password) => {
            let mut key = [0u8; KEYRING_KEY_LENGTH];
            let bytes = password.as_bytes();
            let len = bytes.len().min(KEYRING_KEY_LENGTH);
            key[..len].copy_from_slice(&bytes[..len]);
            let mut cache = ENCRYPTION_KEY.lock();
            *cache = Some(key);
            key
        }
        Err(_) => {
            use rand::RngCore;
            let mut key = [0u8; KEYRING_KEY_LENGTH];
            rand::rngs::OsRng.fill_bytes(&mut key);
            let password = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &key,
            );
            let _ = entry.set_password(&password);
            let mut cache = ENCRYPTION_KEY.lock();
            *cache = Some(key);
            key
        }
    }
}

pub fn encrypt_cookie_data(plaintext: &str) -> String {
    use aes::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let key = get_or_create_encryption_key();
    let mut iv = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut iv);

    let cipher = cbc::Encryptor::<aes::Aes256>::new(&key.into(), &iv.into());
    let data_bytes = plaintext.as_bytes();
    let block_size: usize = 16;
    let mut buf = data_bytes.to_vec();
    buf.resize(buf.len() + block_size, 0);

    if let Ok(encrypted) = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
        let mut combined = Vec::with_capacity(iv.len() + encrypted.len());
        combined.extend_from_slice(&iv);
        combined.extend_from_slice(encrypted);
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &combined)
    } else {
        String::new()
    }
}

pub fn decrypt_cookie_data(ciphertext: &str) -> String {
    use aes::cipher::{BlockDecryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let key = get_or_create_encryption_key();

    let decoded = match base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        ciphertext,
    ) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };

    if decoded.len() < 17 {
        return String::new();
    }

    let iv: [u8; 16] = decoded[..16].try_into().unwrap_or([0u8; 16]);
    let encrypted = &decoded[16..];

    let cipher = cbc::Decryptor::<aes::Aes256>::new(&key.into(), &iv.into());
    let mut buf = encrypted.to_vec();

    if let Ok(decrypted) = cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
        String::from_utf8_lossy(decrypted).to_string()
    } else {
        String::new()
    }
}

pub fn get_cookie_internal(url: &str, key: &str) -> String {
    let store = COOKIE_STORE.lock();
    let domain = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| url.to_string());

    if let Some(cookies) = store.get(&domain) {
        if key.is_empty() {
            let mut result = cookies
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("; ");

            while result.len() > COOKIE_MAX_STRING_LENGTH {
                if let Some(first_key) = cookies.keys().next().cloned() {
                    let val = cookies.get(&first_key).cloned().unwrap_or_default();
                    result = result
                        .replace(&format!("{}={}", first_key, val), "")
                        .replace("; ;", ";")
                        .trim_matches(';')
                        .to_string();
                } else {
                    break;
                }
            }
            return result;
        }
        return cookies.get(key).cloned().unwrap_or_default();
    }
    String::new()
}

pub fn set_cookie_internal(url: &str, cookie_str: &str) {
    let domain = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| url.to_string());

    let mut store = COOKIE_STORE.lock();
    let cookies = store.entry(domain).or_default();

    for part in cookie_str.split(';') {
        let t = part.trim();
        if let Some(eq) = t.find('=') {
            let k = t[..eq].trim().to_string();
            let v = t[eq + 1..].trim().to_string();
            if !k.is_empty() {
                if cookies.len() >= COOKIE_MAX_KEY_COUNT && !cookies.contains_key(&k) {
                    if let Some(first_key) = cookies.keys().next().cloned() {
                        cookies.remove(&first_key);
                    }
                }
                cookies.insert(k, v);
            }
        }
    }
}

#[op2]
#[string]
pub fn op_java_put(#[string] source_key: String, #[string] key: String, #[string] value: String) -> String {
    // 修复：限制 value 大小，防止恶意书源导致内存耗尽
    if value.len() > MAX_STORAGE_VALUE_LENGTH {
        let truncated = &value[..MAX_STORAGE_VALUE_LENGTH];
        STORAGE.lock().entry(source_key).or_default().insert(key, truncated.to_string());
        return "false".into();
    }
    STORAGE.lock().entry(source_key).or_default().insert(key, value);
    "true".into()
}

#[op2]
#[string]
pub fn op_java_get(#[string] source_key: String, #[string] key: String) -> String {
    STORAGE
        .lock()
        .get(&source_key)
        .and_then(|m| m.get(&key))
        .cloned()
        .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_java_get_cookie(#[string] url: String, #[string] key: String) -> String {
    get_cookie_internal(&url, &key)
}

#[op2(fast)]
pub fn op_java_set_cookie(#[string] url: String, #[string] cookie_str: String) {
    set_cookie_internal(&url, &cookie_str);
}

#[op2]
#[string]
pub fn op_java_save_cookies() -> String {
    let store = COOKIE_STORE.lock();
    match serde_json::to_string(&*store) {
        Ok(json) => {
            let encrypted = encrypt_cookie_data(&json);
            if let Some(dir) = crate::js_runtime::ops::COOKIE_SAVE_PATH.get() {
                let _ = std::fs::write(dir.join("cookies.json"), &encrypted);
            }
            json
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_load_cookies() -> String {
    crate::js_runtime::ops::load_cookies_from_file()
}

#[op2]
#[string]
pub fn op_java_login_complete(#[string] url: String, #[string] cookie_str: String) -> String {
    let domain = url::Url::parse(&url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| url.clone());

    let mut store = COOKIE_STORE.lock();
    let cookies = store.entry(domain.clone()).or_default();

    for part in cookie_str.split(';') {
        let t = part.trim();
        if let Some(eq) = t.find('=') {
            let k = t[..eq].trim().to_string();
            let v = t[eq + 1..].trim().to_string();
            if !k.is_empty() {
                cookies.insert(k, v);
            }
        }
    }
    format!("ok, saved {} cookies", domain)
}

#[op2(fast)]
pub fn op_java_up_login_data(#[string] _info: String) {}

#[op2(fast)]
pub fn op_java_refresh_explore() {
    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit("refresh-explore", ());
    }
}

#[op2(fast)]
pub fn op_java_refresh_book_info() {
    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit("refresh-book-info", ());
    }
}

#[op2(fast)]
pub fn op_java_emit_log(#[string] level: String, #[string] msg: String) {
    crate::js_runtime::ops::emit_log(&level, &msg);
}

#[op2(fast)]
pub fn op_java_start_browser(#[string] url: String) {
    let lower = url.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        let _ = open::that(&url);
    }
}

#[op2]
#[string]
pub fn op_java_start_browser_await(#[string] url: String, #[string] _title: String) -> String {
    let lower = url.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        let _ = open::that(&url);
    }
    String::new()
}

#[op2]
#[string]
pub fn op_java_time_format(#[bigint] timestamp: i64) -> String {
    // 修复：13 位时间戳按毫秒处理，其他按秒处理
    let ts_sec = if timestamp > 99_999_999_999 { timestamp / 1000 } else { timestamp };
    chrono::DateTime::from_timestamp(ts_sec, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_java_encode_uri(#[string] input: String) -> String {
    urlencoding::encode(&input).to_string()
}

#[op2]
#[string]
pub fn op_java_decode_uri(#[string] input: String) -> String {
    urlencoding::decode(&input)
        .unwrap_or(std::borrow::Cow::Borrowed(&input))
        .to_string()
}

#[op2]
#[string]
pub fn op_java_t2s(#[string] text: String) -> String {
    hanconv::t2s(&text)
}

#[op2]
#[string]
pub fn op_java_s2t(#[string] text: String) -> String {
    hanconv::s2t(&text)
}

#[op2]
#[string]
pub fn op_java_random_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[op2(fast)]
pub fn op_java_copy_text(#[string] text: String) {
    use arboard::Clipboard;
    if let Ok(mut clipboard) = Clipboard::new() {
        let _ = clipboard.set_text(&text);
    }
}

#[op2]
#[string]
pub fn op_java_show_photo(#[string] src: String) -> String {
    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit("show-photo", &src);
    }
    src
}

#[op2]
#[string]
pub fn op_java_open_video_player(#[string] url: String, #[string] title: String) -> String {
    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit(
            "open-video-player",
            serde_json::json!({ "url": url, "title": title }),
        );
    }
    title
}

#[op2]
#[string]
pub fn op_java_search_book(#[string] keyword: String, #[string] source_json: String) -> String {
    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit(
            "js-search-book",
            serde_json::json!({ "keyword": keyword, "source": source_json }),
        );
    }
    keyword
}
