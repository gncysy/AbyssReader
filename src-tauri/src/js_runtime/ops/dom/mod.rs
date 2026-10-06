// ============================================
// DOM 模块 — 句柄式 DOM 操作（对齐 Jsoup）
// ============================================
//
// 拆分为：
// - handle:    句柄表 + execution 隔离 + RAII 释放
// - selector:  Selector 编译缓存
// - parse:     HTML → (tree_handle, root_node_id)
// - query:     选择器查询
// - extract:   文本 / 属性 / HTML 提取
// - navigate:  树导航
// - mutate:    原地改树

pub mod extract;
pub mod handle;
pub mod mutate;
pub mod navigate;
pub mod parse;
pub mod query;
pub mod selector;
