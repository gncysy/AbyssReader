use deno_core::op2;
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::Mutex;

struct RateLimitRecord {
    time: i64,
    access_limit: i32,
    interval: i64,
    frequency: i32,
}

static RATE_LIMITER: LazyLock<Mutex<HashMap<String, Mutex<RateLimitRecord>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const RATE_LIMIT_PER_SECOND: i32 = 3;
const DEFAULT_RATE_INTERVAL: i64 = 1000;

fn is_blocked_host(hostname: &str) -> bool {
    let blocked = ["127.0.0.1", "localhost", "::1", "0.0.0.0"];
    if blocked.contains(&hostname) {
        return true;
    }
    if let Ok(addr) = hostname.parse::<std::net::Ipv4Addr>() {
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
    }
    false
}

fn parse_concurrent_rate(rate: &str) -> Option<(i32, i64)> {
    if rate.is_empty() || rate == "0" {
        return None;
    }
    if let Some(slash_idx) = rate.find('/') {
        let access_limit: i32 = rate[..slash_idx].trim().parse().ok()?;
        let interval: i64 = rate[slash_idx + 1..].trim().parse().ok()?;
        if access_limit <= 0 || interval <= 0 {
            return None;
        }
        Some((access_limit, interval))
    } else {
        let interval: i64 = rate.trim().parse().ok()?;
        if interval <= 0 {
            return None;
        }
        Some((1, interval))
    }
}

/// 计算需要等待的毫秒数，由调用方异步 sleep
fn calculate_rate_limit_wait(url: &str, concurrent_rate: Option<&str>) -> u64 {
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".into());

    let (access_limit, interval) = concurrent_rate
        .and_then(|r| parse_concurrent_rate(r))
        .unwrap_or((RATE_LIMIT_PER_SECOND, DEFAULT_RATE_INTERVAL));

    let mut map = RATE_LIMITER.lock();
    let mutex = map.entry(host.clone()).or_insert_with(|| {
        Mutex::new(RateLimitRecord {
            time: 0,
            access_limit,
            interval,
            frequency: 0,
        })
    });

    {
        let mut record = mutex.lock();
        if record.access_limit != access_limit || record.interval != interval {
            record.access_limit = access_limit;
            record.interval = interval;
        }
    }

    let mut record = mutex.lock();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let next_time = record.time + record.interval;
    if now >= next_time {
        record.time = now;
        record.frequency = 1;
        0
    } else if record.frequency < record.access_limit {
        record.frequency += 1;
        0
    } else {
        (next_time - now) as u64
    }
}

fn clean_url(raw: &str) -> String {
    raw.trim()
        .replace('\n', "")
        .replace('\r', "")
        .replace('\t', "")
}

fn parse_ajax_url(raw: &str) -> (String, Option<String>, Option<HashMap<String, String>>, Option<String>, Option<String>) {
    let raw = clean_url(raw);
    let comma_brace_pos = raw.rfind(",{");
    if let Some(pos) = comma_brace_pos {
        let url = raw[..pos].to_string();
        let rest = &raw[pos + 1..];
        let fixed = rest
            .replace("\\\"", "\"")
            .replace('\u{200b}', "")
            .replace('\u{200c}', "")
            .replace('\u{200d}', "")
            .replace('\u{feff}', "")
            .replace('\u{2060}', "")
            .replace("{headers:", "{\"headers\":")
            .replace(",headers:", ",\"headers\":")
            .replace("{method:", "{\"method\":")
            .replace(",method:", ",\"method\":")
            .replace("{body:", "{\"body\":")
            .replace(",body:", ",\"body\":")
            .replace("{charset:", "{\"charset\":")
            .replace(",charset:", ",\"charset\":")
            .replace("{webView:", "{\"webView\":")
            .replace(",webView:", ",\"webView\":")
            .replace("{webJs:", "{\"webJs\":")
            .replace(",webJs:", ",\"webJs\":")
            .replace("{dnsIp:", "{\"dnsIp\":")
            .replace(",dnsIp:", ",\"dnsIp\":")
            .replace("{js:", "{\"js\":")
            .replace(",js:", ",\"js\":")
            .replace("{bodyJs:", "{\"bodyJs\":")
            .replace(",bodyJs:", ",\"bodyJs\":")
            .replace("{serverID:", "{\"serverID\":")
            .replace(",serverID:", ",\"serverID\":")
            .replace("{type:", "{\"type\":")
            .replace(",type:", ",\"type\":")
            .replace("{retry:", "{\"retry\":")
            .replace(",retry:", ",\"retry\":")
            .replace("{concurrentRate:", "{\"concurrentRate\":")
            .replace(",concurrentRate:", ",\"concurrentRate\":")
            .replace("{webViewDelayTime:", "{\"webViewDelayTime\":")
            .replace(",webViewDelayTime:", ",\"webViewDelayTime\":");

        let parsed = serde_json::from_str::<serde_json::Value>(&fixed).ok();
        let method = parsed
            .as_ref()
            .and_then(|v| v.get("method").and_then(|m| m.as_str()).map(|s| s.to_uppercase()));
        let headers = parsed
            .as_ref()
            .and_then(|v| v.get("headers").cloned())
            .and_then(|h| serde_json::from_str::<HashMap<String, String>>(&h.to_string()).ok());
        let body = parsed
            .as_ref()
            .and_then(|v| v.get("body").and_then(|b| {
                if b.is_string() {
                    Some(b.as_str().unwrap().to_string())
                } else {
                    Some(b.to_string())
                }
            }));
        let concurrent_rate = parsed
            .as_ref()
            .and_then(|v| v.get("concurrentRate").and_then(|r| r.as_str()).map(|s| s.to_string()));

        (url, method, headers, body, concurrent_rate)
    } else {
        (raw.to_string(), None, None, None, None)
    }
}

