// ============================================
// Jsoup DOM 操作 — scraper HtmlTreeSink（TreeSink trait）
// ============================================

use deno_core::op2;
use markup5ever::interface::tree_builder::{NodeOrText, TreeSink};
use scraper::{Html, Selector};
use std::cell::RefCell;

/// 解析 content 为 fragment 节点
fn parse_fragment(content: &str) -> Html {
    Html::parse_fragment(content)
}

/// 获取 fragment 的根节点 id（fragment 根是文档节点，children 是实际内容）
fn get_fragment_children_ids(fragment: &Html) -> Vec<ego_tree::NodeId> {
    let root = fragment.tree.root();
    let mut ids = Vec::new();
    if let Some(first) = root.first_child() {
        // fragment 的 children
        for child in first.children() {
            ids.push(child.id());
        }
    }
    if ids.is_empty() {
        // 如果 fragment 根节点本身是元素（无嵌套），直接取根
        if let Some(first) = root.first_child() {
            ids.push(first.id());
        }
    }
    ids
}

/// 获取目标的下一个兄弟节点 id
fn get_next_sibling_id(doc: &Html, target: ego_tree::NodeId) -> Option<ego_tree::NodeId> {
    let node = doc.tree.get(target)?;
    let parent = node.parent()?;
    let mut found = false;
    for child in parent.children() {
        let id = child.id();
        if found {
            return Some(id);
        }
        if id == target {
            found = true;
        }
    }
    None
}

/// 获取目标的第一个子节点 id
fn get_first_child_id(doc: &Html, target: ego_tree::NodeId) -> Option<ego_tree::NodeId> {
    let node = doc.tree.get(target)?;
    node.first_child().map(|c| c.id())
}

#[op2]
#[string]
pub fn op_jsoup_before(#[string] html: String, #[string] css: String, #[string] content: String) -> String {
    if css.is_empty() { return html; }

    let doc = Html::parse_document(&html);
    let selector = match Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return html,
    };

    let targets: Vec<ego_tree::NodeId> = doc.select(&selector).map(|el| el.id()).collect();
    if targets.is_empty() { return html; }

    let fragment = parse_fragment(&content);
    let frag_ids = get_fragment_children_ids(&fragment);
    if frag_ids.is_empty() { return html; }

    let sink = scraper::HtmlTreeSink(RefCell::new(doc.clone()));

    // 插入到每个目标之前
    for target in &targets {
        for frag_id in &frag_ids {
            sink.append_before_sibling(target, NodeOrText::AppendNode(*frag_id));
        }
    }

    let result = sink.finish();
    result.html()
}

#[op2]
#[string]
pub fn op_jsoup_after(#[string] html: String, #[string] css: String, #[string] content: String) -> String {
    if css.is_empty() { return html; }

    let doc = Html::parse_document(&html);
    let selector = match Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return html,
    };

    let targets: Vec<ego_tree::NodeId> = doc.select(&selector).map(|el| el.id()).collect();
    if targets.is_empty() { return html; }

    let fragment = parse_fragment(&content);
    let frag_ids = get_fragment_children_ids(&fragment);
    if frag_ids.is_empty() { return html; }

    let sink = scraper::HtmlTreeSink(RefCell::new(doc.clone()));

    for target in &targets {
        // after = 在下一个兄弟之前插入；没有下一个兄弟则 append
        match get_next_sibling_id(&doc, *target) {
            Some(next_id) => {
                for frag_id in &frag_ids {
                    sink.append_before_sibling(&next_id, NodeOrText::AppendNode(*frag_id));
                }
            }
            None => {
                if let Some(parent_id) = doc.tree.get(*target).and_then(|n| n.parent().map(|p| p.id())) {
                    for frag_id in &frag_ids {
                        sink.append(&parent_id, NodeOrText::AppendNode(*frag_id));
                    }
                }
            }
        }
    }

    let result = sink.finish();
    result.html()
}

#[op2]
#[string]
pub fn op_jsoup_prepend(#[string] html: String, #[string] css: String, #[string] content: String) -> String {
    if css.is_empty() { return html; }

    let doc = Html::parse_document(&html);
    let selector = match Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return html,
    };

    let targets: Vec<ego_tree::NodeId> = doc.select(&selector).map(|el| el.id()).collect();
    if targets.is_empty() { return html; }

    let fragment = parse_fragment(&content);
    let frag_ids = get_fragment_children_ids(&fragment);
    if frag_ids.is_empty() { return html; }

    let sink = scraper::HtmlTreeSink(RefCell::new(doc.clone()));

    for target in &targets {
        match get_first_child_id(&doc, *target) {
            Some(first_id) => {
                for frag_id in &frag_ids {
                    sink.append_before_sibling(&first_id, NodeOrText::AppendNode(*frag_id));
                }
            }
            None => {
                for frag_id in &frag_ids {
                    sink.append(target, NodeOrText::AppendNode(*frag_id));
                }
            }
        }
    }

    let result = sink.finish();
    result.html()
}

#[op2]
#[string]
pub fn op_jsoup_append(#[string] html: String, #[string] css: String, #[string] content: String) -> String {
    if css.is_empty() { return html; }

    let doc = Html::parse_document(&html);
    let selector = match Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return html,
    };

    let targets: Vec<ego_tree::NodeId> = doc.select(&selector).map(|el| el.id()).collect();
    if targets.is_empty() { return html; }

    let fragment = parse_fragment(&content);
    let frag_ids = get_fragment_children_ids(&fragment);
    if frag_ids.is_empty() { return html; }

    let sink = scraper::HtmlTreeSink(RefCell::new(doc.clone()));

    for target in &targets {
        for frag_id in &frag_ids {
            sink.append(target, NodeOrText::AppendNode(*frag_id));
        }
    }

    let result = sink.finish();
    result.html()
}
