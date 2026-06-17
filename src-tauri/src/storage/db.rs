use crate::error::{AbyssError, Result};
use crate::storage::models::{Book, BookSource, ReadingProgress};
use rusqlite::params;
use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use once_cell::sync::OnceCell;
use chrono::Utc;
use serde_json::Value;

static DB_POOL: OnceCell<Pool<SqliteConnectionManager>> = OnceCell::new();

pub fn init_db(db_path: &str) -> Result<()> {
    let manager = SqliteConnectionManager::file(db_path);
    let pool = Pool::new(manager).map_err(|e| AbyssError::DbError(e.to_string()))?;
    let _ = DB_POOL.get_or_init(|| pool);

    let conn = get_conn()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            source_name TEXT NOT NULL,
            name TEXT NOT NULL,
            author TEXT NOT NULL,
            cover_url TEXT,
            intro TEXT,
            kind TEXT,
            last_chapter TEXT,
            book_url TEXT UNIQUE NOT NULL,
            toc_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS book_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            search_url TEXT NOT NULL,
            rule_search TEXT NOT NULL,
            rule_book_info TEXT NOT NULL,
            rule_toc TEXT NOT NULL,
            rule_content TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            weight INTEGER DEFAULT 0,
            explore_url TEXT,
            rule_explore TEXT,
            source_group TEXT,
            source_comment TEXT,
            header TEXT,
            enabled_cookie_jar INTEGER DEFAULT 0,
            js_lib TEXT,
            login_url TEXT,
            login_ui TEXT,
            respond_time INTEGER DEFAULT 0,
            last_update_time INTEGER DEFAULT 0,
            book_url_pattern TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS reading_progress (
            book_id INTEGER PRIMARY KEY,
            chapter_id INTEGER NOT NULL,
            chapter_title TEXT NOT NULL,
            scroll_position INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

fn get_conn() -> Result<PooledConnection<SqliteConnectionManager>> {
    let pool = DB_POOL.get().ok_or_else(|| AbyssError::DbError("DB not initialized".to_string()))?;
    pool.get().map_err(|e| AbyssError::DbError(e.to_string()))
}

// ========== 书籍 CRUD ==========
pub fn save_book(book: &Book) -> Result<i64> {
    let conn = get_conn()?;
    let now = Utc::now().naive_utc();
    conn.execute(
        "INSERT OR REPLACE INTO books (id, source_id, source_name, name, author, cover_url, intro, kind, last_chapter, book_url, toc_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            book.id, book.source_id, book.source_name, book.name, book.author,
            book.cover_url, book.intro, book.kind, book.last_chapter,
            book.book_url, book.toc_url, book.created_at, now
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_book_by_url(book_url: &str) -> Result<Option<Book>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, source_id, source_name, name, author, cover_url, intro, kind, last_chapter, book_url, toc_url, created_at, updated_at
         FROM books WHERE book_url = ?"
    )?;
    let mut rows = stmt.query(params![book_url])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Book {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_name: row.get(2)?,
            name: row.get(3)?,
            author: row.get(4)?,
            cover_url: row.get(5)?,
            intro: row.get(6)?,
            kind: row.get(7)?,
            last_chapter: row.get(8)?,
            book_url: row.get(9)?,
            toc_url: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_books() -> Result<Vec<Book>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, source_id, source_name, name, author, cover_url, intro, kind, last_chapter, book_url, toc_url, created_at, updated_at
         FROM books ORDER BY updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            source_id: row.get(1)?,
            source_name: row.get(2)?,
            name: row.get(3)?,
            author: row.get(4)?,
            cover_url: row.get(5)?,
            intro: row.get(6)?,
            kind: row.get(7)?,
            last_chapter: row.get(8)?,
            book_url: row.get(9)?,
            toc_url: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    let mut books = Vec::new();
    for book in rows {
        books.push(book?);
    }
    Ok(books)
}

pub fn delete_book(book_id: i64) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM books WHERE id = ?", params![book_id])?;
    Ok(())
}

// ========== 阅读进度 ==========
pub fn save_reading_progress(progress: &ReadingProgress) -> Result<()> {
    let conn = get_conn()?;
    let now = Utc::now().naive_utc();
    conn.execute(
        "INSERT OR REPLACE INTO reading_progress (book_id, chapter_id, chapter_title, scroll_position, updated_at)
         VALUES (?, ?, ?, ?, ?)",
        params![progress.book_id, progress.chapter_id, progress.chapter_title, progress.scroll_position, now],
    )?;
    Ok(())
}

pub fn get_reading_progress(book_id: i64) -> Result<Option<ReadingProgress>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT book_id, chapter_id, chapter_title, scroll_position, updated_at
         FROM reading_progress WHERE book_id = ?"
    )?;
    let mut rows = stmt.query(params![book_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(ReadingProgress {
            book_id: row.get(0)?,
            chapter_id: row.get(1)?,
            chapter_title: row.get(2)?,
            scroll_position: row.get(3)?,
            updated_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

// ========== 书源持久化 ==========
pub fn load_book_sources() -> Result<Vec<BookSource>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, url, search_url, rule_search, rule_book_info, rule_toc, rule_content, enabled, weight, explore_url, rule_explore, source_group, source_comment, header, enabled_cookie_jar, js_lib, login_url, login_ui, respond_time, last_update_time, book_url_pattern
         FROM book_sources"
    )?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let url: String = row.get(2)?;
        let search_url: String = row.get(3)?;
        let rule_search_str: String = row.get(4)?;
        let rule_book_info_str: String = row.get(5)?;
        let rule_toc_str: String = row.get(6)?;
        let rule_content_str: String = row.get(7)?;
        let enabled_int: i32 = row.get(8)?;
        let weight: i32 = row.get(9)?;
        let explore_url: Option<String> = row.get(10)?;
        let rule_explore_str: Option<String> = row.get(11)?;
        let source_group: Option<String> = row.get(12)?;
        let source_comment: Option<String> = row.get(13)?;
        let header: Option<String> = row.get(14)?;
        let enabled_cookie_jar_int: i32 = row.get(15)?;
        let js_lib: Option<String> = row.get(16)?;
        let login_url: Option<String> = row.get(17)?;
        let login_ui: Option<String> = row.get(18)?;
        let respond_time: i64 = row.get(19)?;
        let last_update_time: i64 = row.get(20)?;
        let book_url_pattern: Option<String> = row.get(21)?;

        let rule_search = serde_json::from_str(&rule_search_str).unwrap_or(Value::Null);
        let rule_book_info = serde_json::from_str(&rule_book_info_str).unwrap_or(Value::Null);
        let rule_toc = serde_json::from_str(&rule_toc_str).unwrap_or(Value::Null);
        let rule_content = serde_json::from_str(&rule_content_str).unwrap_or(Value::Null);
        let rule_explore = rule_explore_str
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Null);

        Ok(BookSource {
            id,
            name,
            url,
            search_url,
            rule_search,
            rule_book_info,
            rule_toc,
            rule_content,
            enabled: enabled_int != 0,
            explore_url,
            rule_explore,
            group: source_group,
            comment: source_comment,
            weight,
            header,
            enabled_cookie_jar: enabled_cookie_jar_int != 0,
            js_lib,
            login_url,
            login_ui,
            respond_time,
            last_update_time,
            book_url_pattern,
        })
    })?;
    let mut sources = Vec::new();
    for source in rows {
        sources.push(source?);
    }
    Ok(sources)
}

