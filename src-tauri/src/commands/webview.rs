use crate::error::Result;
use std::collections::HashMap;
use tauri::Listener;
use tauri::WebviewWindowBuilder;
use tokio::sync::oneshot;
use tokio::time::timeout;
use std::time::Duration;
use std::sync::{Arc, Mutex};

#[tauri::command]
#[allow(non_snake_case)]
pub async fn fetch_webview(
    app: tauri::AppHandle,
    url: String,
    _method: Option<String>,
    _body: Option<String>,
    _headers: Option<HashMap<String, String>>,
    _charset: Option<String>,
    _use_webview: Option<bool>,
    web_js: Option<String>,
    timeout_secs: Option<u64>,
    source_type: Option<i32>,
    preserve_style: Option<bool>,
) -> Result<String> {
    let timeout_secs = timeout_secs.unwrap_or(30);
    let parsed_url = url::Url::parse(&url)
        .map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;

    let is_comic = source_type == Some(2);
    let is_novel = source_type == Some(0) || source_type.is_none();

    let block_script = if is_novel {
        r#"(function(){var o=new MutationObserver(function(){document.querySelectorAll('img,picture,source').forEach(function(e){e.remove()})});o.observe(document.documentElement,{childList:true,subtree:true});var l=new MutationObserver(function(){document.querySelectorAll('link[rel="stylesheet"],link[rel="preload"],link[rel="prefetch"],link[rel="font"]').forEach(function(e){e.remove()})});l.observe(document.documentElement,{childList:true,subtree:true});var s=new MutationObserver(function(){document.querySelectorAll('script:not([type="application/json"])').forEach(function(e){e.remove()})});s.observe(document.documentElement,{childList:true,subtree:true})})()"#
    } else if is_comic {
        r#"(function(){document.querySelectorAll('link[rel="font"],link[rel="preload"][as="font"]').forEach(function(e){e.remove()});document.querySelectorAll('script:not([data-main]):not([src*="lazyload"])').forEach(function(e){e.remove()});document.querySelectorAll('img[data-src],img[data-original]').forEach(function(e){var s=e.getAttribute('data-src')||e.getAttribute('data-original');if(s)e.setAttribute('src',s)})})()"#
    } else {
        ""
    };

    let window = crate::js_runtime::ops::get_or_create_persistent_webview(
        &app,
        tauri::WebviewUrl::External(parsed_url.clone()),
    )
    .map_err(|e| crate::error::AbyssError::WebViewError(e))?;

    let _ = window.navigate(parsed_url.clone());

    if !block_script.is_empty() {
        let _ = window.eval(block_script);
    }

    let write_js = if let Some(js) = &web_js {
        format!("window.name = (function(){{ return {}; }})();", js)
    } else if is_comic {
        r#"window.name=(function(){var u=[];document.querySelectorAll('img,picture source').forEach(function(e){var s=e.getAttribute('src')||e.getAttribute('data-src')||e.getAttribute('data-original');if(s&&s.startsWith('http'))u.push(s)});return JSON.stringify(Array.from(new Set(u)))})();"#.to_string()
    } else if preserve_style == Some(true) {
        r#"window.name=JSON.stringify(document.documentElement.outerHTML);"#.to_string()
    } else {
        r#"document.querySelectorAll('script,style,link,iframe,noscript,meta').forEach(function(el){el.remove()});window.name=JSON.stringify(document.documentElement.outerHTML);"#.to_string()
    };

    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = Arc::new(Mutex::new(Some(tx)));
    let wf = window.clone();
    let jsf = write_js.clone();
    let txc = tx_shared.clone();

    std::thread::spawn(move || {
        let poll_interval = Duration::from_millis(500);
        let max_wait = Duration::from_secs(timeout_secs);
        let start = std::time::Instant::now();

        while start.elapsed() < max_wait {
            std::thread::sleep(poll_interval);

            let (_tx_ready, rx_ready) = std::sync::mpsc::channel::<String>();
            let w_check = wf.clone();
            let w_check_for_thread = w_check.clone();

            let check_js = r#"(function(){try{var len=document.documentElement?document.documentElement.outerHTML.length:0;var cf=document.title?document.title.indexOf('Just a moment')!==-1:false;return JSON.stringify({len:len,cf:cf});}catch(e){return JSON.stringify({len:0,cf:true});}})()"#.to_string();
            let check_js_owned = check_js.clone();

            let _ = w_check.run_on_main_thread(move || {
                let set_status_js = format!("window.name = {}", check_js_owned);
                let _ = w_check_for_thread.eval(&set_status_js);
            });

            let mut page_ready = false;
            if let Ok(status) = rx_ready.recv_timeout(Duration::from_secs(2)) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&status) {
                    let len = parsed.get("len").and_then(|v| v.as_u64()).unwrap_or(0);
                    let is_cf = parsed.get("cf").and_then(|v| v.as_bool()).unwrap_or(false);
                    if len > 5000 && !is_cf {
                        page_ready = true;
                    }
                }
            }

            if page_ready {
                break;
            }
        }

        let w = wf.clone();
        let _ = wf.run_on_main_thread(move || {
            let _ = w.eval(&jsf);
            std::thread::sleep(Duration::from_millis(300));
            let w2 = w.clone();
            let _ = w.eval_with_callback("window.name || ''", move |r| {
                if let Ok(mut g) = txc.lock() {
                    if let Some(s) = g.take() {
                        let _ = s.send(r);
                    }
                }
                let _ = w2.hide();
            });
        });
    });

    match timeout(Duration::from_secs(timeout_secs + 5), rx).await {
        Ok(inner) => inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))),
        Err(_) => Err(crate::error::AbyssError::WebViewError("超时".into())),
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn login_webview(
    app: tauri::AppHandle,
    url: String,
    title: Option<String>,
    timeoutSecs: Option<u64>,
) -> Result<String> {
    let parsed_url = url::Url::parse(&url)
        .map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;

    let window_label = format!("login_{}", uuid::Uuid::new_v4());
    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = Arc::new(Mutex::new(Some(tx)));

    let builder = WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::External(parsed_url))
        .visible(true)
        .focused(true)
        .skip_taskbar(false)
        .title(&title.unwrap_or_else(|| "登录".into()))
        .user_agent(crate::utils::DEFAULT_UA);

    let window = builder
        .build()
        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;

    let tx_clone = tx_shared.clone();
    let _id = window.listen("tauri://destroyed", move |_| {
        let cj = crate::js_runtime::ops::get_cookies_json();
        if let Ok(mut g) = tx_clone.lock() {
            if let Some(s) = g.take() {
                let _ = s.send(cj);
            }
        }
    });

    match timeout(Duration::from_secs(timeoutSecs.unwrap_or(300)), rx).await {
        Ok(inner) => {
            let _ = window.close();
            inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e)))
        }
        Err(_) => {
            let _ = window.close();
            Err(crate::error::AbyssError::WebViewError("超时".into()))
        }
    }
}
