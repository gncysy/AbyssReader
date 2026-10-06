// ============================================
// EPUB 解析命令
// ============================================
//
// 安全说明（对齐 Readest CVE-2026-82642 的教训）：
// - 章节 XHTML / CSS 在 Rust 侧完成所有资源引用重写
// - <img> src / data-src / srcset / poster / <image> href → epub:// URL
// - <a> href 保留为 data-epub-href 属性，href 置为 # 阻止默认导航
// - <style> 和 <link rel=stylesheet> 提取、url() 重写、净化后合并
// - @import 递归展开（带 visited 防循环），只读 EPUB manifest 内的 text/css
// - 前端 DOMPurify 二次净化，禁止 iframe/object/embed/srcdoc/script
// - iframe sandbox="allow-scripts" + 运行时计算的 CSP script hash
// - 资源（图片/字体）不内联为 data URL，改用 epub:// 自定义协议按需加载

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Seek};
use std::path::{Path, PathBuf};

const XHTML_MIMES: &[&str] = &["application/xhtml+xml", "text/html"];
const FONT_MIMES: &[&str] = &[
    "font/woff", "font/woff2", "font/ttf", "font/otf",
    "application/font-woff", "application/font-woff2",
    "application/x-font-ttf", "application/x-font-opentype",
    "application/vnd.ms-fontobject",
];
const URL_ATTR_RE: &str = r#"(?i)\b(src|data-src|data-original|data-lazy-src|data-lazyload|data-echo|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')"#;
const SRCSET_RE: &str = r#"(?i)\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')"#;
const IMAGE_HREF_RE: &str = r#"(?i)\b(xlink:href|href)\s*=\s*(?:"([^"]*)"|'([^']*)')"#;
const STYLE_ATTR_RE: &str = r#"(?i)\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')"#;
const IMG_TAG_RE: &str = r#"(?is)<image\b([^>]*?)/?>"#;
const ANCHOR_HREF_RE: &str = r#"(?i)<a\b([^>]*?)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*?)>"#;
// 修复：原正则用反向引用 \1，regex crate 不支持（cargo test 实测：
// "error: backreferences are not supported"，编译失败 → 整个 CSS url 重写失效）。
// 改为三个独立捕获组，分别对应双引号内、单引号内、无引号。
const CSS_URL_RE: &str = r#"url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)"#;
const IMPORT_RE: &str = r#"(?i)@import\s+(?:url\(\s*(['"]?)([^)'"]+?)\1\s*\)|(['"])([^'"]+?)\3)\s*([^;]*);"#;

// ─── 返回结构 ───

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubMetadata {
    pub title: String,
    pub author: String,
    pub publisher: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub identifier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubChapterInfo {
    pub index: usize,
    pub title: String,
    pub href: String,
    pub cached_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubParseResult {
    pub book_id: String,
    pub metadata: EpubMetadata,
    pub chapters: Vec<EpubChapterInfo>,
    pub cover_data_url: Option<String>,
    pub chapter_count: usize,
}

// ─── 内部结构 ───

struct OpfData {
    metadata: EpubMetadata,
    manifest: HashMap<String, ManifestItem>,
    spine: Vec<String>,
    cover_id: Option<String>,
    opf_dir: String,
}

#[derive(Clone)]
struct ManifestItem {
    href: String,
    media_type: String,
    properties: Option<String>,
}

// ─── 基础工具 ───

fn read_zip_entry<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Result<String> {
    let mut entry = archive.by_name(name).map_err(|e| {
        crate::error::AbyssError::ParseError(format!("EPUB 内找不到 {}: {}", name, e))
    })?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf)
        .map_err(|e| crate::error::AbyssError::IoError(format!("读取 {} 失败: {}", name, e)))?;
    Ok(buf)
}

fn read_zip_entry_bytes<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Result<Vec<u8>> {
    let mut entry = archive.by_name(name).map_err(|e| {
        crate::error::AbyssError::ParseError(format!("EPUB 内找不到 {}: {}", name, e))
    })?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf)
        .map_err(|e| crate::error::AbyssError::IoError(format!("读取 {} 失败: {}", name, e)))?;
    Ok(buf)
}

fn copy_zip_entry_to_file<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
    dest: &Path,
) -> std::io::Result<u64> {
    let mut entry = archive.by_name(name)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, format!("{}: {}", name, e)))?;
    let mut out = std::fs::File::create(dest)?;
    let n = std::io::copy(&mut entry, &mut out)?;
    Ok(n)
}

fn resolve_relative_path(base_dir: &str, href: &str) -> String {
    if href.starts_with('/') {
        return href.trim_start_matches('/').to_string();
    }
    let mut parts: Vec<&str> = if base_dir.is_empty() {
        vec![]
    } else {
        base_dir.split('/').filter(|s| !s.is_empty()).collect()
    };
    for seg in href.split('/') {
        match seg {
            "" | "." => {}
            ".." => { parts.pop(); }
            _ => parts.push(seg),
        }
    }
    parts.join("/")
}

