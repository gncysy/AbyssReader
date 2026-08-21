use crate::error::{AbyssError, Result};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::Mutex;
use reqwest::Method;

struct CachedClient {
    client: Client,
    created_at: std::time::Instant,
}

// 修复：缓存 key 包含域名+超时时间，不同超时要求使用不同 Client
static CLIENT_CACHE: LazyLock<Mutex<HashMap<String, CachedClient>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

const CLIENT_CACHE_TTL_SECS: u64 = 600; // 10 分钟

fn get_cache_key(domain: &str, timeout: u64) -> String {
    format!("{}:{}", domain, timeout)
}

fn is_blocked_host(hostname: &str) -> bool {
    let blocked = ["127.0.0.1", "localhost", "::1", "0.0.0.0", "localhost."];
    if blocked.contains(&hostname.to_lowercase().as_str()) {
        return true;
    }
    if let Some(ipv4_part) = hostname.strip_prefix("::ffff:") {
        return is_blocked_ipv4(ipv4_part);
    }
    if let Ok(addr) = hostname.parse::<std::net::Ipv4Addr>() {
        return is_blocked_ipv4(&addr.to_string());
    }
    if let Ok(addr) = hostname.parse::<std::net::Ipv6Addr>() {
        let octets = addr.octets();
        if octets.iter().all(|&b| b == 0) || (octets[0] == 0 && octets[1] == 0 && octets[15] == 1) {
            return true;
        }
        // 修复：IPv6 唯一本地地址 fc00::/7 和链路本地 fe80::/10
        if octets[0] & 0xfe == 0xfc || octets[0] & 0xfe == 0xfe && octets[1] & 0xc0 == 0x80 {
            return true;
        }
        if octets[0] == 0 && octets[1] == 0 && octets[2] == 0 && octets[3] == 0 &&
           octets[4] == 0 && octets[5] == 0 && octets[6] == 0 && octets[7] == 0 &&
           octets[8] == 0 && octets[9] == 0 && octets[10] == 0xff && octets[11] == 0xff {
            let ipv4 = format!("{}.{}.{}.{}", octets[12], octets[13], octets[14], octets[15]);
            return is_blocked_ipv4(&ipv4);
        }
    }
    false
}

fn is_blocked_ipv4(ip: &str) -> bool {
    if let Ok(addr) = ip.parse::<std::net::Ipv4Addr>() {
        let octets = addr.octets();
        if octets[0] == 127 || octets[0] == 10 {
            return true;
        }
        if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 {
            return true;
        }
        if octets[0] == 192 && octets[1] == 168 {
            return true;
        }
        if octets[0] == 169 && octets[1] == 254 {
            return true;
        }
        if octets[0] == 0 {
            return true;
        }
        // 修复：100.64.0.0/10 运营商级 NAT
        if octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127 {
            return true;
        }
    }
    false
}

fn clean_url(url: &str) -> String {
    url.trim()
        .replace('\n', "")
        .replace('\r', "")
        .replace('\t', "")
}

pub fn get_sub_domain(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or(url).to_string();
        if host.parse::<std::net::Ipv4Addr>().is_ok() || host.parse::<std::net::Ipv6Addr>().is_ok() {
            return host;
        }
        let parts: Vec<&str> = host.split('.').collect();
        if parts.len() <= 2 {
            return host;
        }
        parts[parts.len() - 2..].join(".")
    } else {
        url.to_string()
    }
}

pub fn load_cookies_to_headers(url: &str, headers: &mut HashMap<String, String>) {
    let domain = get_sub_domain(url);
    let cookie = crate::js_runtime::ops::storage::get_cookie_internal(&domain, "");
    if cookie.is_empty() {
        return;
    }
    let existing = headers.get("Cookie").cloned().unwrap_or_default();
    let merged = if existing.is_empty() {
        cookie
    } else {
        format!("{}; {}", existing, cookie)
    };
    headers.insert("Cookie".to_string(), merged);
}

pub fn save_cookies_from_response(url: &str, response_headers: &HashMap<String, String>) {
    let set_cookie = response_headers
        .get("set-cookie")
        .or_else(|| response_headers.get("Set-Cookie"));
    if let Some(cookie_str) = set_cookie {
        let domain = get_sub_domain(url);
        crate::js_runtime::ops::storage::set_cookie_internal(&domain, cookie_str);
    }
}

