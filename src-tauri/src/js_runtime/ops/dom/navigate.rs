// ============================================
// DOM 导航 — children / child / parent / siblings
// ============================================
//
// 所有 "单个节点" 方法用 0 表示 null（对齐 Jsoup 的 @Nullable）。
// u32 编码从 1 开始，0 永远不是有效节点。

use deno_core::op2;
use ego_tree::NodeId;

use super::handle::{current_exec_id, with_table};

fn decode_and<F, R>(handle: u32, node: u32, f: F) -> Option<R>
where
    F: FnOnce(&mut super::handle::TreeEntry, NodeId) -> R,
{
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return None;
        }
        let entry = t.get_mut(handle)?;
        let node_id = entry.decode_node(node)?;
        Some(f(entry, node_id))
    })
}

fn is_element(node: &ego_tree::NodeRef<'_, scraper::node::Node>) -> bool {
    node.value().is_element()
}

#[op2]
#[serde]
pub fn op_jsoup_children(handle: u32, node: u32) -> Vec<u32> {
    decode_and(handle, node, |entry, id| {
        let ids: Vec<NodeId> = entry
            .html()
            .tree
            .get(id)
            .map(|n| n.children().filter(is_element).map(|c| c.id()).collect())
            .unwrap_or_default();
        ids.into_iter().map(|i| entry.encode_node(i)).collect()
    })
    .unwrap_or_default()
}

#[op2(fast)]
pub fn op_jsoup_child(handle: u32, node: u32, index: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        let child_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.children().filter(is_element).nth(index as usize).map(|c| c.id()));
        match child_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_child_count(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        entry
            .html()
            .tree
            .get(id)
            .map(|n| n.children().filter(is_element).count() as u32)
            .unwrap_or(0)
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_parent(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        let parent_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.parent().filter(is_element).map(|p| p.id()));
        match parent_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_next_sibling(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        // next_siblings 从"下一个兄弟"开始，不包含自己
        let sib_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.next_siblings().find(is_element).map(|s| s.id()));
        match sib_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_prev_sibling(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        // prev_siblings 从"上一个兄弟"开始，不包含自己
        let sib_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.prev_siblings().find(is_element).map(|s| s.id()));
        match sib_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_first_sibling(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        let sib_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.parent())
            .and_then(|p| p.children().find(is_element).map(|c| c.id()));
        match sib_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2(fast)]
pub fn op_jsoup_last_sibling(handle: u32, node: u32) -> u32 {
    decode_and(handle, node, |entry, id| {
        let sib_id = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.parent())
            .and_then(|p| p.children().filter(is_element).last().map(|c| c.id()));
        match sib_id {
            Some(i) => entry.encode_node(i),
            None => 0,
        }
    })
    .unwrap_or(0)
}

#[op2]
#[serde]
pub fn op_jsoup_siblings(handle: u32, node: u32) -> Vec<u32> {
    decode_and(handle, node, |entry, id| {
        let ids: Vec<NodeId> = entry
            .html()
            .tree
            .get(id)
            .and_then(|n| n.parent())
            .map(|p| {
                p.children()
                    .filter(|c| is_element(c) && c.id() != id)
                    .map(|c| c.id())
                    .collect()
            })
            .unwrap_or_default();
        ids.into_iter().map(|i| entry.encode_node(i)).collect()
    })
    .unwrap_or_default()
}