fn resolve_resource_href(source_dir: &str, raw_url: &str, opf_dir: &str) -> String {
    let zip_path = resolve_relative_path(source_dir, raw_url);
    if opf_dir.is_empty() {
        zip_path
    } else {
        let prefix = format!("{}/", opf_dir);
        zip_path.strip_prefix(&prefix).map(|s| s.to_string()).unwrap_or(zip_path)
    }
}

fn find_cache_key(resource_rel_opf: &str, resource_map: &HashMap<String, String>) -> Option<String> {
    if let Some(k) = resource_map.get(resource_rel_opf) {
        return Some(k.clone());
    }
    let filename = resource_rel_opf.rsplit('/').next().unwrap_or("");
    if filename.is_empty() { return None; }
    resource_map.iter().find(|(k, _)| k.ends_with(filename)).map(|(_, v)| v.clone())
}

fn guess_resource_mime(bytes: &[u8], filename: &str) -> &'static str {
    if bytes.len() >= 4 {
        if bytes[0..4] == [0x77, 0x4F, 0x46, 0x46] { return "font/woff" }
        if bytes[0..4] == [0x77, 0x4F, 0x46, 0x32] { return "font/woff2" }
        if bytes[0..4] == [0x4F, 0x54, 0x54, 0x4F] { return "font/otf" }
        if bytes[0..4] == [0x00, 0x01, 0x00, 0x00] { return "font/ttf" }
        if bytes[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png" }
        if bytes[0..4] == [0x47, 0x49, 0x46, 0x38] { return "image/gif" }
        if bytes[0..4] == [0x52, 0x49, 0x46, 0x46] { return "image/webp" }
        if bytes[0..4] == [0x3C, 0x73, 0x76, 0x67] { return "image/svg+xml" }
    }
    if bytes.len() >= 2 && bytes[0..2] == [0xFF, 0xD8] { return "image/jpeg" }
    let lower = filename.to_lowercase();
    if lower.ends_with(".woff2") { return "font/woff2" }
    if lower.ends_with(".woff") { return "font/woff" }
    if lower.ends_with(".ttf") { return "font/ttf" }
    if lower.ends_with(".otf") { return "font/otf" }
    if lower.ends_with(".svg") { return "image/svg+xml" }
    if lower.ends_with(".png") { return "image/png" }
    if lower.ends_with(".gif") { return "image/gif" }
    if lower.ends_with(".webp") { return "image/webp" }
    "image/jpeg"
}

// ─── 资源 → epub:// URL ───
//
// 不再内联为 data URL，改为返回 epub:// 自定义协议 URL。
//
// URL 格式：epub://epub/<book_id>/<md5>
// - host 固定为 "epub"（Tauri 在 Windows 上会转成 http://epub.localhost/...，
//   但 path 保留，所以协议处理器只看 path）
// - book_id 是 32 位 hex（解析阶段生成的 md5）
// - md5 是资源文件内容在 resources/ 目录下的文件名（32 位 hex）
//
// 安全：协议处理器只接受 32 位 hex 的 book_id 和 md5，物理上无法路径穿越。

fn resolve_to_epub_url(
    raw: &str,
    source_dir: &str,
    opf_dir: &str,
    book_id: &str,
    resource_map: &HashMap<String, String>,
) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty()
        || raw.starts_with("data:")
        || raw.starts_with("http://")
        || raw.starts_with("https://")
        || raw.starts_with("//")
        || raw.starts_with("#")
        || raw.starts_with("blob:")
        || raw.starts_with("epub:")
    {
        return None;
    }
    let url_clean = raw.split('#').next().unwrap_or(raw).trim();
    if url_clean.is_empty() { return None; }
    let rel_opf = resolve_resource_href(source_dir, url_clean, opf_dir);
    let cache_key = find_cache_key(&rel_opf, resource_map)?;
    // Windows WebView2 只允许 http/https/data 等白名单 scheme 做跨 origin 加载，
    // epub: 会被 CORS 直接拦死。Tauri 2.x 在 Windows 上把注册的自定义协议
    // 映射成 http://<scheme>.localhost/...，所以这里必须生成 http://epub.localhost/...
    Some(format!("http://epub.localhost/{}/{}", book_id, cache_key))
}

// ─── CSS url() 重写 ───

fn rewrite_css_urls(
    css: &str,
    css_zip_path: &str,
    opf_dir: &str,
    book_id: &str,
    resource_map: &HashMap<String, String>,
) -> String {
    use regex::Regex;
    let css_dir = css_zip_path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
    let Ok(re) = Regex::new(CSS_URL_RE) else { return css.to_string(); };
    re.replace_all(css, |caps: &regex::Captures| {
        // 修复：三个捕获组依次对应双引号内、单引号内、无引号。
        let (raw, quote) = if let Some(m) = caps.get(1) {
            (m.as_str(), "\"")
        } else if let Some(m) = caps.get(2) {
            (m.as_str(), "'")
        } else if let Some(m) = caps.get(3) {
            (m.as_str(), "")
        } else {
            return caps[0].to_string();
        };
        let raw_trimmed = raw.trim();
        match resolve_to_epub_url(raw_trimmed, css_dir, opf_dir, book_id, resource_map) {
            Some(url) => format!("url({}{}{})", quote, url, quote),
            None => caps[0].to_string(),
        }
    }).to_string()
}

