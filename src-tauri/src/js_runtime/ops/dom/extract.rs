// ============================================
// DOM 提取 — text / attr / html / outer_html / own_text / tag_name
// ============================================
//
// 所有提取方法都同时支持元素节点和文档节点（后者用于整个 HTML 内容）。

use deno_core::op2;
use ego_tree::NodeId;
use scraper::{ElementRef, Html};

use super::handle::{current_exec_id, with_table};

fn decode_and_get<R>(
    handle: u32,
    node: u32,
    f: impl FnOnce(&Html, NodeId) -> R,
) -> Option<R> {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return None;
        }
        let entry = t.get(handle)?;
        let node_id = entry.decode_node(node)?;
        Some(f(entry.html(), node_id))
    })
}

/// Jsoup 文本归一化：所有空白序列 → 单个空格，去首尾。
fn normalize_text(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn collect_text(node: ego_tree::NodeRef<'_, scraper::node::Node>) -> String {
    let parts: Vec<String> = node
        .descendants()
        .filter_map(|d| d.value().as_text().map(|t| normalize_text(&t.text)))
        .filter(|s| !s.is_empty())
        .collect();
    parts.join(" ")
}

#[op2]
#[string]
pub fn op_jsoup_text(handle: u32, node: u32) -> String {
    decode_and_get(handle, node, |html, id| {
        match html.tree.get(id) {
            Some(n) => collect_text(n),
            None => String::new(),
        }
    })
    .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_jsoup_own_text(handle: u32, node: u32) -> String {
    decode_and_get(handle, node, |html, id| {
        let n = match html.tree.get(id) {
            Some(n) => n,
            None => return String::new(),
        };
        let parts: Vec<String> = n
            .children()
            .filter_map(|c| c.value().as_text().map(|t| normalize_text(&t.text)))
            .filter(|s| !s.is_empty())
            .collect();
        parts.join(" ")
    })
    .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_jsoup_inner_html(handle: u32, node: u32) -> String {
    decode_and_get(handle, node, |html, id| {
        let n = match html.tree.get(id) {
            Some(n) => n,
            None => return String::new(),
        };
        if let Some(el) = ElementRef::wrap(n) {
            return el.inner_html();
        }
        serialize_children(n)
    })
    .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_jsoup_outer_html(handle: u32, node: u32) -> String {
    decode_and_get(handle, node, |html, id| {
        let n = match html.tree.get(id) {
            Some(n) => n,
            None => return String::new(),
        };
        if let Some(el) = ElementRef::wrap(n) {
            return el.html();
        }
        serialize_children(n)
    })
    .unwrap_or_default()
}

fn serialize_children(node: ego_tree::NodeRef<'_, scraper::node::Node>) -> String {
    let mut result = String::new();
    for child in node.children() {
        if let Some(el) = ElementRef::wrap(child) {
            result.push_str(&el.html());
        } else if let Some(text) = child.value().as_text() {
            result.push_str(&text.text);
        }
    }
    result
}

#[op2]
#[string]
pub fn op_jsoup_attr(handle: u32, node: u32, #[string] name: String) -> String {
    decode_and_get(handle, node, |html, id| {
        html.tree            .get(id)
            .and_then(ElementRef::wrap)
            .and_then(|el| el.value().attr(&name))
            .unwrap_or("")
            .to_string()
    })
    .unwrap_or_default()
}

#[op2(fast)]
pub fn op_jsoup_has_attr(handle: u32, node: u32, #[string] name: String) -> bool {
    decode_and_get(handle, node, |html, id| {
        html.tree
            .get(id)
            .and_then(ElementRef::wrap)
            .map(|el| el.value().attr(&name).is_some())
            .unwrap_or(false)
    })
    .unwrap_or(false)
}

#[op2]
#[string]
pub fn op_jsoup_tag_name(handle: u32, node: u32) -> String {
    decode_and_get(handle, node, |html, id| {
        html.tree
            .get(id)
            .and_then(ElementRef::wrap)
            .map(|el| el.value().name().to_string())
            .unwrap_or_default()
    })
    .unwrap_or_default()
}
