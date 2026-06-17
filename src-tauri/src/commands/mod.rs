pub mod bookshelf;
pub mod source;
pub mod fetch_url;
pub mod book;          // 新增

use tokio::sync::Mutex;
use crate::storage::BookSource;

pub struct AppState {
    pub sources: Mutex<Vec<BookSource>>,
}

pub use bookshelf::{
    get_bookshelf, add_to_bookshelf, remove_from_bookshelf,
    update_reading_progress, get_reading_progress,
};
pub use source::{
    get_book_sources, add_book_source, import_sources_from_url, upload_local_source,
    delete_book_source, delete_book_sources, toggle_book_source,
    test_book_source, test_all_sources, delete_failed_sources,
    get_explore_categories,
};
pub use fetch_url::fetch_url;
pub use book::{add_local_txt_content, read_local_file};  // 新增
