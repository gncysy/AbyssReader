use deno_core::op2;
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::Mutex;
use tauri::Emitter;
use crate::storage::cache::{self, CacheCategory};

const MAX_UNARCHIVE_TOTAL_BYTES: u64 = 200 * 1024 * 1024;
const MAX_UNARCHIVE_FILE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_UNARCHIVE_FILES: usize = 500;

// ─── HTML 解析缓存 ───
// 书源规则对同一段 HTML 反复调用 op_jsoup_size / op_jsoup_get / op_jsoup_text 等。
// 每次 parse 都重新构建 DOM 树，性能差。
// 用 LRU 缓存 (html, selector, index) → 解析结果。

const HTML_CACHE_MAX: usize = 64;

struct HtmlCache {
    /// (html + selector + index) → 结果
    map: HashMap<String, String>,
    /// 插入顺序（最旧的在前）
    order: Vec<String>,
}

static HTML_CACHE: LazyLock<Mutex<HtmlCache>> = LazyLock::new(|| {
    Mutex::new(HtmlCache {
        map: HashMap::new(),
        order: Vec::new(),
    })
});

fn cache_key(html: &str, selector: &str, index: Option<u32>) -> String {
    let mut key = String::with_capacity(html.len() + selector.len() + 16);
    key.push_str(html);
    key.push('\x1f');
    key.push_str(selector);
    if let Some(i) = index {
        key.push('\x1f');
        key.push_str(&i.to_string());
    }
    key
}

fn cache_get(key: &str) -> Option<String> {
    let cache = HTML_CACHE.lock();
    cache.map.get(key).cloned()
}

fn cache_put(key: String, value: String) {
    let mut cache = HTML_CACHE.lock();
    if cache.map.contains_key(&key) {
        // 已存在，更新
        cache.map.insert(key.clone(), value);
        if let Some(pos) = cache.order.iter().position(|k| k == &key) {
            cache.order.remove(pos);
        }
        cache.order.push(key);
        return;
    }
    if cache.map.len() >= HTML_CACHE_MAX {
        if let Some(oldest) = cache.order.first().cloned() {
            cache.order.remove(0);
            cache.map.remove(&oldest);
        }
    }
    cache.map.insert(key.clone(), value);
    cache.order.push(key);
}

/// 清空 HTML 缓存（供外部触发）。
pub fn clear_html_cache() {
    let mut cache = HTML_CACHE.lock();
    cache.map.clear();
    cache.order.clear();
}

fn get_body_first_element(doc: &scraper::Html) -> Option<scraper::ElementRef<'_>> {
    let body_sel = scraper::Selector::parse("body").ok()?;
    let body = doc.select(&body_sel).next()?;
    for child in body.children() {
        if let Some(el_ref) = scraper::ElementRef::wrap(child) {
            return Some(el_ref);
        }
    }
    None
}

#[op2]
#[string]
pub fn op_jsoup_parse(#[string] html: String) -> String {
    html
}

