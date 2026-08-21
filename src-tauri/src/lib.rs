pub mod commands;
pub mod error;
pub mod network;
pub mod js_runtime;
pub mod storage;
pub mod utils;

use tauri::Manager;
use tauri::WebviewWindowBuilder;
use tauri::WebviewUrl;

const WEBVIEW_CLEANUP_INTERVAL_SECS: u64 = 30;
const WINDOW_WIDTH: f64 = 1200.0;
const WINDOW_HEIGHT: f64 = 800.0;
const MIN_WINDOW_WIDTH: f64 = 800.0;
const MIN_WINDOW_HEIGHT: f64 = 600.0;
const WINDOW_BG_R: u8 = 26;
const WINDOW_BG_G: u8 = 26;
const WINDOW_BG_B: u8 = 26;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::store_get, commands::store_set, commands::store_delete, commands::store_get_all,
            commands::get_book_sources, commands::add_book_source, commands::import_sources_from_url,
            commands::toggle_book_source, commands::delete_book_source, commands::delete_failed_sources,
            commands::test_book_source, commands::test_all_sources,
            commands::get_explore_categories, commands::execute_js_rule, commands::dict_query,
            commands::source_login, commands::source_login_ui, commands::source_login_action,
            commands::fetch_url, commands::fetch_webview, commands::download_binary, commands::proxy_image,
            commands::login_webview, commands::rss_open_url,
            commands::embedded_webview_action,
            commands::import_txt, commands::get_local_book_chapters, commands::get_local_chapter_content,
            commands::clear_source_error_comment,
            commands::cache_get_info, commands::cache_clear, commands::cache_clear_category,
            commands::cache_get_cover, commands::cache_put_cover, commands::cache_put_covers,
            commands::cache_put_toc, commands::cache_get_toc,
            commands::cache_put_content, commands::cache_get_content,
            commands::cache_has_cover, commands::cache_set_max_size, commands::cache_migrate,
            commands::comic_fetch_image, commands::comic_prefetch_images, commands::comic_clear_cache,
            commands::get_hostname,
            commands::get_bookshelf, commands::add_to_bookshelf, commands::remove_from_bookshelf,
            commands::update_reading_progress, commands::get_reading_progress,
            commands::cleanup_webviews,
            commands::open_url,
            commands::submit_verification_code, commands::cancel_verification_code,
        ])

        .setup(|app| {
            std::thread::spawn(|| {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(WEBVIEW_CLEANUP_INTERVAL_SECS));
                    crate::js_runtime::ops::cleanup_idle_webview();
                }
            });

            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("abyss-reader"));
            std::fs::create_dir_all(&app_data_dir).ok();
            crate::storage::cache::init_cache_dir(&app_data_dir);
            crate::js_runtime::ops::set_app_handle(app.handle().clone());
            crate::js_runtime::ops::set_cookie_save_dir(app_data_dir.clone());
            let db_path = app_data_dir.join("abyss-reader.db");
            if let Err(e) = crate::storage::init_db(db_path.to_str().unwrap_or("abyss-reader.db")) {
                eprintln!("初始化数据库失败: {}", e);
            }
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
            }

            let app_for_nav = app.handle().clone();
            let window = match WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("墨阅")
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)
                .center()
                .decorations(false)
                .background_color(tauri::window::Color(WINDOW_BG_R, WINDOW_BG_G, WINDOW_BG_B, 255))
                .visible(false)
                .on_navigation(move |_url| {
                    if let Some(win) = app_for_nav.get_webview_window("main") {
                        let _ = win.show();
                    }
                    true
                })
                .build()
            {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("主窗口创建失败: {}", e);
                    return Ok(());
                }
            };

            crate::js_runtime::ops::set_main_window(window);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("构建失败")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                crate::js_runtime::ops::close_persistent_webview();
                crate::js_runtime::ops::cleanup_all_embedded_webviews();
                app_handle.cleanup_before_exit();
            }
        });
}
