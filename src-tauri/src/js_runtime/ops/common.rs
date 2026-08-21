use std::sync::mpsc;

/// 在阻塞线程中执行 reqwest 请求。
/// 如果 Client 构建失败或线程异常退出，会通过 emit_log 记录错误
/// 并尝试返回一个"空"的响应（空字符串或空字节）。
pub fn with_blocking_client<F>(f: F) -> String
where
    F: FnOnce(&reqwest::blocking::Client) -> String + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .user_agent(crate::js_runtime::ops::get_ua())
            .danger_accept_invalid_certs(true)
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(std::time::Duration::from_secs(30))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(Err(format!("Client 构建失败: {}", e)));
                return;
            }
        };
        let result = f(&client);
        let _ = tx.send(Ok(result));
    });

    match rx.recv() {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            crate::js_runtime::ops::emit_log("error", &format!("[blocking_client] {}", e));
            let _ = handle.join();
            String::new()
        }
        Err(_) => {
            crate::js_runtime::ops::emit_log("error", "[blocking_client] 线程异常退出");
            let _ = handle.join();
            String::new()
        }
    }
}

/// 阻塞线程中执行 reqwest 请求，返回字节数组。
/// 出错时返回空 Vec。
pub fn with_blocking_client_bytes<F>(f: F) -> Vec<u8>
where
    F: FnOnce(&reqwest::blocking::Client) -> Vec<u8> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .user_agent(crate::js_runtime::ops::get_ua())
            .danger_accept_invalid_certs(true)
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(std::time::Duration::from_secs(30))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(Err(format!("Client 构建失败: {}", e)));
                return;
            }
        };
        let result = f(&client);
        let _ = tx.send(Ok(result));
    });

    match rx.recv() {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            crate::js_runtime::ops::emit_log("error", &format!("[blocking_client] {}", e));
            let _ = handle.join();
            Vec::new()
        }
        Err(_) => {
            crate::js_runtime::ops::emit_log("error", "[blocking_client] 线程异常退出");
            let _ = handle.join();
            Vec::new()
        }
    }
}
