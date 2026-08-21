use crate::error::Result;
use crate::storage;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use fancy_regex::Regex;

const INTRO_MAX_LENGTH: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub chapter_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterInfo {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxtTocRule {
    pub enable: bool,
    pub id: i64,
    pub name: String,
    pub rule: String,
    #[serde(default)]
    pub serial_number: i32,
    #[serde(default)]
    pub example: String,
}

#[tauri::command]
pub async fn import_txt(_app: tauri::AppHandle, name: String, content: String) -> Result<ImportResult> {
    if content.trim().is_empty() {
        return Err(crate::error::AbyssError::IoError("内容为空".into()));
    }
    let book_id = format!("local_{}", Utc::now().timestamp_millis());
    let book_url = format!("local://{}", book_id);
    let chapters = extract_chapters(&content)?;
    let chapter_count = chapters.len();
    storage::store_set(
        &format!("local_chapters_{}", book_id),
        &serde_json::to_string(&chapters)?,
    )?;
    let intro = content.chars().take(INTRO_MAX_LENGTH).collect::<String>();
    let intro = if content.chars().count() > INTRO_MAX_LENGTH {
        format!("{}...", intro)
    } else {
        intro
    };
    let mut books = storage::load_bookshelf()?;
    books.insert(
        0,
        serde_json::json!({
            "name": name,
            "author": "本地文件",
            "bookUrl": book_url,
            "coverUrl": null,
            "intro": intro,
            "kind": format!("本地TXT · {}章", chapter_count),
            "lastChapter": chapters.last().map(|c| c.title.clone()),
            "tocUrl": null,
            "origin": "",
            "originName": "本地文件"
        }),
    );
    storage::save_bookshelf(&books)?;
    Ok(ImportResult {
        name,
        author: "本地文件".into(),
        book_url,
        chapter_count,
    })
}

#[tauri::command]
pub async fn get_local_book_chapters(book_id: String) -> Result<Vec<ChapterInfo>> {
    let raw = storage::store_get(&format!("local_chapters_{}", book_id))?
        .unwrap_or_else(|| "[]".into());
    Ok(serde_json::from_str(&raw)?)
}

#[tauri::command]
pub async fn get_local_chapter_content(book_id: String, chapter_id: i64) -> Result<String> {
    let raw = storage::store_get(&format!("local_chapters_{}", book_id))?
        .unwrap_or_else(|| "[]".into());
    let chapters: Vec<ChapterInfo> = serde_json::from_str(&raw)?;
    chapters
        .iter()
        .find(|c| c.id == chapter_id)
        .map(|c| c.content.clone())
        .ok_or_else(|| crate::error::AbyssError::ChapterNotFound(format!("{}:{}", book_id, chapter_id)))
}

fn load_toc_rules() -> Vec<TxtTocRule> {
    if let Ok(Some(raw)) = storage::store_get("txtTocRule") {
        if let Ok(rules) = serde_json::from_str::<Vec<TxtTocRule>>(&raw) {
            let enabled: Vec<TxtTocRule> = rules.into_iter().filter(|r| r.enable).collect();
            if !enabled.is_empty() {
                return enabled;
            }
        }
    }
    default_toc_rules()
}

fn default_toc_rules() -> Vec<TxtTocRule> {
    vec![
        TxtTocRule { enable: true, id: -2, name: "目录".into(), rule: r"^[  \t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\s{0,4}[\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张))).{0,30}$".into(), serial_number: 1, example: "".into() },
        TxtTocRule { enable: true, id: -8, name: "数字 分隔符".into(), rule: r"^[  \t]{0,4}\d{1,5}[:：,.， 、_—\-].{1,30}$".into(), serial_number: 7, example: "".into() },
        TxtTocRule { enable: true, id: -9, name: "大写数字 分隔符".into(), rule: r"^[  \t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章?)[ 、_—\-].{1,30}$".into(), serial_number: 8, example: "".into() },
        TxtTocRule { enable: true, id: -11, name: "正文 标题/序号".into(), rule: r"^[  \t]{0,4}正文[  ]{1,4}.{0,20}$".into(), serial_number: 10, example: "".into() },
        TxtTocRule { enable: true, id: -12, name: "Chapter/Section".into(), rule: r"^[  \t]{0,4}(?:[Cc]hapter|[Ss]ection|[Pp]art|ＰＡＲＴ|[Nn][oO][.、]|[Ee]pisode|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)\s{0,4}\d{1,4}.{0,30}$".into(), serial_number: 11, example: "".into() },
        TxtTocRule { enable: true, id: -14, name: "特殊符号 序号".into(), rule: r"^[  \t]{0,4}[【〔〖「『〈［\[](?:第|[Cc]hapter)[\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,10}[章节].{0,20}$".into(), serial_number: 13, example: "".into() },
        TxtTocRule { enable: true, id: -16, name: "特殊符号 标题(单个)".into(), rule: r"^[  \t]{0,4}(?:[☆★✦✧].{1,30}|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)[  ]{0,4}$".into(), serial_number: 15, example: "".into() },
        TxtTocRule { enable: true, id: -17, name: "章/卷 序号".into(), rule: r"^[ \t ]{0,4}(?:(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[卷章][\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8})[  ]{0,4}.{0,30}$".into(), serial_number: 16, example: "".into() },
        TxtTocRule { enable: true, id: -21, name: "书名 括号 序号".into(), rule: r"^[一-龥]{1,20}[  \t]{0,4}[(（][\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[)）][  \t]{0,4}$".into(), serial_number: 20, example: "".into() },
        TxtTocRule { enable: true, id: -22, name: "书名 序号".into(), rule: r"^[一-龥]{1,20}[  \t]{0,4}[\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[  \t]{0,4}$".into(), serial_number: 21, example: "".into() },
    ]
}

fn extract_chapters(content: &str) -> Result<Vec<ChapterInfo>> {
    let content = content.strip_prefix('\u{FEFF}').unwrap_or(content);
    let rules = load_toc_rules();
    let compiled: Vec<Regex> = rules
        .iter()
        .filter_map(|r| {
            Regex::new(&r.rule)
                .map_err(|e| {
                    crate::js_runtime::ops::emit_log(
                        "warn",
                        &format!("[TXT] 目录规则编译失败: {} -> {}", r.name, e),
                    );
                })
                .ok()
        })
        .collect();

    let mut chapters: Vec<ChapterInfo> = Vec::new();
    let mut current_title = String::from("正文");
    let mut current_lines: Vec<String> = Vec::new();
    let mut id: i64 = 0;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            current_lines.push(String::new());
            continue;
        }
        let is_chapter = compiled.iter().any(|re| re.is_match(trimmed).unwrap_or(false));
        let has_content = current_lines.iter().any(|s| !s.is_empty());

        if is_chapter {
            if has_content {
                chapters.push(ChapterInfo {
                    id,
                    title: current_title.clone(),
                    content: current_lines.join("\n"),
                    index: chapters.len(),
                });
                id += 1;
            }
            current_title = trimmed.to_string();
            current_lines.clear();
        } else {
            current_lines.push(line.to_string());
        }
    }

    let raw_content = current_lines.join("\n");
    if !raw_content.is_empty() {
        chapters.push(ChapterInfo {
            id,
            title: current_title,
            content: raw_content,
            index: chapters.len(),
        });
    }

    if chapters.is_empty() {
        chapters.push(ChapterInfo {
            id: 0,
            title: "正文".into(),
            content: content.to_string(),
            index: 0,
        });
    }

    Ok(chapters)
}