// ─── CSS @import 递归展开 ───
//
// css_zip_paths 存「完整 zip 路径」（如 "OEBPS/Styles/style.css"）。
// @import 的 href 相对当前 CSS，必须先算完整 zip 路径再比较。

fn expand_imports<R: Read + Seek>(
    css: &str,
    css_zip_path: &str,
    opf_dir: &str,
    book_id: &str,
    resource_map: &HashMap<String, String>,
    archive: &mut zip::ZipArchive<R>,
    css_zip_paths: &HashSet<String>,
    visited: &mut HashSet<String>,
) -> String {
    use regex::Regex;
    let Ok(re) = Regex::new(IMPORT_RE) else { return css.to_string(); };

    let mut result = String::with_capacity(css.len());
    let mut last_end = 0usize;

    for cap in re.captures_iter(css) {
        let Some(whole) = cap.get(0) else { continue };
        result.push_str(&css[last_end..whole.start()]);
        last_end = whole.end();

        let href = cap.get(2).or_else(|| cap.get(4))
            .map(|m| m.as_str().trim()).unwrap_or("");
        if href.is_empty() { continue; }
        let href_clean = href.split(['#', '?']).next().unwrap_or("").trim();
        if href_clean.is_empty() { continue; }

        let css_dir = css_zip_path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        let import_zip_path = resolve_relative_path(css_dir, href_clean);
        if !css_zip_paths.contains(&import_zip_path) { continue; }
        if !visited.insert(import_zip_path.clone()) { continue; }

        let Ok(inner_css) = read_zip_entry(archive, &import_zip_path) else { continue; };
        let expanded = process_css_deep(
            &inner_css, &import_zip_path, opf_dir, book_id, resource_map,
            archive, css_zip_paths, visited,
        );
        result.push_str(&expanded);
    }
    result.push_str(&css[last_end..]);
    result
}

// ─── CSS 净化 ───

fn sanitize_css(css: &str) -> String {
    use regex::Regex;
    let mut out = css.to_string();
    if let Ok(re) = Regex::new(r#"@import\s+[^;]+;"#) {
        out = re.replace_all(&out, "").to_string();
    }
    if let Ok(re) = Regex::new(r#"url\(\s*['"]?(?:https?:)?//[^)]*['"]?\s*\)"#) {
        out = re.replace_all(&out, "none").to_string();
    }
    if let Ok(re) = Regex::new(r#"expression\s*\([^)]*\)"#) {
        out = re.replace_all(&out, "none").to_string();
    }
    if let Ok(re) = Regex::new(r#"(?:behavior|-moz-binding)\s*:\s*[^;]+;"#) {
        out = re.replace_all(&out, "").to_string();
    }
    out
}

fn process_css_deep<R: Read + Seek>(
    css: &str,
    css_zip_path: &str,
    opf_dir: &str,
    book_id: &str,
    resource_map: &HashMap<String, String>,
    archive: &mut zip::ZipArchive<R>,
    css_zip_paths: &HashSet<String>,
    visited: &mut HashSet<String>,
) -> String {
    let expanded = expand_imports(
        css, css_zip_path, opf_dir, book_id, resource_map,
        archive, css_zip_paths, visited,
    );
    let with_urls = rewrite_css_urls(&expanded, css_zip_path, opf_dir, book_id, resource_map);
    sanitize_css(&with_urls)
}

// ─── XHTML 里 <style> / <link> 提取与移除 ───

