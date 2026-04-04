# Optimize Rewrite Token Usage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改动用户可配置温度的前提下，压缩智能改写请求体，减少 LLM token 消耗与结构化输出歧义。

**Architecture:** 优先从请求构造层减重：精简 system prompt、压缩 user payload、移除会诱导模型选错 `sourceBlockIds` 的冗余字段，并保持现有本地响应校验与兼容映射不变。这样能在不改变主流程的情况下，直接降低 prompt token，并减少模型扩写与误填 id 的机会。

**Tech Stack:** TypeScript、Vitest、Manifest V3 浏览器扩展

---

### Task 1: 为省 token 请求补测试

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\tests\openai-compatible-provider.test.ts`

**Step 1: Write the failing test**
- 增加“结构化输出请求会精简 prompt 与 payload”的断言
- 覆盖：单块请求不发送 `chunkIndex/totalChunks`、`canonicalBlocks` 不再带本地 `id`、不再带冗余 `priority`

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: FAIL，表明请求体仍包含冗余字段或冗长 schema 示例

**Step 3: Write minimal implementation**
- 调整 rewrite request 的 system prompt 与 user payload

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本任务不允许执行写入型 Git 操作

### Task 2: 实现请求瘦身

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src\lib\providers\openaiCompatible.ts`

**Step 1: Keep structured mode concise**
- 结构化输出时使用更短 system prompt，避免重复整段 JSON 形状说明

**Step 2: Shrink user payload**
- 单块请求省略 `chunkIndex/totalChunks`
- `canonicalBlocks` 仅保留改写必要字段，移除本地 `id` 与冗余 `priority`

**Step 3: Preserve compatibility**
- 保留解析侧的 `blockIdAliasMap` 兼容逻辑，不影响旧响应兜底

**Step 4: Run targeted tests**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: PASS

### Task 3: 全量验证

**Files:**
- Modify: 无

**Step 1: Run full validation**
- Run: `npm test`
- Run: `npm run typecheck`
- Run: `npm run build`
- Expected: 全部 PASS
