# CatchyRead Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付一个可构建、可加载的 CatchyRead 浏览器扩展 MVP，覆盖正文提取、智能重写、远端/浏览器 TTS、悬浮播放器和设置页。

**Architecture:** 使用原生 TypeScript + esbuild 构建 Manifest V3 扩展。Content script 负责正文提取、悬浮播放器、页面高亮与浏览器 TTS；background service worker 负责动作入口、配置读取、LLM 与远端 TTS 请求；options page 负责本地保存提供商配置。

**Tech Stack:** TypeScript、esbuild、Vitest、jsdom、@mozilla/readability、webextension-polyfill

---

### Task 1: 工程骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `scripts/build.mjs`
- Create: `vitest.config.ts`

**Step 1: 写测试配置与构建脚手架**

建立 `build`、`test`、`typecheck` 命令与 esbuild 多入口打包。

**Step 2: 验证依赖可安装**

Run: `npm install`
Expected: 依赖安装成功

### Task 2: 先写失败测试

**Files:**
- Create: `tests/extract-page-snapshot.test.ts`
- Create: `tests/build-spoken-segments.test.ts`
- Create: `tests/openai-compatible-provider.test.ts`

**Step 1: 写失败测试**

覆盖正文提取、代码摘要模式、OpenAI-compatible 请求构造与响应解析。

**Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 因实现缺失而失败

### Task 3: 实现共享模型与正文提取

**Files:**
- Create: `src/lib/shared/types.ts`
- Create: `src/lib/extract/pageSnapshot.ts`
- Create: `src/lib/extract/blockProcessing.ts`

**Step 1: 实现最小提取路径**

基于 Readability + DOM heuristics 提取结构化 blocks，并为原页面节点打 block id。

**Step 2: 跑相关测试**

Run: `npm test`
Expected: 正文提取相关测试通过

### Task 4: 实现 provider、播放器和设置页

**Files:**
- Create: `src/background/index.ts`
- Create: `src/content/index.ts`
- Create: `src/options/index.ts`
- Create: `src/options/options.html`

**Step 1: 接通消息总线**

背景页处理 toggle、rewrite、tts、settings；内容脚本处理预览、播放、错误提示、页面高亮。

**Step 2: 跑测试与类型检查**

Run: `npm test && npm run typecheck`
Expected: 全绿

### Task 5: 构建产物

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `src/**/*`

**Step 1: 运行构建**

Run: `npm run build`
Expected: 生成 `dist/manifest.json`、`dist/background.js`、`dist/content.js`、`dist/options.html`、`dist/options.js`