fn extract_styles(xhtml: &str) -> Vec<String> {
    use regex::Regex;
    let mut out = Vec::new();
    let Ok(re) = Regex::new(r#"(?is)<style\b[^>]*>(.*?)</style>"#) else { return out; };
    for cap in re.captures_iter(xhtml) {
        if let Some(c) = cap.get(1) { out.push(c.as_str().to_string()); }
    }
    out
}

fn strip_style_tags(xhtml: &str) -> String {
    use regex::Regex;
    if let Ok(re) = Regex::new(r#"(?is)<style\b[^>]*>.*?</style>"#) {
        return re.replace_all(xhtml, "").to_string();
    }
    xhtml.to_string()
}

fn extract_link_stylesheets(xhtml: &str) -> Vec<String> {
    use regex::Regex;
    let mut hrefs = Vec::new();
    let Ok(re) = Regex::new(r#"(?is)<link\b([^>]*?)/?>"#) else { return hrefs; };
    let Ok(rel_re) = Regex::new(r#"(?i)\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))"#) else { return hrefs; };
    let Ok(href_re) = Regex::new(r#"(?i)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))"#) else { return hrefs; };

    for cap in re.captures_iter(xhtml) {
        let Some(attrs) = cap.get(1) else { continue };
        let attrs = attrs.as_str();
        let is_stylesheet = rel_re.captures_iter(attrs).any(|c| {
            let v = c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3))
                .map(|m| m.as_str()).unwrap_or("");
            v.split_whitespace().any(|p| p.eq_ignore_ascii_case("stylesheet"))
        });
        if !is_stylesheet { continue; }
        if let Some(hc) = href_re.captures(attrs) {
            let href = hc.get(1).or_else(|| hc.get(2)).or_else(|| hc.get(3))
                .map(|m| m.as_str()).unwrap_or("");
            if !href.is_empty() { hrefs.push(href.to_string()); }
        }
    }
    hrefs
}

fn strip_link_stylesheets(xhtml: &str) -> String {
    use regex::Regex;
    let Ok(re) = Regex::new(r#"(?is)<link\b([^>]*?)/?>"#) else { return xhtml.to_string(); };
    let Ok(rel_re) = Regex::new(r#"(?i)\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))"#) else { return xhtml.to_string(); };
    re.replace_all(xhtml, |caps: &regex::Captures| {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let is_stylesheet = rel_re.captures_iter(attrs).any(|c| {
            let v = c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3))
                .map(|m| m.as_str()).unwrap_or("");
            v.split_whitespace().any(|p| p.eq_ignore_ascii_case("stylesheet"))
        });
        if is_stylesheet { String::new() } else { caps[0].to_string() }
    }).to_string()
}

// ─── XHTML 里媒体引用重写 ───

fn rewrite_html_media_refs(
    xhtml: &str,
    chapter_zip_path: &str,
    opf_dir: &str,
    book_id: &str,
    resource_map: &HashMap<String, String>,
) -> String {
    use regex::Regex;
    let chapter_dir = chapter_zip_path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");

    // 1. src / data-src / ... / poster
    let re_attr = Regex::new(URL_ATTR_RE).ok();
    let step1 = if let Some(re) = re_attr {
        re.replace_all(xhtml, |caps: &regex::Captures| {
            let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let raw = caps.get(2).map(|m| m.as_str())
                .or_else(|| caps.get(3).map(|m| m.as_str()))
                .unwrap_or("");
            match resolve_to_epub_url(raw, chapter_dir, opf_dir, book_id, resource_map) {
                Some(url) => format!("{}=\"{}\"", name, url),
                None => caps[0].to_string(),
            }
        }).to_string()
    } else {
        xhtml.to_string()
    };

    // 2. srcset
    let re_srcset = Regex::new(SRCSET_RE).ok();
    let step2 = if let Some(re) = re_srcset {
        re.replace_all(&step1, |caps: &regex::Captures| {
            let raw = caps.get(1).map(|m| m.as_str())
                .or_else(|| caps.get(2).map(|m| m.as_str()))
                .unwrap_or("");
            let parts: Vec<String> = raw.split(',').map(|part| {
                let part = part.trim();
                if part.is_empty() { return part.to_string(); }
                let mut iter = part.splitn(2, char::is_whitespace);
                let url = iter.next().unwrap_or("").trim();
                let desc = iter.next().unwrap_or("").trim();
                match resolve_to_epub_url(url, chapter_dir, opf_dir, book_id, resource_map) {
                    Some(new_url) if !desc.is_empty() => format!("{} {}", new_url, desc),
                    Some(new_url) => new_url,
                    None => part.to_string(),
                }
            }).collect();
            format!("srcset=\"{}\"", parts.join(", "))
        }).to_string()
    } else {
        step1
    };

    // 3. <image> href / xlink:href
    let re_image_tag = Regex::new(IMG_TAG_RE).ok();
    let step3 = if let Some(re_tag) = re_image_tag {
        let re_href = Regex::new(IMAGE_HREF_RE).ok();
        re_tag.replace_all(&step2, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let new_attrs = if let Some(re_h) = &re_href {
                re_h.replace_all(attrs, |c: &regex::Captures| {
                    let name = c.get(1).map(|m| m.as_str()).unwrap_or("");
                    let raw = c.get(2).map(|m| m.as_str())
                        .or_else(|| c.get(3).map(|m| m.as_str()))
                        .unwrap_or("");
                    match resolve_to_epub_url(raw, chapter_dir, opf_dir, book_id, resource_map) {
                        Some(url) => format!("{}=\"{}\"", name, url),
                        None => c[0].to_string(),
                    }
                }).to_string()
            } else {
                attrs.to_string()
            };
            format!("<image{}/>", new_attrs)
        }).to_string()
    } else {
        step2
    };

    // 4. <a href="..."> —— 用 data-epub-href 保留原值，href 置为 # 阻止 iframe 内导航
    let re_anchor = Regex::new(ANCHOR_HREF_RE).ok();
    let step4 = if let Some(re) = re_anchor {
        re.replace_all(&step3, |caps: &regex::Captures| {
            let before = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let href = caps.get(2).map(|m| m.as_str())
                .or_else(|| caps.get(3).map(|m| m.as_str()))
                .unwrap_or("");
            let after = caps.get(4).map(|m| m.as_str()).unwrap_or("");

            let safe_href = sanitize_anchor_href(href);

            format!(
                "<a{}data-epub-href=\"{}\" href=\"#\"{}>",
                before,
                html_escape_attr(&safe_href),
                after,
            )
        }).to_string()
    } else {
        step3
    };

    // 5. style 属性里的 url()
    let re_style = Regex::new(STYLE_ATTR_RE).ok();
    if let Some(re) = re_style {
        re.replace_all(&step4, |caps: &regex::Captures| {
            let raw = caps.get(1).map(|m| m.as_str())
                .or_else(|| caps.get(2).map(|m| m.as_str()))
                .unwrap_or("");
            let rewritten = rewrite_css_urls(raw, chapter_zip_path, opf_dir, book_id, resource_map);
            format!("style=\"{}\"", rewritten)
        }).to_string()
    } else {
        step4
    }
}

/// 过滤 <a> 的 href：
/// - javascript: / data: / vbscript: → 返回空字符串（前端会忽略）
/// - 其他（含 # 锚点、相对路径、http(s)）→ 原样返回
fn sanitize_anchor_href(href: &str) -> String {
    let lower = href.trim().to_lowercase();
    if lower.starts_with("javascript:")
        || lower.starts_with("data:")
        || lower.starts_with("vbscript:")
    {
        return String::new();
    }
    href.trim().to_string()
}

/// 简单的 HTML 属性转义（用于 data-epub-href 值）。
fn html_escape_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

// ─── container.xml / OPF / NCX / nav ───

fn parse_container_xml(xml: &str) -> Result<String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                if e.local_name().as_ref() == b"rootfile" {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"full-path" {
                            return Ok(String::from_utf8_lossy(&attr.value).to_string());
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(crate::error::AbyssError::ParseError(format!("container.xml 解析失败: {}", e))),
            _ => {}
        }
        buf.clear();
    }
    Err(crate::error::AbyssError::ParseError("container.xml 里找不到 rootfile".into()))
}

