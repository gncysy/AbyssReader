// ============================================
// DOM 查询 — select_in_subtree / select_all / size / each_text
// ============================================

use deno_core::op2;
use ego_tree::{NodeId, NodeRef};
use scraper::{ElementRef, Html, Selector};

use super::handle::{current_exec_id, with_table};
use super::selector::get_selector;

/// 在子树内执行选择：从 root_id 开始（含 root 自身），匹配 selector。
/// 对齐 Jsoup 语义：Element.select(css) 只在自身子树内选。
fn select_nodes(html: &Html, root_id: NodeId, selector: &Selector) -> Vec<NodeId> {
    let root: NodeRef<'_, scraper::node::Node> = match html.tree.get(root_id) {
        Some(n) => n,
        None => return Vec::new(),
    };
    let mut result = Vec::new();
    for desc in root.descendants() {
        if let Some(el) = ElementRef::wrap(desc) {
            if selector.matches(&el) {
                result.push(desc.id());
            }
        }
    }
    result
}

/// 在指定节点的子树内执行选择，返回匹配节点的 u32 列表。
#[op2]
#[serde]
pub fn op_jsoup_select_in_subtree(handle: u32, node: u32, #[string] css: String) -> Vec<u32> {
    let exec_id = current_exec_id();
    let selector = match get_selector(&css) {
        Some(s) => s,
        None => return Vec::new(),
    };
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return Vec::new();
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return Vec::new(),
        };
        let root_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return Vec::new(),
        };
        let ids = select_nodes(entry.html(), root_id, &selector);
        ids.into_iter().map(|id| entry.encode_node(id)).collect()
    })
}

/// 在整个文档内执行选择（等价于文档根的子树选择）。
#[op2]
#[serde]
pub fn op_jsoup_select_all(handle: u32, #[string] css: String) -> Vec<u32> {
    let exec_id = current_exec_id();
    let selector = match get_selector(&css) {
        Some(s) => s,
        None => return Vec::new(),
    };
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return Vec::new();
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return Vec::new(),
        };
        let root_id = entry.html().tree.root().id();
        let ids = select_nodes(entry.html(), root_id, &selector);
        ids.into_iter().map(|id| entry.encode_node(id)).collect()
    })
}

/// 返回子树内匹配元素的数量。
#[op2(fast)]
pub fn op_jsoup_size(handle: u32, node: u32, #[string] css: String) -> u32 {
    let exec_id = current_exec_id();
    let selector = match get_selector(&css) {
        Some(s) => s,
        None => return 0,
    };
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return 0;
        }
        let entry = match t.get(handle) {
            Some(e) => e,
            None => return 0,
        };
        let root_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return 0,
        };
        select_nodes(entry.html(), root_id, &selector).len() as u32
    })
}

/// 返回子树内匹配元素的文本列表（每个元素经过 Jsoup 归一化）。
#[op2]
#[serde]
pub fn op_jsoup_each_text(handle: u32, node: u32, #[string] css: String) -> Vec<String> {
    let exec_id = current_exec_id();
    let selector = match get_selector(&css) {
        Some(s) => s,
        None => return Vec::new(),
    };
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return Vec::new();
        }
        let entry = match t.get(handle) {
            Some(e) => e,
            None => return Vec::new(),
        };
        let root_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return Vec::new(),
        };
        let ids = select_nodes(entry.html(), root_id, &selector);
        let html = entry.html();
        ids.into_iter()
            .map(|id| match html.tree.get(id).and_then(ElementRef::wrap) {
                Some(el) => extract_text(&el),
                None => String::new(),
            })
            .collect()
    })
}

fn extract_text(el: &ElementRef) -> String {
    let raw: String = el.text().collect::<Vec<_>>().join(" ");
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}
