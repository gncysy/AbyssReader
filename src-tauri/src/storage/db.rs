use crate::error::{AbyssError, Result};
use rusqlite::Connection;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::LazyLock;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

// LRU 缓存：HashMap 存储数据，Vec 记录插入顺序
static KV_CACHE: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static KV_CACHE_ORDER: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| Mutex::new(Vec::new()));

const CACHE_MAX_ENTRIES: usize = 100;

pub fn init_db(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path).map_err(|e| AbyssError::DbError(e.to_string()))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
        [],
    )?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key)", [])?;
    DB.set(Mutex::new(conn)).map_err(|_| AbyssError::DbError("DB already initialized".into()))?;
    {
        let mut cache = KV_CACHE.lock();
        cache.clear();
    }
    {
        let mut order = KV_CACHE_ORDER.lock();
        order.clear();
    }
    Ok(())
}

fn get_conn() -> Result<parking_lot::MutexGuard<'static, Connection>> {
    Ok(DB.get().ok_or_else(|| AbyssError::DbError("DB not initialized".into()))?.lock())
}

/// LRU 淘汰：移除最久未使用的条目
fn evict_lru_if_needed() {
    let mut order = KV_CACHE_ORDER.lock();
    if order.len() >= CACHE_MAX_ENTRIES {
        if let Some(oldest_key) = order.first().cloned() {
            order.remove(0);
            let mut cache = KV_CACHE.lock();
            cache.remove(&oldest_key);
        }
    }
}

/// 标记 key 为最近使用（移到 order 末尾）
fn touch_key(key: &str) {
    let mut order = KV_CACHE_ORDER.lock();
    if let Some(pos) = order.iter().position(|k| k == key) {
        order.remove(pos);
    }
    order.push(key.to_string());
}

/// 将 key 加入缓存并标记为最近使用
fn insert_key(key: &str) {
    evict_lru_if_needed();
    touch_key(key);
}

pub fn store_get(key: &str) -> Result<Option<String>> {
    // 注意：这里不能使用 mut，因为只做 get 操作
    {
        let cache = KV_CACHE.lock();
        if let Some(value) = cache.get(key) {
            let result = value.clone();
            drop(cache);
            touch_key(key);
            return Ok(Some(result));
        }
    }

    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT value FROM kv_store WHERE key = ?")?;
    let mut rows = stmt.query(rusqlite::params![key])?;
    let result: Option<String> = if let Some(row) = rows.next()? {
        Some(row.get(0)?)
    } else {
        None
    };

    if let Some(ref value) = result {
        let mut cache = KV_CACHE.lock();
        cache.insert(key.to_string(), value.clone());
        drop(cache);
        insert_key(key);
    }

    Ok(result)
}

pub fn store_set(key: &str, value: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        rusqlite::params![key, value],
    )?;
    let mut cache = KV_CACHE.lock();
    cache.insert(key.to_string(), value.to_string());
    drop(cache);
    insert_key(key);
    Ok(())
}

pub fn store_delete(key: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM kv_store WHERE key = ?", rusqlite::params![key])?;
    let mut cache = KV_CACHE.lock();
    cache.remove(key);
    drop(cache);
    let mut order = KV_CACHE_ORDER.lock();
    if let Some(pos) = order.iter().position(|k| k == key) {
        order.remove(pos);
    }
    Ok(())
}

pub fn store_get_all() -> Result<Vec<(String, String)>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM kv_store")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn load_book_sources() -> Result<Vec<Value>> {
    let raw = store_get("bookSource")?.unwrap_or_else(|| "[]".into());
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_book_sources(sources: &[Value]) -> Result<()> {
    store_set("bookSource", &serde_json::to_string(sources)?)
}

pub fn load_bookshelf() -> Result<Vec<Value>> {
    let raw = store_get("bookshelf")?.unwrap_or_else(|| "[]".into());
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_bookshelf(books: &[Value]) -> Result<()> {
    store_set("bookshelf", &serde_json::to_string(books)?)
}

pub fn load_reading_progress() -> Result<Value> {
    let raw = store_get("readingProgress")?.unwrap_or_else(|| "{}".into());
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_reading_progress(progress: &Value) -> Result<()> {
    store_set("readingProgress", &serde_json::to_string(progress)?)
}
