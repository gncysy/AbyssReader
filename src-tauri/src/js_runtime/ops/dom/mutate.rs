// ============================================
// DOM 修改 — before / after / prepend / append / detach / remove
// ============================================
//
// 原地改树（对齐 Jsoup 语义）。
// ego-tree 的 insert_id_before / insert_id_after 不自动 detach，
// 所以被插入的节点必须是孤儿（用 orphan 创建）。
//
// ego-tree 0.11 API 事实（由编译器验证）：
// - Tree::orphan(value) -> NodeMut<'_, T>
// - NodeMut::id() -> NodeId
// 所以取 NodeId 要写成 `tree.orphan(value).id()`

use deno_core::op2;
use ego_tree::{NodeId, Tree};
use scraper::{Html, Node};

use super::handle::{current_exec_id, with_table};
use super::selector::get_selector;

/// 递归把 src 树里的 src_id 子树复制到 dst 树里，返回新创建的孤儿节点 id。
fn copy_subtree(src_tree: &Tree<Node>, src_id: NodeId, dst_tree: &mut Tree<Node>) -> Option<NodeId> {
    let src_node = src_tree.get(src_id)?;
    let value = src_node.value().clone();
    let child_ids: Vec<NodeId> = src_node.children().map(|c| c.id()).collect();

    // orphan 返回 NodeMut，用 .id() 取 NodeId
    let new_id: NodeId = dst_tree.orphan(value).id();

    for child_id in child_ids {
        if let Some(child_copy) = copy_subtree(src_tree, child_id, dst_tree) {
            if let Some(mut parent_mut) = dst_tree.get_mut(new_id) {
                parent_mut.append_id(child_copy);
            }
        }
    }
    Some(new_id)
}

/// 把一段 HTML 解析成 fragment，把所有顶层节点复制到目标树里。
/// 返回复制后的孤儿节点 id 列表。
fn build_fragment_nodes(html: &str, dst_tree: &mut Tree<Node>) -> Vec<NodeId> {
    let frag = Html::parse_fragment(html);
    let frag_root = frag.tree.root();
    let top_ids: Vec<NodeId> = frag_root.children().map(|c| c.id()).collect();
    top_ids
        .into_iter()
        .filter_map(|id| copy_subtree(&frag.tree, id, dst_tree))
        .collect()
}

#[op2(fast)]
pub fn op_jsoup_before(handle: u32, node: u32, #[string] html: String) {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let target_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        let has_parent = entry
            .html()
            .tree
            .get(target_id)
            .and_then(|n| n.parent())
            .is_some();
        if !has_parent {
            return;
        }
        let new_ids = build_fragment_nodes(&html, &mut entry.html_mut().tree);
        // 逆序插入，保持文档顺序
        for new_id in new_ids.into_iter().rev() {
            if let Some(mut target_mut) = entry.html_mut().tree.get_mut(target_id) {
                target_mut.insert_id_before(new_id);
            }
        }
    });
}

#[op2(fast)]
pub fn op_jsoup_after(handle: u32, node: u32, #[string] html: String) {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let target_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        let has_parent = entry
            .html()
            .tree
            .get(target_id)
            .and_then(|n| n.parent())
            .is_some();
        if !has_parent {
            return;
        }
        let new_ids = build_fragment_nodes(&html, &mut entry.html_mut().tree);
        // 逆序插入到 target 之后，保证最终顺序正确
        for new_id in new_ids.into_iter().rev() {
            if let Some(mut target_mut) = entry.html_mut().tree.get_mut(target_id) {
                target_mut.insert_id_after(new_id);
            }
        }
    });
}

#[op2(fast)]
pub fn op_jsoup_prepend(handle: u32, node: u32, #[string] html: String) {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let target_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        let new_ids = build_fragment_nodes(&html, &mut entry.html_mut().tree);
        // 逆序 prepend，保证顺序
        for new_id in new_ids.into_iter().rev() {
            if let Some(mut target_mut) = entry.html_mut().tree.get_mut(target_id) {
                target_mut.prepend_id(new_id);
            }
        }
    });
}

#[op2(fast)]
pub fn op_jsoup_append(handle: u32, node: u32, #[string] html: String) {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let target_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        let new_ids = build_fragment_nodes(&html, &mut entry.html_mut().tree);
        for new_id in new_ids {
            if let Some(mut target_mut) = entry.html_mut().tree.get_mut(target_id) {
                target_mut.append_id(new_id);
            }
        }
    });
}

/// 把节点自身从树中摘除（对齐 Jsoup 的 Element.remove()）。
#[op2(fast)]
pub fn op_jsoup_detach(handle: u32, node: u32) {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let node_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        if let Some(mut nm) = entry.html_mut().tree.get_mut(node_id) {
            nm.detach();
        }
    });
}

/// 在子树内 select，把匹配的节点从树中摘除。
#[op2(fast)]
pub fn op_jsoup_remove_in_subtree(handle: u32, node: u32, #[string] css: String) {
    let exec_id = current_exec_id();
    let selector = match get_selector(&css) {
        Some(s) => s,
        None => return,
    };
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return;
        }
        let entry = match t.get_mut(handle) {
            Some(e) => e,
            None => return,
        };
        let root_id = match entry.decode_node(node) {
            Some(id) => id,
            None => return,
        };
        let ids: Vec<NodeId> = {
            let root = match entry.html().tree.get(root_id) {
                Some(n) => n,
                None => return,
            };
            let mut out = Vec::new();
            for desc in root.descendants() {
                if let Some(el) = scraper::ElementRef::wrap(desc) {
                    if selector.matches(&el) {
                        out.push(desc.id());
                    }
                }
            }
            out
        };
        for id in ids {
            if let Some(mut nm) = entry.html_mut().tree.get_mut(id) {
                nm.detach();
            }
        }
    });
}
