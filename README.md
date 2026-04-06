# CatchyRead

<div align="center">

把教程页、技术博客和文档页整理成更适合收听的内容，并用浏览器语音或远端 TTS 持续朗读。

[![Manifest V3](https://img.shields.io/badge/Extension-Manifest%20V3-4f46e5?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![esbuild](https://img.shields.io/badge/Bundled%20with-esbuild-ffcf00?style=flat-square&logo=esbuild&logoColor=111)](https://esbuild.github.io/)

</div>

CatchyRead 是一个浏览器扩展原型，目标不是简单“朗读网页”，而是先理解页面结构、整理正文，再把内容转成更适合连续收听的体验。它面向教程页、技术博客、文档站这类信息密度高、代码块多、需要边看边听的阅读场景。

> [!TIP]
> 当前项目已经完成分层重构：`src/app` 负责装配，`src/domain` 负责纯业务逻辑，`src/infra` 负责扩展 API / 存储 / 会话，`src/ui` 负责视图与交互。

## 为什么是 CatchyRead

- 自动提取正文结构块，减少导航栏、页脚、杂项内容对收听的干扰
- 支持“原文模式”与“智能模式”，在忠实原文和可听性之间切换
- 默认把代码块整理成作用说明，而不是逐字朗读长代码
- 提供页面内悬浮播放器，支持段落高亮、点击跳转、键盘导航
- 支持浏览器语音，也支持 OpenAI-compatible / Qwen DashScope 远端 TTS
- 通过 `activeTab + scripting` 按需注入，而不是对所有页面常驻运行

## 功能概览

### 内容整理

- 使用 `@mozilla/readability` 与 DOM heuristics 提取正文
- 将页面内容组织成可预览、可定位、可播放的段落片段
- 对动态页面变化和 SPA 路由切换给出“刷新内容”提示
- 支持输出语言跟随页面，适配中英文技术内容

### 播放体验

- 悬浮播放器支持播放、暂停、继续、切换段落
- 播放时同步高亮当前段落，并可回跳原页面位置
- 支持页面定位模式：先进入定位，再点击正文段落快速跳转
- 支持折叠状态与拖拽位置持久化
- 预览列表支持键盘操作：
  - `ArrowUp / ArrowDown` 切换段落
  - `Enter / Space` 激活段落
  - `Esc` 退出页面定位模式

### Provider 与安全

- 浏览器语音可零配置直接使用
- 远端 Provider 支持：
  - LLM：`POST /chat/completions`
  - TTS：`POST /audio/speech`
- 默认内置：
  - OpenAI-compatible LLM Provider
  - Qwen DashScope TTS Provider
  - OpenAI-compatible TTS 适配能力
- 默认只允许 `HTTPS` 公网端点
- 本地、私网、`HTTP` 端点仅用于开发调试，需显式开启
- 首次保存或测试 Provider 时，会申请目标域名权限

> [!NOTE]
> CatchyRead 不依赖全站常驻 host 权限。扩展只在你主动触发时注入页面脚本，并在访问远端 API 时按需申请域名权限。

## 技术架构

项目使用 TypeScript 严格模式，并将“业务规则”和“浏览器副作用”拆开，便于测试和演进。

```text
src/
├─ app/       入口装配与依赖连接
├─ domain/    纯业务逻辑、状态计算、可测试规则
├─ infra/     扩展 API、存储、权限、消息网关、音频会话
├─ ui/        设置页与播放器视图、DOM 绑定、交互控制
├─ shared/    跨层共享类型、默认配置、消息协议
└─ lib/       兼容层与仍待迁移的底层实现
```

关键实现包括：

- `src/app/background/index.ts`：后台消息路由、请求队列、扩展动作入口
- `src/app/content/index.ts`：页面播放器装配、正文快照、播放状态驱动
- `src/app/options/index.ts`：设置页装配与 Provider 配置流程
- `src/domain/content/rewrite-pipeline.ts`：智能整理与分块规则
- `src/infra/playback/*`：浏览器语音 / 远端音频播放会话
- `src/ui/content/*`：播放器 UI、段落预览、页面定位交互

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 本地校验

```bash
npm test
npm run typecheck
npm run build
```

### 3. 加载扩展

1. 运行 `npm run build`
2. 打开浏览器扩展管理页
3. 开启“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 指向项目下的 `dist/` 目录

## 使用方式

### 打开播放器

- 点击扩展图标触发当前页注入
- 或使用快捷键：
  - Windows / Linux：`Ctrl + Shift + Y`
  - macOS：`Command + Shift + Y`

### 选择收听模式

- **原文模式**：更贴近页面原始内容
- **智能模式**：更适合连续收听，代码块会优先转成说明性内容

### 选择语音引擎

- **浏览器语音**：最省配置，适合本地快速体验
- **远端 TTS**：适合追求更稳定或更自然的音质

## 配置说明

设置页可以分别管理 LLM 与 TTS Provider：

- LLM：`baseUrl`、`model`、`apiKey`
- TTS：`baseUrl`、`model`、`apiKey`、`voice`

默认配置如下：

- LLM Base URL：`https://api.openai.com/v1`
- LLM Model：`gpt-4.1-mini`
- TTS Base URL：`https://dashscope.aliyuncs.com/api/v1`
- TTS Model：`qwen3-tts-instruct-flash`
- TTS Voice：`Cherry`

如果你想连接本地 Ollama 或私网 OpenAI-compatible 服务，需要在设置页显式开启：

- `允许 HTTP 端点（仅开发调试）`
- `允许本地 / 私网端点（仅开发调试）`

## 开发体验

### 常用命令

```bash
npm run dev        # 监听构建
npm run build      # 生产构建
npm test           # 运行 Vitest
npm run test:watch # 监听测试
npm run typecheck  # TypeScript 检查
```

### 构建输出

- 构建脚本：`scripts/build.mjs`
- Manifest 生成：`scripts/manifest-config.mjs`
- 输出目录：`dist/`

### 测试范围

项目当前以单元测试和 DOM 测试为主，覆盖重点包括：

- 后台消息协议与路由
- 设置页表单映射与 Provider 交互
- 播放器视图状态、折叠与键盘导航
- 远端音频缓存、播放会话与错误映射
- 页面提取、内容刷新、请求队列等底层行为

## 当前状态

CatchyRead 仍处于原型阶段，但核心链路已经打通：

- 页面正文提取
- 内容整理与智能朗读脚本分段
- 浏览器语音 / 远端 TTS 播放
- 设置页配置与权限申请
- 页面内播放器交互与状态持久化

如果你正在继续演进这个项目，推荐优先关注以下目录：

- 播放器相关：`src/app/content/`、`src/ui/content/`、`src/infra/playback/`
- 设置页相关：`src/app/options/`、`src/ui/options/`、`src/domain/options/`
- 后台消息相关：`src/app/background/`、`src/background/`

> [!IMPORTANT]
> 交付前建议始终执行 `npm test`、`npm run typecheck`、`npm run build`，并在浏览器中重新加载 `dist/` 做一次手动回归。
