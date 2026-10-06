// ============================================
// DOM 解析 — HTML → [tree_handle, root_node_id]
// ============================================
//
// 对齐 Jsoup 语义：返回文档根，不是 body 第一个元素。
// root_node_id 是文档节点的 id（非元素节点），
// Element.select() 从该节点子树内选（等价于整个文档）。

use deno_core::op2;
use scraper::Html;

use super::handle::{current_exec_id, with_table};

/// 解析完整 HTML 文档。
#[op2]
#[serde]
pub fn op_jsoup_parse(#[string] html: String) -> Vec<u32> {
    register(Html::parse_document(&html))
}

/// 解析 HTML 片段。
#[op2]
#[serde]
pub fn op_jsoup_parse_fragment(#[string] html: String) -> Vec<u32> {
    register(Html::parse_fragment(&html))
}

fn register(doc: Html) -> Vec<u32> {
    let root_id = doc.tree.root().id();
    let exec_id = current_exec_id();
    with_table(|t| {
        let handle = t.insert(doc, exec_id);
        match t.get_mut(handle) {
            Some(entry) => {
                let root_u32 = entry.encode_node(root_id);
                vec![handle, root_u32]
            }
            None => vec![handle, 0],
        }
    })
}