pub fn save_book_source_to_db(source: &BookSource) -> Result<()> {
    let conn = get_conn()?;
    let rule_search_str = serde_json::to_string(&source.rule_search).unwrap_or_default();
    let rule_book_info_str = serde_json::to_string(&source.rule_book_info).unwrap_or_default();
    let rule_toc_str = serde_json::to_string(&source.rule_toc).unwrap_or_default();
    let rule_content_str = serde_json::to_string(&source.rule_content).unwrap_or_default();
    let rule_explore_str = serde_json::to_string(&source.rule_explore).unwrap_or_default();
    let enabled_int = if source.enabled { 1 } else { 0 };
    let enabled_cookie_jar_int = if source.enabled_cookie_jar { 1 } else { 0 };

    conn.execute(
        "INSERT OR REPLACE INTO book_sources (id, name, url, search_url, rule_search, rule_book_info, rule_toc, rule_content, enabled, weight, explore_url, rule_explore, source_group, source_comment, header, enabled_cookie_jar, js_lib, login_url, login_ui, respond_time, last_update_time, book_url_pattern)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            source.id, source.name, source.url, source.search_url,
            rule_search_str, rule_book_info_str, rule_toc_str, rule_content_str,
            enabled_int, source.weight,
            source.explore_url, rule_explore_str,
            source.group, source.comment,
            source.header, enabled_cookie_jar_int,
            source.js_lib, source.login_url, source.login_ui,
            source.respond_time, source.last_update_time,
            source.book_url_pattern
        ],
    )?;
    Ok(())
}

pub fn delete_book_source_from_db(source_id: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM book_sources WHERE id = ?", params![source_id])?;
    Ok(())
}
