pub mod models;
pub mod db;

pub use models::{Book, BookSource, ReadingProgress};
pub use db::{
    init_db, save_book, get_book_by_url, list_books, delete_book,
    save_reading_progress, get_reading_progress,
    load_book_sources, save_book_source_to_db, delete_book_source_from_db,
};
