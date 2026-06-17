use crate::error::Result;
use crate::storage::{
    save_book, list_books, delete_book, save_reading_progress,
    Book, ReadingProgress,
};
use chrono::Utc;

#[tauri::command]
pub async fn get_bookshelf() -> Result<Vec<Book>> {
    let books = list_books()?;
    Ok(books)
}

#[tauri::command]
pub async fn add_to_bookshelf(book: Book) -> Result<()> {
    let mut new_book = book;
    new_book.created_at = Utc::now().naive_utc();
    new_book.updated_at = Utc::now().naive_utc();
    save_book(&new_book)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_from_bookshelf(book_id: i64) -> Result<()> {
    delete_book(book_id)?;
    Ok(())
}

#[tauri::command]
pub async fn update_reading_progress(
    book_id: i64,
    chapter_id: i64,
    chapter_title: String,
    scroll_position: i32,
) -> Result<()> {
    let progress = ReadingProgress {
        book_id,
        chapter_id,
        chapter_title,
        scroll_position,
        updated_at: Utc::now().naive_utc(),
    };
    save_reading_progress(&progress)?;
    Ok(())
}

#[tauri::command]
pub async fn get_reading_progress(book_id: i64) -> Result<Option<ReadingProgress>> {
    let progress = crate::storage::get_reading_progress(book_id)?;
    Ok(progress)
}
