# Player Hot Settings And Progressive Rewrite Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让设置页保存后的 LLM/TTS 配置在已打开播放器中立即生效，并把智能整理改成“首块先播、失败块回退原文”的增量式体验。

**Architecture:** 内容页播放器新增设置热更新监听，在本地内存中刷新 `settings`、UI 控件与受影响缓存；已经在播的远端 TTS 保持当前段不打断，从下一段起切到新配置。智能整理不再等待 background 一次性返回全量结果，而是在内容页基于现有 chunk helper 按块发起 rewrite：第一块优先、后续块顺序追加，某块失败时只把该块回退为本地原文段落并继续合并，整个页面仍可持续播放。

**Tech Stack:** TypeScript、Vitest、webextension-polyfill、Manifest V3 浏览器扩展

---

**Section 1: 设置热生效**

- 内容页在 `show()` 后注册扩展存储监听，在 `hide()` 时注销，避免关闭后继续响应。
- 监听到 `catchyread.settings` 变化时，重新合并并应用设置，更新 `mode / codeStrategy / speechEngine / rate / voiceId` 与播放器控件。
- 当前播放中的即时行为：
  - `rate` 立即生效
  - `tts voice / provider` 从下一段生效
  - `llm provider` 影响下一次智能整理，不回滚当前结果
- 当 TTS 配置变化时清理 `remote-audio` 缓存与 payload promise cache，避免复用旧音频。

**Section 2: 增量式智能整理**

- 内容页先基于 `prepareStructuredBlocksForRewrite()`、`buildRewriteChunks()` 在本地切块。
- 优先请求第一块，拿到结果后立即提交 `smartRewriteResult` 并开播。
- 后续块继续请求并按原顺序追加到 `smartRewriteResult`。
- 任意单块失败时，使用同一块结构数据在本地生成原文段落作为 fallback，再按原位置合并；同时显示非阻断 notice。
- 如果第一块就失败，也会先回退原文后直接开播，保证“不断播”。

**Section 3: 错误与状态**

- 不吞错：当有块回退时显示“部分段落已回退原文”的提示。
- 不全局失败：只有整次流程被用户取消、页面刷新、或播放器关闭时才整体中止。
- 保持顺序稳定：chunk 结果只按原 chunk 顺序写入，不做乱序提交。

**Section 4: 验证**

- 单测覆盖：
  - 保存设置后内容页收到并应用新配置
  - 智能整理首块完成即可产出首批段落
  - 单块失败时回退原文而不是整页失败
- 完整验证：
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
