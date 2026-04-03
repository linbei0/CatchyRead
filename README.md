# CatchyRead

CatchyRead 是一个 Manifest V3 浏览器扩展原型，用来把教程页、技术博客和文档页整理成更适合听的内容，并提供浏览器语音或远端 TTS 朗读。

## 当前实现

- 使用 `@mozilla/readability` + DOM heuristics 提取正文结构块
- 改为 `activeTab + scripting` 按需注入，不再对所有页面常驻注入完整脚本
- 默认把代码块整理成作用说明，而不是逐字朗读
- 支持 `原文模式` 与 `智能模式`
- 支持 `浏览器语音` 与 `OpenAI-compatible 远端 TTS`
- 提供页面内悬浮播放器、段落高亮、点击段落跳转、设置页
- 支持“页面定位模式”、键盘导航、折叠/拖拽位置持久化
- 支持浏览器能力探测、动态页面内容刷新提示、后台请求队列与运行时缓存分组
- Provider 默认只允许 `HTTPS` 公网端点；本地 / HTTP 端点需在设置页显式开启开发选项

## 本地开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

## 加载扩展

1. 运行 `npm run build`
2. 打开浏览器扩展管理页
3. 开启“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择本项目下的 `dist` 目录

## 配置方式

打开扩展设置页后，可以分别填写：

- LLM：`baseUrl`、`model`、`apiKey`
- TTS：`baseUrl`、`model`、`apiKey`、`voice`
- 默认内置 Qwen DashScope TTS 适配器，也保留 OpenAI-compatible TTS 适配器
- 如需接本地 `Ollama` / 私网 OpenAI-compatible 服务，需要显式勾选：
  - `允许 HTTP 端点（仅开发调试）`
  - `允许本地 / 私网端点（仅开发调试）`

默认适配接口：

- LLM：`POST /chat/completions`
- TTS：`POST /audio/speech`

Qwen DashScope TTS 默认配置：

- Base URL：`https://dashscope.aliyuncs.com/api/v1`
- Model：`qwen3-tts-instruct-flash`
- Voice：`Cherry`

首次保存或测试 Provider 时，扩展会请求访问对应远端域名的权限；这是浏览器扩展访问第三方 API 所必需的步骤。

## 交互说明

- 使用悬浮播放器中的 `页面定位` 按钮后，再点击网页正文段落，播放器才会跳转到对应段落
- 预览列表支持键盘操作：
  - `ArrowUp / ArrowDown` 切换段落
  - `Enter / Space` 激活当前段落
  - `Esc` 退出页面定位模式
- 播放器折叠状态与拖拽位置会保存在本地扩展存储中
- 页面内容发生明显变化或 SPA 路由切换后，播放器会提示“刷新内容”

## 目录结构

- `src/content/index.ts`：页面内悬浮播放器与播放控制
- `src/background/index.ts`：后台消息、动作入口、远端请求
- `src/options/index.ts`：设置页表单
- `src/lib/extract/*`：正文提取与分段逻辑
- `src/lib/providers/openaiCompatible.ts`：OpenAI-compatible provider 适配
