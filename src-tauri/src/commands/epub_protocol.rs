// ============================================
// EPUB 资源自定义协议处理器
// ============================================
//
// 协议 URL 格式：epub://epub/<book_id>/<md5>
// - host 固定 "epub"，所有信息在 path
//   （Windows WebView2 上 Tauri 会把 scheme 转到 http://epub.localhost/...，
//    但 path 保留，所以只看 path 就够）
//
// 安全模型：
// - book_id 和 md5 都必须是 32 位 hex，物理上不可能路径穿越
// - 只从 <cache_root>/epub/<book_id>/resources/<md5> 读文件
// - 不信任任何用户提供的路径片段

use std::path::Path;
use tauri::http::{Request, Response, StatusCode};

const DEFAULT_MIME: &str = "application/octet-stream";
const CACHE_CONTROL: &str = "public, max-age=3600";

/// 处理 epub:// 请求。返回 HttpResponse。
pub fn handle_epub_request(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let (book_id, md5) = match parse_path(path) {
        Some(p) => p,
        None => return error_response(StatusCode::BAD_REQUEST, "invalid url path"),
    };

    if !is_hex32(book_id) {
        return error_response(StatusCode::BAD_REQUEST, "invalid book_id");
    }
    if !is_hex32(md5) {
        return error_response(StatusCode::BAD_REQUEST, "invalid resource key");
    }

    let cache_root = crate::storage::cache::get_cache_root();
    let base = cache_root.join("epub").join(book_id).join("resources");
    let file = base.join(md5);

    // 双保险：即使 hex32 已保证安全，也做一次 starts_with 校验
    if !is_within(&file, &base) {
        return error_response(StatusCode::BAD_REQUEST, "path traversal denied");
    }

    match std::fs::read(&file) {
        Ok(bytes) => {
            let mime = sniff_mime(&bytes);
            build_response(StatusCode::OK, mime, bytes)
        }
        Err(_) => error_response(StatusCode::NOT_FOUND, "resource not found"),
    }
}

/// 从 path 里提取 book_id 和 md5。
/// path 形如 "/<book_id>/<md5>"，前后可能有无关的斜杠。
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let trimmed = path.trim_start_matches('/');
    let mut parts = trimmed.splitn(2, '/');
    let book_id = parts.next()?;
    let md5 = parts.next()?;
    if book_id.is_empty() || md5.is_empty() {
        return None;
    }
    if md5.contains('/') {
        return None;
    }
    Some((book_id, md5))
}

fn is_hex32(s: &str) -> bool {
    s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn is_within(file: &Path, base: &Path) -> bool {
    let file_str = file.to_string_lossy();
    let base_str = base.to_string_lossy();
    file_str.starts_with(&*base_str)
}

/// 根据字节魔数判断 MIME。
fn sniff_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 4 {
        if bytes[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png"; }
        if bytes[0..4] == [0x47, 0x49, 0x46, 0x38] { return "image/gif"; }
        if bytes[0..4] == [0x52, 0x49, 0x46, 0x46] { return "image/webp"; }
        if bytes[0..4] == [0x77, 0x4F, 0x46, 0x46] { return "font/woff"; }
        if bytes[0..4] == [0x77, 0x4F, 0x46, 0x32] { return "font/woff2"; }
        if bytes[0..4] == [0x4F, 0x54, 0x54, 0x4F] { return "font/otf"; }
        if bytes[0..4] == [0x00, 0x01, 0x00, 0x00] { return "font/ttf"; }
        if bytes[0..4] == [0x3C, 0x73, 0x76, 0x67] { return "image/svg+xml"; }
    }
    if bytes.len() >= 2 && bytes[0..2] == [0xFF, 0xD8] { return "image/jpeg"; }
    DEFAULT_MIME
}

fn build_response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("Cache-Control", CACHE_CONTROL)
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn error_response(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    build_response(status, "text/plain; charset=utf-8", msg.as_bytes().to_vec())
}
