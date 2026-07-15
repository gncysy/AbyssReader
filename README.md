# 📖 墨阅 (AbyssReader)

> 桌面端小说阅读器 · 兼容开源阅读书源 · 纯净无广告

基于 Electron + Vue 3 + TypeScript 构建，支持多书源并发搜索、本地 TXT 导入、规则解析。

## ✨ 功能特性

- 📚 **书架管理** – 网络书籍收藏与本地 TXT 导入，自动保存阅读进度
- 🔍 **多书源搜索** – 兼容开源阅读规则，多书源并发搜索，实时进度反馈
- 📖 **沉浸阅读** – 深色 / 浅色 / 护眼三种主题，可调字号与行距，支持滚动进度保存
- 📦 **书源管理** – 导入 / 导出 JSON 书源，兼容开源阅读格式，支持书源分组与调试
- ☁️ **WebDAV 同步** – 与开源阅读 (Legado) 无缝衔接，同步书架、书源和阅读进度
- 📄 **本地 TXT 阅读** – 支持导入本地 TXT 文件，自动识别章节并分页
- 🔒 **数据安全** – electron-store 加密存储，数据不上云
- 🖥️ **跨平台** – 支持 Windows、macOS、Linux

## 🛠️ 技术栈

- Electron – 跨平台桌面框架
- Vue 3 – 响应式 UI 框架
- TypeScript – 类型安全
- Pinia – 状态管理
- Naive UI – Vue 3 组件库
- Cheerio – HTML 解析
- CryptoJS – 加密解密 (AES/MD5/SHA)
- Axios – HTTP 客户端

## 📁 项目结构

AbyssReader/
├── resources/                 # 应用图标与资源
│   └── icons/
├── src/
│   ├── engine/                # 核心解析引擎
│   │   ├── context/           # 上下文存储与变量管理
│   │   ├── crypto/            # 加密模块 (AES / DES / MD5 / Base64 / RSA)
│   │   ├── dom/               # DOM 解析与操作
│   │   ├── network/           # HTTP 客户端 (Cookie / 拦截器)
│   │   ├── platform/          # 平台适配层 (Electron API 桥接)
│   │   ├── rule-parser/       # 规则解析器 (CSS / XPath / JSON / JS / 正则)
│   │   ├── utils/             # 引擎内部工具
│   │   ├── book-info.ts       # 书籍详情解析
│   │   ├── content.ts         # 正文获取与缓存 (支持后台更新)
│   │   ├── explore.ts         # 发现页分类与书籍浏览
│   │   ├── index.ts           # 引擎统一出口
│   │   ├── search.ts          # 搜索 (单源 / 多源并发)
│   │   ├── source-helper.ts   # 书源规范化
│   │   └── toc.ts             # 目录获取 (支持 @js: 动态生成)
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 主进程入口
│   │   ├── ipc-handlers.ts    # IPC 通信处理器
│   │   ├── preload.cjs        # 预加载脚本 (安全桥接)
│   │   ├── window-manager.ts  # 窗口管理
│   │   ├── webview-handler.ts # WebView 验证码处理器
│   │   └── crypto-handler.ts  # RSA 加密处理器
│   ├── renderer/              # Vue 渲染进程
│   │   ├── api/               # IPC 类型安全封装
│   │   ├── components/        # 公共组件
│   │   │   ├── Reader.vue     # 阅读器核心 (含目录缓存与后台更新)
│   │   │   ├── BookDetail.vue # 书籍详情浮窗 (含分页目录)
│   │   │   └── DebugPanel.vue # 书源调试面板
│   │   ├── pages/             # 页面视图
│   │   │   ├── Bookshelf.vue  # 书架 (支持书源关联修复)
│   │   │   ├── Explore.vue    # 发现
│   │   │   ├── Market.vue     # 书源市场
│   │   │   ├── Search.vue     # 搜索
│   │   │   ├── Settings.vue   # 设置 (含 WebDAV)
│   │   │   ├── SourceManager.vue # 书源管理 (含批量测试)
│   │   │   └── settings/      # 设置子页面
│   │   ├── router/            # 路由配置
│   │   ├── store/             # Pinia 状态管理
│   │   ├── styles/            # 全局样式 (深色/浅色/护眼)
│   │   ├── utils/             # 工具函数
│   │   ├── App.vue            # 根组件
│   │   ├── index.html         # HTML 模板
│   │   └── main.ts            # 渲染进程入口
│   └── shared/                # 跨进程共享
│       ├── constants.ts       # 全局常量
│       ├── store-keys.ts      # 存储键名
│       └── types.ts           # 类型定义
├── scripts/                   # 构建脚本
├── electron-builder.yml       # 打包配置
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript 配置
└── vite.config.mts            # Vite 配置

## 🚀 快速开始

环境要求：
- Node.js >= 18
- npm >= 9

安装与运行：

```bash
git clone https://github.com/gncysy/AbyssReader.git
cd AbyssReader
npm install --legacy-peer-deps
npm run electron:dev
npm run electron:build
```

## 📖 使用指南

### 导入书源
进入「书源管理」页面，点击「粘贴 JSON」或「上传文件」，粘贴或选择开源阅读格式的书源 JSON。

### 搜索书籍
进入「搜索」页面，输入书名或作者，选择已启用的书源，点击搜索。

### WebDAV 同步
进入「设置」→「WebDAV 同步」，配置服务器地址、账号密码，即可与 Legado 同步数据。

## 📄 许可证

GPL-3.0

## 🙏 致谢

书源规则参考开源阅读 Legado，感谢开源阅读社区及书源维护者的贡献。