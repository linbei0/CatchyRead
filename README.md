# CatchyRead

CatchyRead 是一个 Manifest V3 浏览器扩展原型，用来把教程页、技术博客和文档页整理成更适合听的内容，并提供浏览器语音或远端 TTS 朗读。

## 当前实现

- 使用 `@mozilla/readability` + DOM heuristics 提取正文结构块
- 默认把代码块整理成作用说明，而不是逐字朗读
- 支持 `原文模式` 与 `智能模式`
- 支持 `浏览器语音` 与 `OpenAI-compatible 远端 TTS`
- 提供页面内悬浮播放器、段落高亮、点击段落跳转、设置页

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

默认适配接口：

- LLM：`POST /chat/completions`
- TTS：`POST /audio/speech`

## 目录结构

- `src/content/index.ts`：页面内悬浮播放器与播放控制
- `src/background/index.ts`：后台消息、动作入口、远端请求
- `src/options/index.ts`：设置页表单
- `src/lib/extract/*`：正文提取与分段逻辑
- `src/lib/providers/openaiCompatible.ts`：OpenAI-compatible provider 适配