fn extract_item_attrs(e: &quick_xml::events::BytesStart) -> (String, String, String, String) {
    let mut id = String::new();
    let mut href = String::new();
    let mut media_type = String::new();
    let mut properties = String::new();
    for attr in e.attributes().flatten() {
        let v = String::from_utf8_lossy(&attr.value).to_string();
        match attr.key.as_ref() {
            b"id" => id = v,
            b"href" => href = v,
            b"media-type" => media_type = v,
            b"properties" => properties = v,
            _ => {}
        }
    }
    (id, href, media_type, properties)
}

fn extract_meta_attrs(e: &quick_xml::events::BytesStart) -> (String, String, String) {
    let mut name = String::new();
    let mut content = String::new();
    let mut property = String::new();
    for attr in e.attributes().flatten() {
        let v = String::from_utf8_lossy(&attr.value).to_string();
        match attr.key.as_ref() {
            b"name" => name = v,
            b"content" => content = v,
            b"property" => property = v,
            _ => {}
        }
    }
    (name, content, property)
}

fn is_real_cover_image(properties: &str, media_type: &str) -> bool {
    if !media_type.starts_with("image/") {
        return false;
    }
    properties.split_whitespace().any(|p| p == "cover-image")
}

fn is_cover_meta(name: &str, property: &str) -> bool {
    if name.eq_ignore_ascii_case("cover") {
        return true;
    }
    property.split_whitespace().any(|p| p == "cover-image")
}

fn resolve_cover_id(
    raw_content: &str,
    opf_dir: &str,
    manifest: &HashMap<String, ManifestItem>,
) -> Option<String> {
    let target = raw_content.trim();
    if target.is_empty() {
        return None;
    }

    if let Some(item) = manifest.get(target) {
        if item.media_type.starts_with("image/") {
            return Some(target.to_string());
        }
    }

    let normalized_target = resolve_relative_path(opf_dir, target);
    for (id, item) in manifest {
        if !item.media_type.starts_with("image/") {
            continue;
        }
        let item_full = resolve_relative_path(opf_dir, &item.href);
        if item_full == normalized_target {
            return Some(id.clone());
        }
    }

    let target_filename = target.rsplit('/').next().unwrap_or(target);
    for (id, item) in manifest {
        if !item.media_type.starts_with("image/") {
            continue;
        }
        let item_filename = item.href.rsplit('/').next().unwrap_or(&item.href);
        if item_filename == target_filename {
            return Some(id.clone());
        }
    }

    None
}

fn find_fallback_cover(manifest: &HashMap<String, ManifestItem>) -> Option<String> {
    let mut first_image: Option<String> = None;
    for (id, item) in manifest {
        if !item.media_type.starts_with("image/") {
            continue;
        }
        if first_image.is_none() {
            first_image = Some(id.clone());
        }
        let filename = item.href.rsplit('/').next().unwrap_or(&item.href).to_lowercase();
        if filename.contains("cover") {
            return Some(id.clone());
        }
    }
    first_image
}

