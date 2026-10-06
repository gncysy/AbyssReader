// ============================================
// DOM 句柄表 — tree_handle → Html 树 + execution 隔离
// ============================================
//
// 设计要点：
// - scraper::Html 不是 Send（tendril::NonAtomic 用 Cell），
//   所以句柄表必须用 thread_local 存储，不能用 static Mutex。
// - Deno JsRuntime 是 thread_local，op 在 JS 线程同步调用，
//   thread_local 保证同一线程可见。
// - tree_handle 是全局自增 u32（只在本线程内保证唯一），映射到一棵 Html 树
// - 每棵树归属一个 execution（exec_id），execution 结束批量释放
// - NodeId 是 ego_tree 的内部 id，通过稳定映射编码为 u32 供 JS 使用

use ego_tree::NodeId;
use scraper::Html;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;

thread_local! {
    static CURRENT_EXEC_ID: Cell<u64> = const { Cell::new(0) };
    static HANDLE_TABLE: RefCell<HandleTable> = RefCell::new(HandleTable::new());
}

static NEXT_EXEC_ID: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(1);

/// 生成一个全局唯一的 execution id。
pub fn next_exec_id() -> u64 {
    NEXT_EXEC_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

/// 当前线程正在执行的 execution id（0 表示无活跃 execution）。
pub fn current_exec_id() -> u64 {
    CURRENT_EXEC_ID.with(|c| c.get())
}

fn set_current_exec_id(id: u64) {
    CURRENT_EXEC_ID.with(|c| c.set(id));
}

// ─── 树条目 ───

/// 一棵 DOM 树及其节点 id 编码映射。
pub struct TreeEntry {
    html: Html,
    node_to_u32: HashMap<NodeId, u32>,
    u32_to_node: HashMap<u32, NodeId>,
    next_node_u32: u32,
}

impl TreeEntry {
    fn new(html: Html) -> Self {
        Self {
            html,
            node_to_u32: HashMap::new(),
            u32_to_node: HashMap::new(),
            next_node_u32: 1,
        }
    }

    pub fn html(&self) -> &Html {
        &self.html
    }

    pub fn html_mut(&mut self) -> &mut Html {
        &mut self.html
    }

    /// 把 ego_tree 的 NodeId 编码为对外稳定 u32。
    /// 同一 NodeId 永远返回同一 u32，保证 JS 侧 element 等价性。
    pub fn encode_node(&mut self, id: NodeId) -> u32 {
        if let Some(&v) = self.node_to_u32.get(&id) {
            return v;
        }
        let v = self.next_node_u32;
        self.next_node_u32 = self.next_node_u32.saturating_add(1);
        self.node_to_u32.insert(id, v);
        self.u32_to_node.insert(v, id);
        v
    }

    /// 把对外 u32 解码回 NodeId。
    pub fn decode_node(&self, v: u32) -> Option<NodeId> {
        self.u32_to_node.get(&v).copied()
    }
}

// ─── 句柄表 ───

pub struct HandleTable {
    trees: HashMap<u32, TreeEntry>,
    tree_owner: HashMap<u32, u64>,
    exec_trees: HashMap<u64, Vec<u32>>,
    next_handle: u32,
}

impl HandleTable {
    fn new() -> Self {
        Self {
            trees: HashMap::new(),
            tree_owner: HashMap::new(),
            exec_trees: HashMap::new(),
            next_handle: 1,
        }
    }

    pub fn insert(&mut self, html: Html, exec_id: u64) -> u32 {
        let handle = self.next_handle;
        self.next_handle = self.next_handle.saturating_add(1);
        self.trees.insert(handle, TreeEntry::new(html));
        self.tree_owner.insert(handle, exec_id);
        self.exec_trees.entry(exec_id).or_default().push(handle);
        handle
    }

    pub fn get(&self, handle: u32) -> Option<&TreeEntry> {
        self.trees.get(&handle)
    }

    pub fn get_mut(&mut self, handle: u32) -> Option<&mut TreeEntry> {
        self.trees.get_mut(&handle)
    }

    /// 校验 handle 是否属于指定 execution。
    pub fn owns(&self, handle: u32, exec_id: u64) -> bool {
        self.tree_owner.get(&handle).copied() == Some(exec_id)
    }

    pub fn release_execution(&mut self, exec_id: u64) {
        if let Some(handles) = self.exec_trees.remove(&exec_id) {
            for h in handles {
                self.trees.remove(&h);
                self.tree_owner.remove(&h);
            }
        }
    }
}

/// 在句柄表上执行一段闭包（持 thread_local 借用）。
pub fn with_table<R>(f: impl FnOnce(&mut HandleTable) -> R) -> R {
    HANDLE_TABLE.with(|t| f(&mut t.borrow_mut()))
}

/// 校验 handle 归属后，以不可变引用执行闭包。
pub fn with_entry<R>(handle: u32, f: impl FnOnce(&TreeEntry) -> R) -> Option<R> {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return None;
        }
        t.get(handle).map(f)
    })
}

/// 校验 handle 归属后，以可变引用执行闭包。
pub fn with_entry_mut<R>(handle: u32, f: impl FnOnce(&mut TreeEntry) -> R) -> Option<R> {
    let exec_id = current_exec_id();
    with_table(|t| {
        if !t.owns(handle, exec_id) {
            return None;
        }
        t.get_mut(handle).map(f)
    })
}

// ─── ExecutionGuard ───

/// RAII guard：进入作用域时设置 CURRENT_EXEC_ID，退出时清空并释放所有句柄。
/// 即使 JS 执行 panic（被 catch_unwind 捕获），guard 也会在栈展开时清理。
pub struct ExecutionGuard {
    exec_id: u64,
}

impl ExecutionGuard {
    pub fn new(exec_id: u64) -> Self {
        set_current_exec_id(exec_id);
        ExecutionGuard { exec_id }
    }

    pub fn exec_id(&self) -> u64 {
        self.exec_id
    }
}

impl Drop for ExecutionGuard {
    fn drop(&mut self) {
        set_current_exec_id(0);
        with_table(|t| t.release_execution(self.exec_id));
    }
}