#[op2]
#[string]
pub fn op_jsoup_select(#[string] html: String, #[string] css: String) -> String {
    let key = cache_key(&html, &css, None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let selector = match scraper::Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return "[]".into(),
    };
    let elements: Vec<String> = doc.select(&selector).map(|el| el.html()).collect();
    let result = serde_json::to_string(&elements).unwrap_or_else(|_| "[]".into());
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_text(#[string] html: String) -> String {
    let key = cache_key(&html, "__text__", None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let result = if let Some(el_ref) = get_body_first_element(&doc) {
        el_ref.text().collect::<Vec<_>>().join("")
    } else {
        String::new()
    };
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_attr(#[string] html: String, #[string] name: String) -> String {
    let key = cache_key(&html, &format!("__attr__{}", name), None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let result = if let Some(el_ref) = get_body_first_element(&doc) {
        el_ref.value().attr(&name).unwrap_or("").to_string()
    } else {
        String::new()
    };
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_html(#[string] html: String) -> String {
    let key = cache_key(&html, "__inner_html__", None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let result = if let Some(el_ref) = get_body_first_element(&doc) {
        el_ref.inner_html()
    } else {
        html.clone()
    };
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_outer_html(#[string] html: String) -> String {
    html
}

#[op2]
#[string]
pub fn op_jsoup_remove(#[string] html: String, #[string] css: String) -> String {
    // remove 是写操作，不缓存
    let doc = scraper::Html::parse_document(&html);
    let selector = match scraper::Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return html,
    };
    let mut doc = doc;
    let elements: Vec<_> = doc.select(&selector).map(|e| e.id()).collect();
    for id in elements {
        if let Some(mut el) = doc.tree.get_mut(id) {
            el.detach();
        }
    }
    doc.root_element().html()
}

#[op2(fast)]
pub fn op_jsoup_size(#[string] html: String, #[string] css: String) -> u32 {
    let key = cache_key(&html, &format!("__size__{}", css), None);
    if let Some(cached) = cache_get(&key) {
        if let Ok(n) = cached.parse::<u32>() {
            return n;
        }
    }
    let doc = scraper::Html::parse_document(&html);
    let selector = match scraper::Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let count = doc.select(&selector).count() as u32;
    cache_put(key, count.to_string());
    count
}

#[op2]
#[string]
pub fn op_jsoup_get(#[string] html: String, #[string] css: String, index: u32) -> String {
    let key = cache_key(&html, &format!("__get__{}", css), Some(index));
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let selector = match scraper::Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    let result = doc.select(&selector)
        .nth(index as usize)
        .map(|el| el.html())
        .unwrap_or_default();
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_each_text(#[string] html: String, #[string] css: String) -> String {
    let key = cache_key(&html, &format!("__each_text__{}", css), None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let selector = match scraper::Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return "[]".into(),
    };
    let texts: Vec<String> = doc
        .select(&selector)
        .map(|el| el.text().collect::<Vec<_>>().join(""))
        .collect();
    let result = serde_json::to_string(&texts).unwrap_or_else(|_| "[]".into());
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_children(#[string] html: String) -> String {
    let key = cache_key(&html, "__children__", None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let children: Vec<String> = doc
        .root_element()
        .children()
        .filter(|child| child.value().is_element())
        .filter_map(|child| scraper::ElementRef::wrap(child).map(|el| el.html()))
        .collect();
    let result = serde_json::to_string(&children).unwrap_or_else(|_| "[]".into());
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_tag_name(#[string] html: String) -> String {
    let key = cache_key(&html, "__tag_name__", None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let result = if let Some(el_ref) = get_body_first_element(&doc) {
        el_ref.value().name().to_string()
    } else {
        String::new()
    };
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_jsoup_own_text(#[string] html: String) -> String {
    let key = cache_key(&html, "__own_text__", None);
    if let Some(cached) = cache_get(&key) {
        return cached;
    }
    let doc = scraper::Html::parse_document(&html);
    let result = if let Some(el_ref) = get_body_first_element(&doc) {
        let texts: Vec<String> = el_ref
            .children()
            .filter(|child| child.value().is_text())
            .filter_map(|child| child.value().as_text().map(|t| t.to_string()))
            .collect();
        texts.join("")
    } else {
        String::new()
    };
    cache_put(key, result.clone());
    result
}

#[op2]
#[string]
pub fn op_java_cache_file(#[string] url: String) -> String {
    let cache_key = format!("{:x}", md5::compute(url.as_bytes()));
    if let Some(data) = cache::cache_get(CacheCategory::Lib, &cache_key) {
        return String::from_utf8_lossy(&data).to_string();
    }

    let url_clone = url.clone();
    let cache_key_clone = cache_key.clone();

    crate::js_runtime::ops::common::with_blocking_client(move |client| {
        match client.get(&url_clone).send() {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.text() {
                        Ok(text) => {
                            let _ = cache::cache_put(CacheCategory::Lib, &cache_key_clone, text.as_bytes());
                            text
                        }
                        Err(_) => String::new(),
                    }
                } else {
                    String::new()
                }
            }
            Err(_) => String::new(),
        }
    })
}

#[op2]
#[string]
pub fn op_java_download_file(#[string] url: String) -> String {
    let cache_key = format!("{:x}", md5::compute(url.as_bytes()));
    if cache::cache_get(CacheCategory::Lib, &cache_key).is_some() {
        return cache_key;
    }

    let url_clone = url.clone();
    let cache_key_clone = cache_key.clone();

    crate::js_runtime::ops::common::with_blocking_client(move |client| {
        match client.get(&url_clone).send() {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.text() {
                        Ok(text) => {
                            let _ = cache::cache_put(CacheCategory::Lib, &cache_key_clone, text.as_bytes());
                            cache_key_clone
                        }
                        Err(_) => String::new(),
                    }
                } else {
                    String::new()
                }
            }
            Err(_) => String::new(),
        }
    })
}

fn get_safe_path(path: &str) -> Result<std::path::PathBuf, String> {
    let root = cache::get_cache_root();
    let root_canonical = root.canonicalize().unwrap_or_else(|_| root.clone());
    let base = root_canonical.parent().unwrap_or(&root_canonical).to_path_buf();
    let base_canonical = base.canonicalize().unwrap_or_else(|_| base.clone());

    let clean = path.trim_start_matches('/').trim_start_matches('\\');
    if clean.contains("..") {
        return Err("非法路径：包含 '..'".into());
    }
    if clean.contains('~') {
        return Err("非法路径：包含 '~'".into());
    }
    if clean.is_empty() {
        return Err("非法路径：空路径".into());
    }
    if clean.starts_with('/') || (clean.len() > 2 && &clean[1..2] == ":") {
        return Err("非法路径：不允许绝对路径".into());
    }

    let resolved = base_canonical.join(clean);
    let canonical = resolved.canonicalize().unwrap_or_else(|_| resolved.clone());
    if !canonical.starts_with(&base_canonical) {
        return Err("非法路径：不在允许的目录范围内".into());
    }
    Ok(canonical)
}

#[op2]
#[string]
pub fn op_java_read_txt_file(#[string] path: String) -> String {
    match get_safe_path(&path) {
        Ok(p) => {
            if p.exists() {
                std::fs::read_to_string(&p).unwrap_or_default()
            } else {
                String::new()
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_read_file_bytes_base64(#[string] path: String) -> String {
    use base64::Engine;
    match get_safe_path(&path) {
        Ok(p) => {
            if p.exists() {
                match std::fs::read(&p) {
                    Ok(bytes) => base64::engine::general_purpose::STANDARD.encode(&bytes),
                    Err(_) => String::new(),
                }
            } else {
                String::new()
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_delete_file(#[string] path: String) -> String {
    match get_safe_path(&path) {
        Ok(p) => {
            if p.exists() {
                if p.is_dir() {
                    match std::fs::remove_dir_all(&p) {
                        Ok(_) => "true".into(),
                        Err(e) => format!("error: {}", e),
                    }
                } else {
                    match std::fs::remove_file(&p) {
                        Ok(_) => "true".into(),
                        Err(e) => format!("error: {}", e),
                    }
                }
            } else {
                "true".into()
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_get_txt_in_folder(#[string] path: String) -> String {
    match get_safe_path(&path) {
        Ok(p) => {
            if p.is_dir() {
                let mut contents = String::new();
                if let Ok(entries) = std::fs::read_dir(&p) {
                    for entry in entries.flatten() {
                        if let Ok(content) = std::fs::read_to_string(entry.path()) {
                            contents.push_str(&content);
                            contents.push('\n');
                        }
                    }
                }
                contents.trim_end().to_string()
            } else {
                String::new()
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_file_exists(#[string] path: String) -> String {
    match get_safe_path(&path) {
        Ok(p) => {
            if p.exists() {
                "true".into()
            } else {
                "false".into()
            }
        }
        Err(_) => "false".into(),
    }
}

#[op2]
#[string]
pub fn op_java_unarchive_file(#[string] path: String) -> String {
    match get_safe_path(&path) {
        Ok(p) => {
            if !p.exists() {
                return "error: 文件不存在".into();
            }
            let out_dir = p
                .parent()
                .unwrap_or(&p)
                .join(format!("_extracted_{:x}", md5::compute(path.as_bytes())));
            let _ = std::fs::create_dir_all(&out_dir);
            let file = match std::fs::File::open(&p) {
                Ok(f) => f,
                Err(e) => return format!("error: {}", e),
            };
            let reader = std::io::BufReader::new(file);
            match zip::ZipArchive::new(reader) {
                Ok(mut archive) => {
                    let mut total_bytes: u64 = 0;
                    let mut file_count: usize = 0;

                    for i in 0..archive.len() {
                        if file_count >= MAX_UNARCHIVE_FILES {
                            return format!("error: 压缩包文件数超过限制 ({})", MAX_UNARCHIVE_FILES);
                        }

                        let mut entry = match archive.by_index(i) {
                            Ok(e) => e,
                            Err(_) => continue,
                        };

                        let entry_size = entry.size();

                        if entry_size > MAX_UNARCHIVE_FILE_BYTES {
                            return format!("error: 压缩包内文件过大 ({})", entry_size);
                        }

                        total_bytes += entry_size;
                        if total_bytes > MAX_UNARCHIVE_TOTAL_BYTES {
                            return format!("error: 压缩包解压后总大小超过限制 ({})", MAX_UNARCHIVE_TOTAL_BYTES);
                        }

                        if let Some(name) = entry.enclosed_name() {
                            let out_path = out_dir.join(name);
                            if entry.is_dir() {
                                let _ = std::fs::create_dir_all(&out_path);
                            } else {
                                if let Some(parent) = out_path.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                if let Ok(mut outfile) = std::fs::File::create(&out_path) {
                                    let _ = std::io::copy(&mut entry, &mut outfile);
                                }
                            }
                            file_count += 1;
                        }
                    }
                    out_dir.to_string_lossy().to_string()
                }
                Err(_) => "error: 不支持的压缩格式".into(),
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_zip_content(#[string] data: String, #[string] path_in_zip: String) -> String {
    use base64::Engine;

    let data_clone = data.clone();
    let bytes: Vec<u8> = if data.starts_with("http://") || data.starts_with("https://") {
        crate::js_runtime::ops::common::with_blocking_client_bytes(move |client| {
            match client.get(&data_clone).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        match resp.bytes() {
                            Ok(b) => b.to_vec(),
                            Err(_) => Vec::new(),
                        }
                    } else {
                        Vec::new()
                    }
                }
                Err(_) => Vec::new(),
            }
        })
    } else {
        match base64::engine::general_purpose::STANDARD.decode(&data) {
            Ok(b) => b,
            Err(_) => return String::new(),
        }
    };

    if bytes.is_empty() {
        return String::new();
    }

    let cursor = std::io::Cursor::new(bytes);
    match zip::ZipArchive::new(cursor) {
        Ok(mut archive) => {
            for i in 0..archive.len() {
                if let Ok(mut entry) = archive.by_index(i) {
                    if entry.name() == path_in_zip && !entry.is_dir() {
                        let mut content = String::new();
                        if std::io::Read::read_to_string(&mut entry, &mut content).is_ok() {
                            return content;
                        }
                    }
                }
            }
            String::new()
        }
        Err(_) => String::new(),
    }
}

static FONT_CACHE: LazyLock<Mutex<HashMap<String, Vec<u8>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

const FONT_CACHE_MAX: usize = 16;

fn load_font_bytes(data: &str) -> Result<Vec<u8>, String> {
    let cache_key = format!("{:x}", md5::compute(data.as_bytes()));
    if let Some(bytes) = FONT_CACHE.lock().get(&cache_key) {
        return Ok(bytes.clone());
    }

    let data_string = data.to_string();
    let bytes: Vec<u8> = if data.starts_with("http://") || data.starts_with("https://") {
        crate::js_runtime::ops::common::with_blocking_client_bytes(move |client| {
            match client.get(&data_string).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        match resp.bytes() {
                            Ok(b) => b.to_vec(),
                            Err(_) => Vec::new(),
                        }
                    } else {
                        Vec::new()
                    }
                }
                Err(_) => Vec::new(),
            }
        })
    } else {
        use base64::Engine;
        match base64::engine::general_purpose::STANDARD.decode(data) {
            Ok(b) => b,
            Err(_) => return Err("base64 解码失败".into()),
        }
    };

    if bytes.is_empty() {
        return Err("下载字体失败".into());
    }

    let mut cache = FONT_CACHE.lock();
    if cache.len() > FONT_CACHE_MAX {
        cache.clear();
    }
    cache.insert(cache_key, bytes.clone());
    Ok(bytes)
}

fn parse_glyf_data(face: &ttf_parser::Face, glyph_id: u16) -> Option<Vec<u8>> {
    let bbox = face.glyph_bounding_box(ttf_parser::GlyphId(glyph_id))?;
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&bbox.x_min.to_le_bytes());
    data.extend_from_slice(&bbox.y_min.to_le_bytes());
    data.extend_from_slice(&bbox.width().to_le_bytes());
    data.extend_from_slice(&bbox.height().to_le_bytes());
    Some(data)
}

#[op2]
#[string]
pub fn op_java_query_ttf(#[string] data: String) -> String {
    use base64::Engine;
    let bytes = match load_font_bytes(&data) {
        Ok(b) => b,
        Err(e) => return format!("error: {}", e),
    };
    let face = match ttf_parser::Face::parse(&bytes, 0) {
        Ok(f) => f,
        Err(_) => return "error: 字体解析失败".into(),
    };
    let mut cmap_list = Vec::new();
    for subtable in face.tables().cmap.into_iter().flat_map(|c| c.subtables) {
        if subtable.is_unicode() {
            subtable.codepoints(|cp| {
                if let Some(glyph_id) = subtable.glyph_index(cp) {
                    cmap_list.push((cp, glyph_id.0));
                }
            });
        }
    }
    let mut glyf_map = Vec::new();
    for (cp, gid) in &cmap_list {
        if let Some(data) = parse_glyf_data(&face, *gid) {
            glyf_map.push((*cp, *gid, base64::engine::general_purpose::STANDARD.encode(&data)));
        }
    }
    let result = serde_json::json!({
        "cmap": cmap_list,
        "glyfMap": glyf_map.iter().map(|(cp, gid, data)| serde_json::json!({
            "cp": cp,
            "gid": gid,
            "data": data
        })).collect::<Vec<_>>(),
        "numberOfGlyphs": face.number_of_glyphs(),
        "unitsPerEm": face.units_per_em()
    });
    result.to_string()
}

const VERIFICATION_WAIT_INTERVAL_MS: u64 = 200;
const VERIFICATION_TIMEOUT_SECS: u64 = 120;

#[op2]
#[string]
pub fn op_java_get_verification_code(#[string] svg: String) -> String {
    crate::js_runtime::ops::set_pending_verification(String::new());

    if let Some(handle) = crate::js_runtime::ops::get_app_handle() {
        let _ = handle.emit(
            "verification-code-request",
            serde_json::json!({ "svg": svg }),
        );
    }

    let start = std::time::Instant::now();
    loop {
        if start.elapsed().as_secs() > VERIFICATION_TIMEOUT_SECS {
            crate::js_runtime::ops::emit_log("warn", "[验证码] 等待超时");
            return String::new();
        }

        if let Some(result) = crate::js_runtime::ops::get_pending_verification() {
            return result;
        }

        std::thread::sleep(std::time::Duration::from_millis(VERIFICATION_WAIT_INTERVAL_MS));
    }
}

#[op2]
pub fn op_java_str_to_bytes(#[string] input: String, #[string] charset: String) -> Vec<u8> {
    let enc = encoding_rs::Encoding::for_label(charset.as_bytes())
        .unwrap_or(encoding_rs::UTF_8);
    let (bytes, _, _) = enc.encode(&input);
    bytes.to_vec()
}

#[op2]
#[string]
pub fn op_java_bytes_to_str(#[buffer] input: &[u8], #[string] charset: String) -> String {
    let enc = encoding_rs::Encoding::for_label(charset.as_bytes())
        .unwrap_or(encoding_rs::UTF_8);
    let (text, _, _) = enc.decode(input);
    text.into_owned()
}

// ─── GZIP 解压 ───
//
// 修复：番茄书源 jsLib 的 gunzip 用 Java GZIPInputStream。
// 原实现是 JS 降级（直接透传），不解压。改为 Rust 真解压。
//
// 语义对齐 Java：
// - 输入是 GZIP 字节流（含 10 字节头 + deflate 数据 + 8 字节尾）
// - 输出是解压后的原始字节

#[op2]
pub fn op_java_gunzip(#[buffer] data: &[u8]) -> Vec<u8> {
    use flate2::read::GzDecoder;
    use std::io::Read;

    if data.is_empty() {
        return Vec::new();
    }

    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::with_capacity(data.len() * 4);
    match decoder.read_to_end(&mut out) {
        Ok(_) => out,
        Err(_) => Vec::new(),
    }
}