fn parse_opf(xml: &str, opf_path: &str) -> Result<OpfData> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    let opf_dir = opf_path.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut in_metadata = false;
    let mut title = String::new();
    let mut author = String::new();
    let mut publisher = None;
    let mut language = None;
    let mut description = None;
    let mut identifier = None;
    let mut manifest: HashMap<String, ManifestItem> = HashMap::new();
    let mut spine: Vec<String> = Vec::new();
    let mut current_text_tag: Option<Vec<u8>> = None;
    let mut current_text = String::new();

    let mut meta_cover_raw: Option<String> = None;
    let mut property_cover_id: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.local_name().as_ref().to_vec();
                match name.as_slice() {
                    b"metadata" => in_metadata = true,
                    b"item" if !in_metadata => {
                        let (id, href, media_type, properties) = extract_item_attrs(e);
                        if !id.is_empty() {
                            manifest.insert(id.clone(), ManifestItem {
                                href: href.clone(), media_type: media_type.clone(),
                                properties: if properties.is_empty() { None } else { Some(properties.clone()) },
                            });
                            if property_cover_id.is_none()
                                && is_real_cover_image(&properties, &media_type)
                            {
                                property_cover_id = Some(id);
                            }
                        }
                    }
                    b"itemref" => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"idref" {
                                let v = String::from_utf8_lossy(&attr.value).to_string();
                                if !v.is_empty() { spine.push(v); }
                            }
                        }
                    }
                    b"meta" if in_metadata => {
                        let (n, c, p) = extract_meta_attrs(e);
                        if meta_cover_raw.is_none() && !c.is_empty() && is_cover_meta(&n, &p) {
                            meta_cover_raw = Some(c);
                        }
                    }
                    _ if in_metadata => {
                        current_text_tag = Some(name);
                        current_text.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let name = e.local_name().as_ref().to_vec();
                match name.as_slice() {
                    b"item" if !in_metadata => {
                        let (id, href, media_type, properties) = extract_item_attrs(e);
                        if !id.is_empty() {
                            manifest.insert(id.clone(), ManifestItem {
                                href: href.clone(), media_type: media_type.clone(),
                                properties: if properties.is_empty() { None } else { Some(properties.clone()) },
                            });
                            if property_cover_id.is_none()
                                && is_real_cover_image(&properties, &media_type)
                            {
                                property_cover_id = Some(id);
                            }
                        }
                    }
                    b"itemref" => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"idref" {
                                let v = String::from_utf8_lossy(&attr.value).to_string();
                                if !v.is_empty() { spine.push(v); }
                            }
                        }
                    }
                    b"meta" if in_metadata => {
                        let (n, c, p) = extract_meta_attrs(e);
                        if meta_cover_raw.is_none() && !c.is_empty() && is_cover_meta(&n, &p) {
                            meta_cover_raw = Some(c);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if current_text_tag.is_some() {
                    if let Ok(s) = e.unescape() { current_text.push_str(&s); }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.local_name().as_ref().to_vec();
                if name.as_slice() == b"metadata" { in_metadata = false; }
                if let Some(ref tag) = current_text_tag {
                    if tag.as_slice() == name.as_slice() {
                        let text = current_text.trim().to_string();
                        match tag.as_slice() {
                            b"title" => title = text,
                            b"creator" => { if author.is_empty() { author = text; } }
                            b"publisher" => publisher = Some(text),
                            b"language" => language = Some(text),
                            b"description" => description = Some(text),
                            b"identifier" => { if identifier.is_none() { identifier = Some(text); } }
                            _ => {}
                        }
                        current_text_tag = None;
                        current_text.clear();
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(crate::error::AbyssError::ParseError(format!("OPF 解析失败: {}", e))),
            _ => {}
        }
        buf.clear();
    }

    let mut cover_id: Option<String> = None;
    if let Some(ref raw) = meta_cover_raw {
        if let Some(resolved) = resolve_cover_id(raw, &opf_dir, &manifest) {
            cover_id = Some(resolved);
        }
    }
    if cover_id.is_none() {
        cover_id = property_cover_id;
    }
    if cover_id.is_none() {
        cover_id = find_fallback_cover(&manifest);
    }

    Ok(OpfData {
        metadata: EpubMetadata {
            title: if title.is_empty() { "未命名".into() } else { title },
            author: if author.is_empty() { "未知作者".into() } else { author },
            publisher, language, description, identifier,
        },
        manifest, spine, cover_id, opf_dir,
    })
}

fn parse_ncx_titles(xml: &str) -> HashMap<String, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    let mut map = HashMap::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut in_navpoint = false;
    let mut current_label = String::new();
    let mut current_src = String::new();
    let mut in_label = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.local_name().as_ref() {
                b"navPoint" => { in_navpoint = true; current_label.clear(); current_src.clear(); }
                b"text" if in_navpoint => in_label = true,
                _ => {}
            },
            Ok(Event::Empty(ref e)) => {
                if e.local_name().as_ref() == b"content" && in_navpoint {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"src" {
                            current_src = String::from_utf8_lossy(&attr.value).split('#').next().unwrap_or("").to_string();
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_label { if let Ok(s) = e.unescape() { current_label.push_str(&s); } }
            }
            Ok(Event::End(ref e)) => match e.local_name().as_ref() {
                b"text" => in_label = false,
                b"navPoint" => {
                    if in_navpoint && !current_src.is_empty() && !current_label.is_empty() {
                        map.insert(current_src.clone(), current_label.trim().to_string());
                    }
                    in_navpoint = false;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            _ => {}
        }
        buf.clear();
    }
    map
}

fn parse_nav_xhtml(xml: &str) -> HashMap<String, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;
    let mut map = HashMap::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut in_toc_nav = false;
    let mut in_a = false;
    let mut current_href = String::new();
    let mut current_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                match e.local_name().as_ref() {
                    b"nav" => {
                        for attr in e.attributes().flatten() {
                            if String::from_utf8_lossy(attr.key.as_ref()).ends_with("type") {
                                let v = String::from_utf8_lossy(&attr.value).to_string();
                                if v.split_whitespace().any(|p| p == "toc") { in_toc_nav = true; }
                            }
                        }
                    }
                    b"a" if in_toc_nav => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"href" {
                                current_href = String::from_utf8_lossy(&attr.value).split('#').next().unwrap_or("").to_string();
                            }
                        }
                        in_a = true;
                        current_text.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_a { if let Ok(s) = e.unescape() { current_text.push_str(&s); } }
            }
            Ok(Event::End(ref e)) => match e.local_name().as_ref() {
                b"nav" => in_toc_nav = false,
                b"a" if in_a => {
                    if !current_href.is_empty() && !current_text.trim().is_empty() {
                        map.insert(current_href.clone(), current_text.trim().to_string());
                    }
                    in_a = false;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            _ => {}
        }
        buf.clear();
    }
    map
}

// ─── 缓存目录 ───

fn get_epub_cache_dir(book_id: &str) -> PathBuf {
    crate::storage::cache::get_cache_root().join("epub").join(book_id)
}

// ─── 核心解析 ───

fn parse_epub_inner<R: Read + Seek>(reader: R, book_id_seed: &str) -> Result<EpubParseResult> {
    let book_id = crate::utils::md5_hex(book_id_seed.as_bytes());
    let cache_dir = get_epub_cache_dir(&book_id);
    std::fs::create_dir_all(&cache_dir)?;

    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("打开 EPUB 失败: {}", e)))?;

    let container_xml = read_zip_entry(&mut archive, "META-INF/container.xml")?;
    let opf_path = parse_container_xml(&container_xml)?;
    let opf_xml = read_zip_entry(&mut archive, &opf_path)?;
    let opf = parse_opf(&opf_xml, &opf_path)?;

    let resources_dir = cache_dir.join("resources");
    std::fs::create_dir_all(&resources_dir)?;
    let mut resource_map: HashMap<String, String> = HashMap::new();
    for item in opf.manifest.values() {
        let is_image = item.media_type.starts_with("image/");
        let is_font = FONT_MIMES.contains(&item.media_type.as_str());
        if !is_image && !is_font { continue; }
        let zip_path = resolve_relative_path(&opf.opf_dir, &item.href);
        let cache_name = crate::utils::md5_hex(item.href.as_bytes());
        let dest = resources_dir.join(&cache_name);
        if copy_zip_entry_to_file(&mut archive, &zip_path, &dest).is_ok() {
            resource_map.insert(item.href.clone(), cache_name);
        }
    }

    let mut toc_titles: HashMap<String, String> = HashMap::new();
    if let Some((_, ncx_item)) = opf.manifest.iter().find(|(_, v)| v.media_type == "application/x-dtbncx+xml") {
        let ncx_path = resolve_relative_path(&opf.opf_dir, &ncx_item.href);
        if let Ok(ncx_xml) = read_zip_entry(&mut archive, &ncx_path) {
            toc_titles = parse_ncx_titles(&ncx_xml);
        }
    }
    if toc_titles.is_empty() {
        if let Some((_, nav_item)) = opf.manifest.iter().find(|(_, v)| {
            v.properties.as_deref().map(|p| p.split_whitespace().any(|x| x == "nav")).unwrap_or(false)
                && XHTML_MIMES.contains(&v.media_type.as_str())
        }) {
            let nav_path = resolve_relative_path(&opf.opf_dir, &nav_item.href);
            if let Ok(nav_xml) = read_zip_entry(&mut archive, &nav_path) {
                toc_titles = parse_nav_xhtml(&nav_xml);
            }
        }
    }

    // css_zip_paths 存「完整 zip 路径」（如 "OEBPS/Styles/style.css"），
    // 与 <link> 归一化后的路径同基准。
    let css_zip_paths: HashSet<String> = opf.manifest.values()
        .filter(|v| v.media_type == "text/css")
        .map(|v| resolve_relative_path(&opf.opf_dir, &v.href))
        .collect();

    let chapters_dir = cache_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir)?;
    let mut chapters: Vec<EpubChapterInfo> = Vec::new();

    for (idx, idref) in opf.spine.iter().enumerate() {
        let Some(item) = opf.manifest.get(idref) else { continue };
        if !XHTML_MIMES.contains(&item.media_type.as_str()) { continue; }
        let zip_path = resolve_relative_path(&opf.opf_dir, &item.href);
        let Ok(raw) = read_zip_entry(&mut archive, &zip_path) else { continue };

        let mut collected_styles: Vec<String> = Vec::new();

        for href in extract_link_stylesheets(&raw) {
            let href_clean = href.split(['#', '?']).next().unwrap_or("").trim();
            if href_clean.is_empty() { continue; }
            // 修复：resolve_relative_path 的第一个参数是目录，不是文件路径。
            // zip_path 是 "OEBPS/Text/chapter001.html"，必须先取目录部分。
            let xhtml_dir = zip_path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
            let css_zip_path = resolve_relative_path(xhtml_dir, href_clean);
            if !css_zip_paths.contains(&css_zip_path) { continue; }
            if let Ok(css_content) = read_zip_entry(&mut archive, &css_zip_path) {
                let mut visited = HashSet::new();
                visited.insert(css_zip_path.clone());
                let processed = process_css_deep(
                    &css_content, &css_zip_path, &opf.opf_dir,
                    &book_id, &resource_map,
                    &mut archive, &css_zip_paths, &mut visited,
                );
                if !processed.trim().is_empty() { collected_styles.push(processed); }
            }
        }

        for s in extract_styles(&raw) {
            let mut visited = HashSet::new();
            visited.insert(zip_path.clone());
            let processed = process_css_deep(
                &s, &zip_path, &opf.opf_dir,
                &book_id, &resource_map,
                &mut archive, &css_zip_paths, &mut visited,
            );
            if !processed.trim().is_empty() { collected_styles.push(processed); }
        }

        let without_style = strip_style_tags(&raw);
        let without_link = strip_link_stylesheets(&without_style);
        let final_html = rewrite_html_media_refs(
            &without_link, &zip_path, &opf.opf_dir, &book_id, &resource_map,
        );

        let cache_name = format!("{:04}.xhtml", idx);
        std::fs::write(chapters_dir.join(&cache_name), &final_html)?;

        if !collected_styles.is_empty() {
            let style_name = format!("{:04}.css", idx);
            std::fs::write(chapters_dir.join(&style_name), collected_styles.join("\n\n"))?;
        }

        let title = toc_titles.get(&item.href).cloned()
            .or_else(|| extract_xhtml_title(&raw))
            .unwrap_or_else(|| format!("第 {} 章", idx + 1));

        chapters.push(EpubChapterInfo { index: idx, title, href: item.href.clone(), cached_path: cache_name });
    }

    // 封面：保持 data URL（列表页/详情页也要用，那里没有 iframe，走不了 epub://）
    let cover_data_url = opf.cover_id.as_ref().and_then(|cid| {
        let item = opf.manifest.get(cid)?;
        if !item.media_type.starts_with("image/") {
            return None;
        }
        let href = resolve_relative_path(&opf.opf_dir, &item.href);
        let bytes = read_zip_entry_bytes(&mut archive, &href).ok()?;
        let mime = guess_resource_mime(&bytes, &href);
        if !mime.starts_with("image/") {
            return None;
        }
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Some(format!("data:{};base64,{}", mime, b64))
    });

    let chapters_json = serde_json::to_string(&chapters)?;
    std::fs::write(cache_dir.join("chapters.json"), chapters_json)?;

    let chapter_count = chapters.len();
    Ok(EpubParseResult {
        book_id, metadata: opf.metadata, chapters, cover_data_url, chapter_count,
    })
}

