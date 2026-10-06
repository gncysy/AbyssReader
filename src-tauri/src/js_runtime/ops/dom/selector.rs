// ============================================
// Selector 编译缓存 — css → Selector（全局 LRU）
// ============================================
//
// 跨 execution 共享：Selector 编译成本与 HTML 无关，
// 同一规则在同一进程内复用有意义。

use parking_lot::Mutex;
use scraper::Selector;
use std::collections::HashMap;
use std::sync::LazyLock;

const CACHE_MAX: usize = 128;

struct SelectorCache {
    map: HashMap<String, Option<Selector>>,
    order: Vec<String>,
}

impl SelectorCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            order: Vec::new(),
        }
    }

    fn get(&mut self, css: &str) -> Option<Selector> {
        if let Some(cached) = self.map.get(css) {
            return cached.clone();
        }
        let parsed = Selector::parse(css).ok();
        if self.map.len() >= CACHE_MAX {
            if let Some(oldest) = self.order.first().cloned() {
                self.map.remove(&oldest);
                self.order.remove(0);
            }
        }
        self.map.insert(css.to_string(), parsed.clone());
        self.order.push(css.to_string());
        parsed
    }
}

static CACHE: LazyLock<Mutex<SelectorCache>> = LazyLock::new(|| Mutex::new(SelectorCache::new()));

/// 编译 CSS 选择器，带 LRU 缓存。无效选择器返回 None。
pub fn get_selector(css: &str) -> Option<Selector> {
    CACHE.lock().get(css)
}
