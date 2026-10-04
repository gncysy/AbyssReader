// ============================================
// v-no-drag 指令
// ============================================
//
// 解决问题：Tauri 窗口拖动区域（-webkit-app-region: drag）
// 与上层可交互元素的事件冲突。
//
// 背景：
// - WebKit 的 -webkit-app-region: drag 区域**优先级高于 z-index**，
//   即使用 z-index 更高的元素覆盖拖动区，鼠标事件仍被拖动区捕获。
// - 这会导致弹窗顶部（与标题栏重叠区域）的按钮点击被"吃掉"，
//   变成拖动窗口。
//
// 设计原则：
// 1. 拖动区（.titlebar-drag）保持 drag —— 永远可拖动
// 2. 弹窗/全屏组件根容器设 no-drag —— 整个组件脱离拖动区
// 3. **不遍历后代**：-webkit-app-region 的作用域是"元素区域"，
//    根容器设 no-drag 后其后代都在 no-drag 区域内
//
// 用法：
// <Teleport to="body">
//   <div class="modal-overlay" v-no-drag>
//     ...
//   </div>
// </Teleport>

export const vNoDrag = {
  mounted(el: HTMLElement): void {
    el.style.setProperty('-webkit-app-region', 'no-drag', 'important')
  },
  unmounted(el: HTMLElement): void {
    el.style.removeProperty('-webkit-app-region')
  },
}
