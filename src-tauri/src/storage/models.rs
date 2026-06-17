use serde::{Serialize, Deserialize};
use chrono::NaiveDateTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: i64,
    pub source_id: String,
    pub source_name: String,
    pub name: String,
    pub author: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub book_url: String,
    pub toc_url: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookSource {
    pub id: String,
    pub name: String,
    pub url: String,
    pub search_url: String,
    pub rule_search: serde_json::Value,
    pub rule_book_info: serde_json::Value,
    pub rule_toc: serde_json::Value,
    pub rule_content: serde_json::Value,
    pub enabled: bool,
    pub explore_url: Option<String>,
    pub rule_explore: serde_json::Value,
    pub group: Option<String>,
    pub comment: Option<String>,
    pub weight: i32,
    pub header: Option<String>,
    pub enabled_cookie_jar: bool,
    pub js_lib: Option<String>,
    pub login_url: Option<String>,
    pub login_ui: Option<String>,
    pub respond_time: i64,
    pub last_update_time: i64,
    pub book_url_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub book_id: i64,
    pub chapter_id: i64,
    pub chapter_title: String,
    pub scroll_position: i32,
    pub updated_at: NaiveDateTime,
}
