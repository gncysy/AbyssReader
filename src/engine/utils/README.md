# Engine Utils

统一的工具函数模块，解决代码重复问题。

## 文件说明

- `url.ts` - URL 相关工具函数
  - `parseRequestConfig()` - 解析请求配置
  - `buildUrl()` - 构建完整URL（支持变量替换）
  - `buildHeaders()` - 构建请求头
  - `resolveUrl()` - 解析URL（相对转绝对）
  - `isJsonResponse()` - 检查是否为JSON响应
  - `safeParseJson()` - 安全解析JSON
  - `cleanIntro()` - 清理简介

- `js-source.ts` - JS书源支持
  - `isJsSource()` - 检查是否为JS书源
  - `executeJsSource()` - 执行JS书源
  - `executeJsSearch()` - 执行搜索
  - `executeJsBookInfo()` - 执行书籍详情
  - `executeJsToc()` - 执行目录
  - `executeJsContent()` - 执行正文
