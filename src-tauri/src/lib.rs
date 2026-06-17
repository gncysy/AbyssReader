pub mod error;
pub mod storage;
pub mod commands;
pub mod network;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(commands::AppState {
            sources: tokio::sync::Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::fetch_url::fetch_url,
            commands::book::add_local_txt_content,
            commands::book::read_local_file,
            commands::bookshelf::get_bookshelf,
            commands::bookshelf::add_to_bookshelf,
            commands::bookshelf::remove_from_bookshelf,
            commands::bookshelf::update_reading_progress,
            commands::bookshelf::get_reading_progress,
            commands::source::get_book_sources,
            commands::source::add_book_source,
            commands::source::import_sources_from_url,
            commands::source::upload_local_source,
            commands::source::delete_book_source,
            commands::source::delete_book_sources,
            commands::source::toggle_book_source,
            commands::source::test_book_source,
            commands::source::test_all_sources,
            commands::source::delete_failed_sources,
            commands::source::get_explore_categories,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("abyss_reader.db");
            storage::init_db(db_path.to_str().expect("Invalid db path"))
                .expect("Failed to init database");

            let state = app.state::<commands::AppState>();
            let mut sources = state.sources.blocking_lock();
            *sources = storage::db::load_book_sources().unwrap_or_else(|e| {
                eprintln!("加载书源失败: {}", e);
                Vec::new()
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
