# 墨阅 AbyssReader

桌面端小说阅读器，兼容开源阅读（Legado）书源。

## 功能

- 支持 JSONPath / CSS / XPath / JS 等多种规则类型的书源
- 多书源并发搜索，流式返回结果
- 书架管理、书籍详情、目录浏览、阅读进度保存
- 暗色 / 浅色 / 护眼三主题切换
- TXT 导入、URL 添加书籍
- 书源管理（导入/导出/测试/编辑/调试）
- WebDAV 备份同步
- 发现页浏览书源分类
- 书源调试助手（搜索/目录/正文逐条测试）

## 技术栈

- **前端**：Vue 3 + TypeScript + Naive UI + Pinia + Vue Router
- **桌面**：Electron
- **书源引擎**：对标 Legado AnalyzeRule，支持 JSONPath / CSS / XPath / JS 规则链
- **网络**：tough-cookie（Cookie 管理）、cheerio（HTML 解析）、jsonpath（JSON 解析）
- **构建**：Vite + electron-builder

## 安装

下载 [Releases](https://github.com/gncysy/AbyssReader/releases) 页面的安装包。

## 开发

```bash
npm install
npm run dev
npm run electron:dev
```

## 构建

```bash
npm run build
```

## 致谢

本书源解析引擎参考了 **开源阅读（Legado）** 的设计。

开源阅读（Legado）是由开发者 **gedoor** 创建的安卓端小说阅读器，以 GPL-3.0 协议开源。其规则引擎定义了 JSONPath / CSS / XPath / JS 等多种书源解析方式，成为书源生态的事实标准。本项目在实现过程中学习并参考了其源码。

由于原始仓库（github.com/gedoor/legado）已被作者删除，本项目参考的是第三方上传的备份：

- [https://gitee.com/andykube/legado](https://gitee.com/andykube/legado)

该备份仓库与原作者无直接关联，仅为代码存档。

**感谢 gedoor 创造了这套规则体系。**

## 协议

GPL-3.0
