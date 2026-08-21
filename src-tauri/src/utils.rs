pub const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
pub const DEFAULT_MOBILE_UA: &str = "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.231 Mobile Safari/537.36";

pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 { format!("{} B", bytes) }
    else if bytes < 1024 * 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else if bytes < 1024 * 1024 * 1024 { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0)) }
}

pub fn detect_image_type(data: &[u8]) -> &str {
    if data.len() < 4 { return "image/webp"; }
    if data[0..2] == [0xFF, 0xD8] { return "image/jpeg"; }
    if data[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png"; }
    "image/webp"
}
