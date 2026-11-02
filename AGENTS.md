# AGENTS.md — 墨阅（AbyssReader）开发指南

本文件面向在本仓库工作的 AI 编码 agent。开始修改前先阅读本文件；更具体的项目内约定优先于通用习惯，用户的直接指令优先于本文件。

## 项目概览

墨阅是跨平台桌面阅读器，兼容 Legado 书源生态，支持文本小说、漫画、RSS 订阅、EPUB 和本地 TXT。项目分为三层：

| 层 | 位置 | 职责 |
|---|---|---|
| 前端 | `src/` | Vue 3 + TypeScript + Pinia + Naive UI，页面、组件、业务 composable、Tauri IPC 封装 |
| 书源引擎 | `engine/` | 与框架无关的 TypeScript 规则引擎：CSS / XPath / JSONPath / JS / Regex、URL、加密、网络抽象 |
| 桌面后端 | `src-tauri/` | Rust + Tauri 2：命令、SQLite/文件缓存、HTTP、Deno Core JS 沙箱、EPUB 协议 |

技术栈与功能说明见 `README.md`，但不要把它当作实现细节的唯一依据；以代码为准。

## 常用命令

在仓库根目录执行：

```bash
npm install                 # 安装依赖
npm run tauri dev           # 桌面开发模式（自动启动 Vite）
npm run dev                 # 仅前端 Vite；没有 Tauri API，无法完整运行应用
npm run typecheck           # vue-tsc + worker tsconfig 双类型检查
npm run lint                # ESLint
npm run lint:fix            # ESLint 自动修复
npm run format              # Prettier 写入 src/ 与 engine/
npm run format:check        # Prettier 检查
npm test                    # Vitest watch 模式
npx vitest run              # 单次运行全部测试
npx vitest run tests/unit/src/utils/reading-position.test.ts   # 运行单个测试
npm run build               # 类型检查 + Vite 生产构建，输出 dist/
npm run tauri build         # 完整桌面发布构建（前端 + Rust + 安装包）
```

后端命令：

```bash
cd src-tauri
cargo check                 # 只检查 Rust 编译
cargo build --release       # 只编译 Rust 可执行文件
```

完整构建产物：

- `src-tauri/target/release/AbyssReader.exe`（Windows 可执行文件）
- `src-tauri/target/release/bundle/nsis/AbyssReader_<version>_x64-setup.exe`（NSIS 安装包）

注意事项：

- Windows 上执行发布构建前，先关闭正在运行的 `AbyssReader.exe`，否则链接或覆盖可执行文件会因文件占用失败。
- `npm run tauri build` 会自动执行 `beforeBuildCommand`（`npm run build`），不要在 `dist/` 过期的情况下只跑 `cargo build --release`。
- `dist/`、`src-tauri/target/` 是构建产物，已加入 `.gitignore`，不要手改或提交。
- `src-tauri/gen/schemas/` 由 Tauri 生成，不要手工编辑。

## 目录与职责

```text
src/
├── main.ts                 # 应用入口：必须先 import services/index.ts 完成依赖注入
├── App.vue                 # 外壳、标题栏、全局 provider、路由出口
├── components/             # 通用与业务组件（reader/ book/ rss/ settings/ ...）
├── composables/            # 组合式业务逻辑，命名 useXxx
├── services/               # Tauri invoke 封装 + 引擎依赖注入 + 缓存/网络/EPUB 等
├── stores/                 # Pinia setup stores
├── views/                  # 路由页面
├── constants/              # 常量（阅读器、主题、UI、同步键名等）
├── types/                  # 共享类型
├── utils/                  # 纯工具函数
└── workers/                # Web Worker（独立 tsconfig，WebWorker 环境）

engine/
├── parser/                 # CSS / XPath / JSONPath / JS 规则解析
├── business/               # 搜索、详情、目录、正文、发现、漫画、净化
├── url/                    # URL 分析与拼接
├── crypto/                 # 摘要、Base64、AES/DES/RSA
├── network/                # HttpClient 抽象与拦截器
├── context/                # 书籍/章节变量
├── log/                    # 日志与诊断
└── types.ts                # 引擎公共类型

src-tauri/src/
├── lib.rs                  # Tauri Builder、窗口、命令注册
├── commands/               # 按领域拆分的 #[tauri::command]
├── js_runtime/             # Deno Core 运行时、Legado polyfills、ops
├── network/                # reqwest 请求与请求头处理
├── storage/                # SQLite、文件缓存
└── error.rs                # 统一错误
```

## 编码约定