pub async fn execute_http_request(
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    charset: Option<String>,
    timeout_secs: u64,
) -> Result<String> {
    let cleaned_url = clean_url(url);
    crate::js_runtime::ops::emit_log(
        "info",
        &format!("[http] 请求开始: {} {}", method, cleaned_url),
    );

    let parsed = url::Url::parse(&cleaned_url).map_err(|e| {
        AbyssError::ConfigError(format!("无效 URL: {} -> {}", cleaned_url, e))
    })?;

    if let Some(host) = parsed.host_str() {
        if is_blocked_host(host) {
            return Err(AbyssError::ConfigError(format!("禁止访问内网地址: {}", host)));
        }
    }

    let domain = parsed.host_str().unwrap_or("default").to_string();
    let timeout = if timeout_secs == 0 { 30 } else { timeout_secs };
    let ua = crate::js_runtime::ops::get_ua();
    let ua = if ua.is_empty() {
        crate::utils::DEFAULT_UA
    } else {
        &ua
    };

    let cache_key = get_cache_key(&domain, timeout);

    let client = {
        let mut cache = CLIENT_CACHE.lock().await;

        // 检查是否有有效缓存
        if let Some(cached) = cache.get(&cache_key) {
            if cached.created_at.elapsed().as_secs() < CLIENT_CACHE_TTL_SECS {
                cached.client.clone()
            } else {
                // 过期，重建
                let new_client = build_client(ua, timeout);
                cache.insert(cache_key.clone(), CachedClient {
                    client: new_client.clone(),
                    created_at: std::time::Instant::now(),
                });
                new_client
            }
        } else {
            let new_client = build_client(ua, timeout);
            cache.insert(cache_key.clone(), CachedClient {
                client: new_client.clone(),
                created_at: std::time::Instant::now(),
            });
            new_client
        }
    };

    let method_upper = method.to_uppercase();
    let mut req = match method_upper.as_str() {
        "POST" => client.post(parsed.as_str()),
        "PUT" => client.put(parsed.as_str()),
        "DELETE" => client.delete(parsed.as_str()),
        "PROPFIND" => client.request(
            Method::from_bytes(b"PROPFIND").unwrap_or(Method::GET),
            parsed.as_str(),
        ),
        _ => client.get(parsed.as_str()),
    };

    req = req
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");

    let mut final_headers = headers.unwrap_or_default();
    load_cookies_to_headers(&cleaned_url, &mut final_headers);

    for (k, v) in &final_headers {
        req = req.header(k.as_str(), v.as_str());
    }

    if let Some(b) = &body {
        req = req
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(b.clone());
    }

    let start = std::time::Instant::now();
    let response = req.send().await.map_err(|e| {
        AbyssError::NetworkError(e.to_string())
    })?;

    let elapsed = start.elapsed().as_millis();
    let status = response.status().as_u16();

    let resp_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    save_cookies_from_response(&cleaned_url, &resp_headers);

    if status < 200 || status >= 300 {
        return Err(AbyssError::NetworkError(format!("HTTP {}", status)));
    }

    let bytes = response.bytes().await.map_err(|e| {
        AbyssError::NetworkError(e.to_string())
    })?;

    let content = if let Some(charset_name) = &charset {
        if charset_name == "escape" {
            String::from_utf8_lossy(&bytes).into_owned()
        } else {
            let encoding = encoding_rs::Encoding::for_label(charset_name.as_bytes())
                .unwrap_or(encoding_rs::UTF_8);
            let (decoded, _, _) = encoding.decode(&bytes);
            decoded.into_owned()
        }
    } else {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        if preview.to_lowercase().contains("charset=gbk")
            || preview.to_lowercase().contains("charset=gb2312")
        {
            let encoding = encoding_rs::Encoding::for_label(b"gbk").unwrap_or(encoding_rs::UTF_8);
            let (decoded, _, _) = encoding.decode(&bytes);
            decoded.into_owned()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    crate::js_runtime::ops::emit_log(
        "info",
        &format!(
            "[http] 完成: {} ({}ms, {} 字节)",
            cleaned_url,
            elapsed,
            content.len()
        ),
    );
    Ok(content)
}

fn build_client(ua: &str, timeout: u64) -> Client {
    Client::builder()
        .user_agent(ua)
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(timeout))
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub fn execute_http_request_blocking(
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    charset: Option<String>,
    timeout_secs: u64,
) -> Result<String> {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            tokio::task::block_in_place(|| {
                handle.block_on(execute_http_request(
                    url, method, headers, body, charset, timeout_secs,
                ))
            })
        }
        Err(_) => {
            let rt = tokio::runtime::Runtime::new()
                .map_err(|e| AbyssError::NetworkError(e.to_string()))?;
            rt.block_on(execute_http_request(
                url, method, headers, body, charset, timeout_secs,
            ))
        }
    }
}
