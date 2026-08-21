# 墨阅 (AbyssReader)

墨阅是一款基于 Tauri 2 + Vue 3 + Rust 的跨平台桌面阅读器，书源规则体系参考 Legado 设计。支持自定义书源、正文净化、漫画阅读、WebDAV 同步。

> 本项目代码主要由 AI 辅助生成，仍在持续完善中，欢迎反馈问题。

## ✨ 功能

- **书源兼容**：兼容常见 Legado 书源格式，支持 CSS / XPath / JSONPath / JS 规则
- **多类型阅读**：文本小说、漫画
- **正文净化**：替换规则、段落重排、简繁转换
- **书架管理**：分组、封面缓存、阅读进度、换源
- **发现页**：分类浏览、无限滚动、筛选条件
- **订阅（RSS）**：订阅源管理、文章阅读、下载导入
- **WebDAV 同步**：备份 / 恢复，密码加密存储
- **调试助手**：搜索 / 目录 / 正文 / JS / WebView / 网络调试

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Pinia + Naive UI + TypeScript |
| 引擎 | TypeScript |
| 后端 | Rust + Tauri 2 |
| JS 运行时 | Deno Core + V8 |
| DOM 解析 | scraper（Rust）+ DOMParser（浏览器） |
| 存储 | SQLite + 文件缓存 |
| 网络 | reqwest |

## 📦 构建

### 环境要求

- Node.js 24+
- Rust stable

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
├── components/         # 通用组件
├── composables/        # 业务逻辑
├── services/           # Tauri invoke 封装 + 引擎注入
├── stores/             # Pinia 状态
├── views/              # 路由页面
├── constants/          # 命名常量
└── types/              # 类型定义

engine/                 # TS 规则引擎
├── parser/             # CSS/XPath/JSONPath/JS/Regex
├── business/           # 搜索/详情/目录/正文/发现
├── url/                # URL 解析
├── crypto/             # 加密
└── network/            # HTTP 接口

src-tauri/              # Rust 后端
├── commands/           # Tauri 命令
├── js_runtime/         # Deno Core 运行时 + polyfills
├── network/            # HTTP
└── storage/            # SQLite + 缓存
```

## 🔒 安全

- 书源 JS 在 Deno Core 沙箱中执行
- 内网 IP / localhost / file:// 拦截
- 文件操作限制在缓存目录内
- Cookie 使用 OS 密钥环加密
- WebDAV 密码 AES-GCM 加密

## 🙏 致谢

本项目使用或参考了以下开源项目：

- [Legado](https://github.com/gedoor/legado) — 书源规则体系与解析逻辑参考
- [Tauri](https://github.com/tauri-apps/tauri) — 跨平台桌面应用框架
- [Vue](https://github.com/vuejs/core) — 前端框架
- [Pinia](https://github.com/vuejs/pinia) — 状态管理
- [Naive UI](https://github.com/tusen-ai/naive-ui) — UI 组件库
- [Deno Core](https://github.com/denoland/deno_core) — JS 沙箱运行时
- [scraper](https://github.com/causal-agent/scraper) — Rust HTML 解析
- [reqwest](https://github.com/seanmonstar/reqwest) — Rust HTTP 客户端
- [rusqlite](https://github.com/rusqlite/rusqlite) — SQLite Rust 绑定
- [crypto-js](https://github.com/brix/crypto-js) — 前端加密
- [GSAP](https://github.com/greensock/GSAP) — 动画
- [jszip](https://github.com/Stuk/jszip) — ZIP 处理
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML 净化

感谢所有为开源生态做出贡献的开发者。

## 📄 许可证

GPL-3.0

## ⚠️ 免责声明

墨阅不生产、存储或分发任何书籍内容。所有内容均来自用户自行配置的书源所指向的第三方网站，版权归原作者所有。用户自行导入的书源、规则、脚本，其合法性由用户自行负责。详见 `src/assets/disclaimer.md`。