- **语言**：代码注释、用户可见文案、提交信息使用中文；标识符、命令和 API 保持英文。
- **TypeScript**：`strict` 开启。避免 `any`（ESLint 会警告），优先用 `unknown` + 类型守卫收窄；`catch` 到的错误按 `unknown` 处理。
- **导入路径**：`@/` 指向 `src/`，`@engine/` 指向 `engine/`。项目统一保留 `.js` 扩展名（例如 `@/stores/reader.js`、`@engine/parser/index.js`），新增导入请保持一致。
- **Vue**：使用 `<script setup lang="ts">` 和 Composition API；可复用逻辑放 `src/composables/useXxx.ts`；Pinia 使用 setup store。
- **格式**：Prettier 配置为无分号、单引号、尾随逗号、2 空格、行宽 120。不要对无关文件做全文件格式化；仓库里存在历史未格式化文件。
- **CSS**：优先使用现有 CSS 变量和 `data-theme` 主题机制，不要把颜色硬编码进组件；浮层 z-index 使用 `src/constants/ui.ts` 的 `Z_INDEX`。
- **IPC**：Tauri `invoke` 调用优先放在 `src/services/*.ts` 中，组件和 composable 通过 service 调用。IPC 参数必须可 JSON 序列化；涉及 Vue 响应式 Proxy、DomNode 等对象时参考 `src/services/engine.ts` 中 `sanitizeValue` / `toPlainContext` 的做法，先脱掉 Proxy 并断开循环引用。
- **Worker**：`src/workers/` 使用独立的 `tsconfig.worker.json`（`lib: WebWorker`，无 DOM），不要在这里使用 `window`/`document`。

## 架构不变量

1. **`engine/` 必须保持环境无关**：不要 import Vue、Pinia、Tauri 或 Node 内置模块。JS 执行、HTTP、DOM 解析、登录等能力通过注入获得：
   - `setJsRuntime()`（`engine/parser/js-executor.ts`）
   - `setWebJsExecutor()`（`engine/parser/index.ts`）
   - `setLoginExecutor()`（`engine/login/index.ts`）
   - `setDomProvider()`（`engine/parser/dom/provider.ts`）
   - `getGlobalHttpClient().setAdapter()`（`engine/network/client.ts`）
   - `setLogBridge()`（`engine/log/index.ts`）

   注入入口集中在 `src/services/index.ts`，并且 `src/main.ts` 必须在挂载应用前导入它。

2. **书源 JS 只在 Rust 沙箱执行**：不要在前端用 `eval`/`new Function` 执行书源脚本。前端调用 `execute_js_rule`，沙箱实现位于 `src-tauri/src/js_runtime/`。修改 polyfill 时保持 Legado/Rhino 语义兼容。

3. **新增 Tauri 命令的完整链路**：
   - 在 `src-tauri/src/commands/<domain>.rs` 实现 `#[tauri::command]`；
   - 在 `src-tauri/src/commands/mod.rs` 中 `pub use`；
   - 在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 注册；
   - 在 `src/services/<domain>.ts` 增加类型化封装；
   - 最后从组件/composable 调用。

4. **新增书源规则能力**：优先在 `engine/parser/` 或 `engine/business/` 实现纯函数，并补 `tests/unit/engine/` 测试。保持 Legado 的 CSS/XPath/JSoup 语义，不要为了单个书源破坏通用规则。

5. **持久化**：应用数据通过 `src/services/store.ts` 读写 SQLite（键名见 `src/constants/sync.ts` 与各 store）。修改导出/同步范围时同步更新 `src/views/settings/data.vue` 的 `SYNC_KEYS` 和 `EMPTY_VALUES`。

6. **缓存**：章节缓存分两层——前端 `src/services/cache.ts` 的内存 LRU，以及 Rust 侧 `src-tauri/src/storage/cache.rs` 的文件缓存（cover/toc/content/comic/image/lib）。抓取失败的提示文案不要写入缓存；缓存 key 变更要考虑旧数据失效。

7. **跨平台**：不要硬编码盘符或平台路径；使用 Tauri dialog/path API。Windows、macOS、Linux 都是目标平台。

8. **安全**：不要削弱现有的沙箱、网络或文件访问限制；不要把 Cookie、WebDAV 密码、登录凭据写入日志或提交到仓库。

## 阅读器（Reader）实现要点

阅读进度保存在 `readingProgress`：

```ts
{
  bookUrl: string
  chapterId: number
  chapterPos: number   // 0~10000 的整数，表示章节内滚动百分比
  chapterTitle: string
  updatedAt: string
}
```

- `chapterPos` 与 0~1 百分比的换算统一使用 `src/utils/reading-position.ts`，不要在各处重复乘除 10000。
- 打开阅读器时，`src/components/reader/Reader.vue` 读取进度并调用 `loadChapter(false, restorePercent)`。
- `src/composables/useReaderContent.ts` 的 `loadChapter(forceRefresh, restorePercent)` 负责加载后定位；不要在定位之后又把 `scrollTop` 重置为 0。
- 位置恢复使用 `ResizeObserver` 处理图片异步加载导致的内容高度变化；用户滚动、按键或点击后应停止自动校正。
- `_restoreReadingPosition === false` 表示用户从目录明确点选章节，应从章节开头开始；只有「继续阅读」或普通打开才恢复位置。
- 滚动过程中会以 800ms 防抖保存进度；`handleClose()` 在章节尚未加载/定位完成时不应写入 0，避免覆盖已有进度。
- EPUB 阅读器（`src/components/reader/EpubReader.vue`）使用同一 `chapterPos` 协议，修改协议时两端都要兼容。

