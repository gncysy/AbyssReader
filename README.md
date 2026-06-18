# 墨阅 · AbyssReader

![墨阅图标](src-tauri/icons/128x128.png)

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 特性

- 📚 书架管理 —— 书籍分类、排序、筛选
- 🔍 多源搜索 —— 多书源并发搜索，结果聚合展示
- 📖 沉浸阅读 —— 字体、主题、行距自由调节
- 📁 本地导入 —— 支持 TXT 文件直接导入
- 🔌 书源系统 —— 兼容开源阅读书源 JSON 格式
- 💾 数据持久化 —— SQLite 本地存储，阅读进度自动保存
- 🌙 暗色模式 —— 深色 / 浅色 / 护眼 三种主题

---

## 🚀 快速开始

### 下载安装

从 Releases 页面下载对应平台的安装包：

| 平台 | 格式 |
|------|------|
| Windows | .exe (NSIS) |
| macOS | .dmg |
| Linux | .deb / .rpm |

### 从源码构建

```bash
git clone https://github.com/gncysy/AbyssReader.git
cd AbyssReader
npm install
npm run tauri dev
npm run tauri build
```

---

## 📖 使用指南

### 导入书源

墨阅使用 JSON 格式的书源，兼容开源阅读书源规范。

导入方式：
- 粘贴 JSON —— 直接粘贴书源内容
- 上传文件 —— 选择 .json 书源文件
- 从 URL 导入 —— 输入远程书源地址

> 书源由用户自行管理，墨阅仅提供解析与展示能力。

### 搜索书籍

1. 进入「搜索」页面
2. 选择要使用的书源（可多选）
3. 输入书名或作者关键词
4. 点击「搜索」或按回车键

### 阅读器

- 点击书架上的书籍封面即可打开阅读
- 方向键切换章节
- Esc 键关闭阅读器
- 底部工具栏支持字体大小与行距调节

### 本地 TXT 导入

点击书架页面的「导入 TXT」按钮，选择 .txt 文件即可自动导入并加入书架。

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| 样式 | Tailwind CSS |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust |
| 数据库 | SQLite (rusqlite) |
| HTTP 客户端 | Reqwest |

---

## 📁 项目结构

```text
AbyssReader/
├── src/
│   ├── api/
│   ├── components/
│   ├── engine/
│   │   └── ruleEngine.ts
│   ├── pages/
│   │   ├── Bookshelf.vue
│   │   ├── Search.vue
│   │   ├── Explore.vue
│   │   ├── SourceManager.vue
│   │   ├── Reader.vue
│   │   └── Settings.vue
│   ├── stores/
│   └── styles/
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   ├── network/
│   │   └── storage/
│   └── Cargo.toml
└── sources/
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 打开 Pull Request

---

## 📄 许可证

本项目基于 MIT 协议开源，详见 LICENSE 文件。

---

## ⚠️ 免责声明

- 墨阅本身不提供任何内容，所有数据来源于用户导入的书源
- 用户应自行遵守相关法律法规，仅访问有授权的内容
- 本工具仅供学习研究使用，请勿用于商业用途

---

Made with ❤️ by gncysyAbyssReader/
├── src/
│   ├── api/
│   ├── components/
│   ├── engine/
│   │   └── ruleEngine.ts
│   ├── pages/
│   │   ├── Bookshelf.vue
│   │   ├── Search.vue
│   │   ├── Explore.vue
│   │   ├── SourceManager.vue
│   │   ├── Reader.vue
│   │   └── Settings.vue
│   ├── stores/
│   └── styles/
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   ├── network/
│   │   └── storage/
│   └── Cargo.toml
└── sources/
``

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 打开 Pull Request

---

## 📄 许可证

本项目基于 MIT 协议开源，详见 LICENSE 文件。

---

## ⚠️ 免责声明

- 墨阅本身不提供任何内容，所有数据来源于用户导入的书源
- 用户应自行遵守相关法律法规，仅访问有授权的内容
- 本工具仅供学习研究使用，请勿用于商业用途

---

