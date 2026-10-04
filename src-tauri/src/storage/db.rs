use crate::error::{AbyssError, Result};
use rusqlite::Connection;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

// 修复：KV_CACHE 与 KV_CACHE_ORDER 合并到单一 Mutex 下，避免两次加锁不一致
struct KvCache {
    data: HashMap<String, String>,
    order: Vec<String>,
}

const CACHE_MAX_ENTRIES: usize = 100;

static KV_CACHE: OnceCell<Mutex<KvCache>> = OnceCell::new();

fn get_cache() -> &'static Mutex<KvCache> {
    KV_CACHE.get_or_init(|| {
        Mutex::new(KvCache {
            data: HashMap::new(),
            order: Vec::new(),
        })
    })
}

/// 标记 key 为最近使用（移到 order 末尾）
fn touch_key(cache: &mut KvCache, key: &str) {
    if let Some(pos) = cache.order.iter().position(|k| k == key) {
        cache.order.remove(pos);
    }
    cache.order.push(key.to_string());
}

/// 淘汰：移除最久未使用的条目
fn evict_lru_if_needed(cache: &mut KvCache) {
    while cache.order.len() >= CACHE_MAX_ENTRIES {
        if let Some(oldest_key) = cache.order.first().cloned() {
            cache.order.remove(0);
            cache.data.remove(&oldest_key);
        } else {
            break;
        }
    }
}

/// 插入或更新缓存项
fn insert_cache(cache: &mut KvCache, key: &str, value: String) {
    evict_lru_if_needed(cache);
    cache.data.insert(key.to_string(), value);
    touch_key(cache, key);
}

pub fn init_db(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path).map_err(|e| AbyssError::DbError(e.to_string()))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
        [],
    )?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key)", [])?;
    DB.set(Mutex::new(conn)).map_err(|_| AbyssError::DbError("DB already initialized".into()))?;
    // 清空缓存（注意：KV_CACHE 是 OnceCell，如果已初始化则清空内容）
    {
        let cache = get_cache();
        let mut guard = cache.lock();
        guard.data.clear();
        guard.order.clear();
    }
    Ok(())
}

fn get_conn() -> Result<parking_lot::MutexGuard<'static, Connection>> {
    Ok(DB.get().ok_or_else(|| AbyssError::DbError("DB not initialized".into()))?.lock())
}

pub fn store_get(key: &str) -> Result<Option<String>> {
    // 1. 先查缓存
    {
        let cache = get_cache();
        let mut guard = cache.lock();
        if let Some(value) = guard.data.get(key) {
            let result = value.clone();
            touch_key(&mut guard, key);
            return Ok(Some(result));
        }
    }

    // 2. 查数据库
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT value FROM kv_store WHERE key = ?")?;
    let mut rows = stmt.query(rusqlite::params![key])?;
    let result: Option<String> = if let Some(row) = rows.next()? {
        Some(row.get(0)?)
    } else {
        None
    };

    // 3. 写入缓存
    if let Some(ref value) = result {
        let cache = get_cache();
        let mut guard = cache.lock();
        insert_cache(&mut guard, key, value.clone());
    }

    Ok(result)
}

pub fn store_set(key: &str, value: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        rusqlite::params![key, value],
    )?;
    let cache = get_cache();
    let mut guard = cache.lock();
    insert_cache(&mut guard, key, value.to_string());
    Ok(())
}

pub fn store_delete(key: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM kv_store WHERE key = ?", rusqlite::params![key])?;
    let cache = get_cache();
    let mut guard = cache.lock();
    guard.data.remove(key);
    if let Some(pos) = guard.order.iter().position(|k| k == key) {
        guard.order.remove(pos);
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