## 测试

- 测试位于 `tests/unit/`，目录结构镜像源码；使用 Vitest，默认 `environment: 'node'`。
- 纯逻辑优先：引擎解析、URL、加密、工具函数、进度换算都应可直接单测，不依赖 Tauri 或浏览器。
- 现有测试普遍使用相对路径 + `.js` 扩展名导入源码（如 `../../../../src/utils/helpers.js`）；新增测试沿用该风格即可。
- 需要 DOM 的测试目前没有默认环境配置，新增前先调整测试配置并确认不影响现有 377+ 用例。
- 完成修改前至少执行：

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
```

涉及 Rust 或发布产物时，再执行 `cd src-tauri && cargo check` 或 `npm run tauri build`。

## 本地开发环境备注（此检出）

以下内容针对当前 Windows + WSL 工作副本，不是所有平台的通用要求：

- 仓库位于 Windows 文件系统，`node_modules` 由 Windows 安装。在 WSL 下直接跑 `npx vitest` / `vite build` 可能因缺少 `@rollup/rollup-linux-x64-gnu` 失败。可通过 Windows Node 执行：

```bash
cmd.exe /c "cd /d C:\Apps\AbyssReader && npx vitest run"
cmd.exe /c "cd /d C:\Apps\AbyssReader && npm run build"
```

- Tauri 发布构建应使用 Windows 工具链（WebView2 + MSVC + Rust stable）。完整构建约 3 分钟；NSIS 工具由 Tauri 缓存在 `%LOCALAPPDATA%\tauri\NSIS`。
- 构建前确认 `AbyssReader.exe` 未运行，必要时先结束进程再构建。

## 构建约定

- **每次新增功能或修复 bug 后，必须执行构建**，确认构建通过后再进行本地提交和交付，不要只改源码而不验证构建。
- 默认执行完整桌面构建：

```bash
npm run tauri build
```

这会重新构建前端、编译 `src-tauri` 的 Rust release，并更新可执行文件和 NSIS 安装包。

- 只改前端、且本轮明确不需要桌面成品时，可以至少执行 `npm run build`；但最终交付或需要验证桌面行为前，必须补跑 `npm run tauri build`。
- 改动涉及 Rust、Tauri 命令、权限/capability、`tauri.conf.json` 或安装包配置时，必须执行 `npm run tauri build`，不能只用 `npm run build`。
- 构建前确认 `AbyssReader.exe` 未运行；需要结束正在运行的应用时先告知用户。
- 构建必须成功（退出码 0）。构建失败时先修复，不要提交或声称任务完成。
- 构建产物位于 `dist/`、`src-tauri/target/`，已加入 `.gitignore`，不要提交。
- 仅修改文档（如 README、AGENTS.md）时可以跳过构建；如果同时改了任何源码，仍按上述规则构建。
- 最终回复中应说明执行了哪种构建、是否成功，以及产物路径。

## Git 提交约定

- **每次修复 bug 或增加新功能后，必须先按「构建约定」完成构建，再在本地创建 git commit**，不要攒到最后一次性提交。
- 一个可独立验证的修复或功能对应一个提交；修复与功能尽量分开，不要在一个提交里混入无关改动。
- 提交前先完成与改动相关的验证（`npm run typecheck`、`npm run lint`、`npx vitest run`，以及「构建约定」要求的构建），并检查 `git diff` 与 `git status`。
- 只 `git add` 本次改动相关的文件。不要用 `git add -A` 把构建产物、缓存、临时文件、凭据或其他人的未完成改动一起提交。
- 提交信息沿用仓库现有风格，使用中文描述：
  - `fix(reader): 修复重新打开书籍时未恢复阅读位置`
  - `feat(reader): 增加章节内位置恢复`
  - `docs: 更新 AGENTS.md 开发指南`
  - `chore(deps): 更新依赖锁文件`
  - scope 使用模块名，如 `reader`、`content`、`book-source`、`settings`、`rss`。
- **默认只做本地提交，不执行 `git push`**。推送、改写历史、`rebase`、`commit --amend`、`reset --hard` 等操作必须获得用户明确许可。
- 如果受环境限制无法完成某项验证，不要静默跳过；在提交说明或最终回复中写明未验证的内容与原因。
- 不要为了“让工作区干净”而提交编译不过或明显失败的代码。

## 变更与验收

- 保持改动聚焦，不顺手重构无关模块，不提交 `dist/`、`src-tauri/target/` 或本地缓存。
- 修改前先搜索现有实现和调用链（尤其是跨 `src` ↔ `engine` ↔ `src-tauri` 的协议字段）。
- 交付前检查 `git status` 与 `git diff`，确认没有调试代码、临时文件或凭据。
- 面向用户说明改动时使用中文，写清行为变化、验证命令和已知限制。
