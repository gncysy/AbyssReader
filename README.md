# AbyssReader

墨阅 - 桌面端小说阅读器，兼容开源阅读书源

## 技术栈

- **前端**: Vue 3 + TypeScript + Tailwind CSS + Pinia
- **后端**: Rust + Tauri 2 + SQLite + reqwest
- **架构**: 混合方案（前端负责规则解析，后端负责网络请求和数据存储）

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
