use crate::error::Result;
use crate::storage::Book;
use chrono::Utc;

#[tauri::command]
pub async fn add_local_txt_content(name: String, content: String) -> Result<Book> {
    let file_url = format!("local://{}", name);

    let book = Book {
        id: 0,
        source_id: "local".to_string(),
        source_name: "本地文件".to_string(),
        name: name.clone(),
        author: "本地导入".to_string(),
        cover_url: None,
        intro: None,
        kind: Some("本地TXT".to_string()),
        last_chapter: Some(format!("{} 字", content.chars().count())),
        book_url: file_url,
        toc_url: None,
        created_at: Utc::now().naive_utc(),
        updated_at: Utc::now().naive_utc(),
    };

    let id = crate::storage::save_book(&book)?;
    let mut saved = book;
    saved.id = id;

    // 存储内容到文件
    let app_data = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.abyss.reader")
        .join("local_txt");
    std::fs::create_dir_all(&app_data)
        .map_err(|e| crate::error::AbyssError::IoError(e.to_string()))?;
    let file_path = app_data.join(format!("{}.txt", id));
    tokio::fs::write(&file_path, &content).await
        .map_err(|e| crate::error::AbyssError::IoError(e.to_string()))?;

    Ok(saved)
}

#[tauri::command]
pub async fn read_local_file(file_path: String) -> Result<String> {
    let content = tokio::fs::read_to_string(&file_path).await
        .map_err(|e| crate::error::AbyssError::IoError(e.to_string()))?;
    let html = content
        .split('\n')
        .map(|line| format!("<p>{}</p>", line.trim()))
        .collect::<Vec<_>>()
        .join("");
    Ok(html)
}