// 修复：async fn 自动被 op2 宏推断为异步，不需要 #[op2(async)]
#[op2]
#[string]
pub async fn op_java_ajax(#[string] url: String) -> String {
    let (req_url, method, headers, body, concurrent_rate) = parse_ajax_url(&url);

    if let Ok(parsed) = url::Url::parse(&req_url) {
        if let Some(host) = parsed.host_str() {
            if is_blocked_host(host) {
                return serde_json::json!({
                    "body": format!("error: 禁止访问内网地址: {}", host),
                    "url": req_url,
                    "headers": {},
                    "status": 403
                }).to_string();
            }
        }
    }
    if req_url.starts_with("file://") {
        return serde_json::json!({
            "body": "error: 禁止访问本地文件",
            "url": req_url,
            "headers": {},
            "status": 403
        }).to_string();
    }

    // 异步 sleep 替代同步 std::thread::sleep
    let wait_ms = calculate_rate_limit_wait(&req_url, concurrent_rate.as_deref());
    if wait_ms > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
    }

    let url_clone = req_url.clone();
    let method_clone = method.clone();
    let headers_clone = headers.clone();
    let body_clone = body.clone();

    crate::js_runtime::ops::common::with_blocking_client(move |client| {
        let mut req = if method_clone.as_deref() == Some("POST") {
            client.post(&url_clone)
        } else {
            client.get(&url_clone)
        };

        if let Some(h) = headers_clone {
            for (k, v) in h {
                req = req.header(k, v);
            }
        }

        if let Some(b) = body_clone {
            req = req.body(b);
        }

        match req.send() {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let final_url = resp.url().to_string();
                let resp_headers: HashMap<String, String> = resp
                    .headers()
                    .iter()
                    .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                    .collect();
                match resp.text() {
                    Ok(text) => {
                        serde_json::json!({
                            "body": text,
                            "url": final_url,
                            "headers": resp_headers,
                            "status": status
                        }).to_string()
                    }
                    Err(e) => {
                        serde_json::json!({
                            "body": format!("error: {}", e),
                            "url": final_url,
                            "headers": resp_headers,
                            "status": status
                        }).to_string()
                    }
                }
            }
            Err(e) => {
                serde_json::json!({
                    "body": format!("error: {}", e),
                    "url": url_clone,
                    "headers": {},
                    "status": 0
                }).to_string()
            }
        }
    })
}

static PERSISTENT_WEBJS_WINDOW: LazyLock<Mutex<Option<tauri::WebviewWindow>>> =
    LazyLock::new(|| Mutex::new(None));

#[op2]
#[string]
pub fn op_java_web_js(#[string] html: String, #[string] js: String) -> String {
    use std::sync::mpsc;

    let app_handle = match crate::js_runtime::ops::get_app_handle() {
        Some(h) => h,
        None => return String::new(),
    };

    let window = {
        let mut guard = PERSISTENT_WEBJS_WINDOW.lock();
        if let Some(existing) = guard.as_ref() {
            existing.clone()
        } else {
            let label = format!("webjs_persistent_{}", uuid::Uuid::new_v4());
            match tauri::WebviewWindowBuilder::new(
                &app_handle,
                &label,
                tauri::WebviewUrl::App("about:blank".into()),
            )
            .visible(false)
            .title("")
            .build()
            {
                Ok(w) => {
                    *guard = Some(w.clone());
                    w
                }
                Err(_) => return String::new(),
            }
        }
    };

    let (tx, rx) = mpsc::channel();

    // 第一阶段：document.write，不需要 sleep
    let html_clone = html.clone();
    let w1 = window.clone();
    let _ = app_handle.run_on_main_thread(move || {
        let _ = w1.eval(&format!(
            "document.write({});",
            serde_json::to_string(&html_clone).unwrap_or_default()
        ));
    });

    // 第二阶段：异步 sleep 后执行 JS，再轮询结果
    let w2 = window.clone();
    let js2 = js.clone();
    let tx2 = tx.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        let w3 = w2.clone();
        let _ = w2.run_on_main_thread(move || {
            let _ = w3.eval(&format!(
                "window.name = (function(){{ {} }})();",
                js2
            ));
        });

        std::thread::spawn(move || {
            let intervals = [200u64, 400, 600, 800, 1000];
            let max_retries = 30;
            for retry in 0..=max_retries {
                let (tx_inner, rx_inner) = mpsc::channel();
                let w = w2.clone();
                let _ = w.eval_with_callback("window.name || ''", move |result| {
                    let _ = tx_inner.send(result);
                });
                if let Ok(result) = rx_inner.recv_timeout(std::time::Duration::from_secs(2)) {
                    if !result.is_empty() && result != "null" {
                        let _ = tx2.send(result);
                        return;
                    }
                }
                let delay = if retry < intervals.len() as i32 {
                    intervals[retry as usize]
                } else {
                    *intervals.last().unwrap_or(&1000)
                };
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
            let _ = tx2.send(String::new());
        });
    });

    rx.recv_timeout(std::time::Duration::from_secs(25)).unwrap_or_default()
}