fn extract_xhtml_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let after_tag = html[start..].find('>')? + start + 1;
    let end = lower[after_tag..].find("</title>")? + after_tag;
    let title = html[after_tag..end].trim().to_string();
    if title.is_empty() { None } else { Some(title) }
}

// ─── Tauri 命令 ───

#[tauri::command]
pub async fn parse_epub(path: String) -> Result<EpubParseResult> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(crate::error::AbyssError::IoError(format!("文件不存在: {}", path)));
    }
    let file = std::fs::File::open(&file_path)?;
    parse_epub_inner(file, &path)
}

#[tauri::command]
pub async fn parse_epub_bytes(name: String, data_base64: String) -> Result<EpubParseResult> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("base64 解码失败: {}", e)))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seed = format!("{}::{}", name, ts);
    parse_epub_inner(Cursor::new(data), &seed)
}

#[tauri::command]
pub async fn get_epub_chapters(book_id: String) -> Result<Vec<EpubChapterInfo>> {
    let cache_dir = get_epub_cache_dir(&book_id);
    let path = cache_dir.join("chapters.json");
    if !path.exists() { return Ok(Vec::new()); }
    let content = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&content)?)
}

#[tauri::command]
pub async fn get_epub_chapter(book_id: String, chapter_index: usize) -> Result<String> {
    let cache_dir = get_epub_cache_dir(&book_id);
    let cache_name = format!("{:04}.xhtml", chapter_index);
    let path = cache_dir.join("chapters").join(&cache_name);
    if !path.exists() {
        return Err(crate::error::AbyssError::ChapterNotFound(format!("{} 章节 {}", book_id, chapter_index)));
    }
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
pub async fn get_epub_chapter_css(book_id: String, chapter_index: usize) -> Result<String> {
    let cache_dir = get_epub_cache_dir(&book_id);
    let style_name = format!("{:04}.css", chapter_index);
    let path = cache_dir.join("chapters").join(&style_name);
    if !path.exists() { return Ok(String::new()); }
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
pub async fn clear_epub_cache(book_id: String) -> Result<usize> {
    let cache_dir = get_epub_cache_dir(&book_id);
    if !cache_dir.exists() { return Ok(0); }
    let mut count = 0;
    if let Ok(entries) = walk_dir(&cache_dir) {
        for p in entries {
            if std::fs::remove_file(&p).is_ok() { count += 1; }
        }
    }
    let _ = std::fs::remove_dir_all(&cache_dir);
    Ok(count)
}

fn walk_dir(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&d) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() { stack.push(p); } else { out.push(p); }
            }
        }
    }
    Ok(out)
}
