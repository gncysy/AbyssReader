# 📖 墨阅 (AbyssReader)

![墨阅](resources/icons/512x512.png)

> 桌面端小说阅读器 · 兼容开源阅读书源 · 纯净无广告

基于 Electron + Vue 3 + TypeScript 构建，支持多书源并发搜索、本地 TXT 导入、规则解析。


## ✨ 功能特性

- 📚 **书架管理** – 网络书籍收藏与本地 TXT 导入，自动保存阅读进度
- 🔍 **多书源搜索** – 兼容开源阅读规则，多书源并发搜索
- 📖 **沉浸阅读** – 深色 / 浅色 / 护眼三种主题，可调字号与行距
- 📦 **书源管理** – 导入 / 导出 JSON 书源，兼容开源阅读格式
- 🔒 **数据安全** – electron-store 加密存储，数据不上云
- 🖥️ **跨平台** – 支持 Windows、macOS、Linux


## 🛠️ 技术栈

- Electron – 跨平台桌面框架
- Vue 3 – 响应式 UI 框架
- TypeScript – 类型安全
- Pinia – 状态管理
- Naive UI – Vue 3 组件库


## 📁 项目结构

```
AbyssReader/
├── resources/
│   └── icons/                   # 应用图标
│
├── src/
│   ├── engine/                  # 核心引擎
│   │   ├── context/             # 上下文存储与变量管理
│   │   ├── crypto/              # 加密模块（AES / DES / MD5 / Base64）
│   │   ├── dom/                 # DOM 解析与操作
│   │   ├── network/             # HTTP 客户端（Cookie / 拦截器）
│   │   ├── platform/            # 平台适配层
│   │   ├── rule-parser/         # 规则解析器（CSS / XPath / JSON / JS / 正则）
│   │   ├── utils/               # 引擎内部工具
│   │   ├── book-info.ts         # 书籍详情
│   │   ├── content.ts           # 正文获取与缓存
│   │   ├── index.ts             # 引擎统一出口
│   │   ├── search.ts            # 搜索（单源 / 多源并发）
│   │   ├── source-helper.ts     # 书源规范化
│   │   └── toc.ts               # 目录获取
│   │
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口
│   │   ├── ipc-handlers.ts      # IPC 通信处理器
│   │   ├── preload.cjs          # 预加载脚本（安全桥接）
│   │   └── window-manager.ts    # 窗口管理
│   │
│   ├── renderer/                # Vue 渲染进程
│   │   ├── api/                 # IPC 类型安全封装
│   │   ├── components/          # 公共组件
│   │   │   ├── Reader.vue       # 阅读器核心
│   │   │   └── VerificationDialog.vue
│   │   ├── pages/               # 页面视图
│   │   │   ├── Bookshelf.vue    # 书架
│   │   │   ├── Explore.vue      # 发现
│   │   │   ├── Market.vue       # 书源市场
│   │   │   ├── Search.vue       # 搜索
│   │   │   ├── Settings.vue     # 设置
│   │   │   └── SourceManager.vue # 书源管理
│   │   ├── router/              # 路由配置
│   │   ├── store/               # Pinia 状态管理
│   │   ├── styles/              # 全局样式
│   │   ├── utils/               # 工具函数
│   │   ├── App.vue              # 根组件
│   │   ├── index.html           # HTML 模板
│   │   └── main.ts              # 渲染进程入口
│   │
│   └── shared/                  # 跨进程共享
│       ├── constants.ts         # 全局常量
│       ├── store-keys.ts        # 存储键名
│       └── types.ts             # 类型定义
│
├── scripts/
│   └── copy-preload.js          # 构建脚本
│
├── electron-builder.yml         # 打包配置
├── package.json                 # 项目配置
├── tsconfig.json                # TypeScript 配置
└── vite.config.ts               # Vite 配置
```


## 🚀 快速开始

**环境要求**：Node.js >= 18，npm >= 9

```bash
git clone https://github.com/your-repo/AbyssReader.git
cd AbyssReader
npm install
npm run electron:dev
npm run electron:build
```


## 📄 许可证

GPL-3.0


## 🙏 致谢

书源规则参考 [开源阅读 Legado](https://github.com/gedoor/legado)，感谢开源阅读社区及书源维护者的贡献。
