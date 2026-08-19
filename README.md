# 墨阅 (AbyssReader)

墨阅是一款基于 Tauri 2 + Vue 3 + Rust 的跨平台桌面阅读器，核心引擎对齐开源阅读（Legado）的书源规则体系，支持自定义书源、正文净化、漫画阅读、WebDAV 同步等功能。

## ✨ 功能

- **书源兼容**：兼容 Legado 书源格式，支持 CSS / XPath / JSONPath / JS 规则解析
- **多类型阅读**：文本小说、漫画、音频
- **正文净化**：替换规则、段落重排、简繁转换、图片样式
- **书架管理**：分组、封面缓存、阅读进度记录、换源
- **发现页**：书源分类、无限滚动、筛选条件（toggle / select / text / button）
- **订阅（RSS）**：订阅源管理、文章列表、浏览模式、下载导入
- **WebDAV 同步**：备份 / 恢复 / 上传，密码加密存储
- **调试助手**：搜索 / 目录 / 正文 / JS / WebView / 网络调试
- **安全沙箱**：书源 JS 在 Deno Core 隔离运行，内网 IP 拦截，路径穿越防护，Cookie OS 密钥环加密

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Pinia + Naive UI + GSAP + TypeScript |
| 引擎 | TypeScript（零环境依赖，接口注入） |
| 后端 | Rust + Tauri 2 |
| JS 运行时 | Deno Core + V8（op 直通，无 IPC 序列化） |
| DOM 解析 | scraper（html5ever + selectors） |
| 存储 | SQLite（rusqlite）+ 文件缓存 |
| 网络 | reqwest（native-tls） |

## 📦 构建

### 环境要求

- Node.js 24+
- Rust stable
- 平台依赖见 `.github/workflows/build.yml`

### 开发

```bash
npm install
npm run dev
```

### 构建

```bash
npm run tauri build
```

## 🏗 架构

```
src/                    # Vue 前端
├── components/         # 通用组件（book/chapter/reader/common/debug/rss）
├── composables/        # 业务逻辑（无 DOM 操作）
├── services/           # Tauri invoke 封装 + 引擎注入
├── stores/             # Pinia 状态
├── views/              # 路由页面
├── constants/          # 命名常量
└── types/              # 类型定义

engine/                 # TS 规则引擎（纯函数，零环境依赖）
├── parser/             # 规则解析（CSS/XPath/JSONPath/JS/Regex）
├── business/           # 搜索/详情/目录/正文/发现解析
├── url/                # URL 解析
├── crypto/             # 加密
└── network/            # HTTP 客户端接口

src-tauri/              # Rust 后端
├── commands/           # Tauri 命令（薄层）
├── js_runtime/         # Deno Core 运行时
│   ├── ops/            # op 函数（ajax/crypto/dom/io/storage/webview）
│   └── polyfills/      # JS polyfill（core/dom/net）
├── network/            # HTTP + headers
├── storage/            # SQLite + 缓存
└── error.rs            # 错误类型
```

## 🔒 安全

- 书源 JS 在 Deno Core 沙箱执行，与主进程隔离
- 内网 IP / localhost / file:// 拦截
- 文件操作限制在缓存目录内，禁止路径穿越
- Cookie 使用 OS 密钥环加密存储
- WebDAV 密码使用 AES-GCM 加密

## 📄 许可证

GPL-3.0

## ⚠️ 免责声明

墨阅不生产、存储或分发任何书籍内容。所有内容均来自用户自行配置的书源所指向的第三方网站，版权归原作者所有。用户自行导入的书源、规则、脚本，其合法性由用户自行负责。详见 `src/assets/disclaimer.md`。
