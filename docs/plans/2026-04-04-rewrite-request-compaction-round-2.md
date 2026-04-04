# Rewrite Request Compaction Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 继续压缩智能改写请求，把标题、本地重复块、列表碎片、代码站点噪音和模型生成的段落 id 从 LLM 输入输出链路中移除，进一步降低总 token 消耗。

**Architecture:** 在改写前新增一层纯函数预处理：移除 heading、合并连续 list、清洗代码噪音、合并相邻重复文本，并把合并后的原始 `canonicalBlockId` 集合挂在块元数据上供请求构造与响应校验复用。请求构造层进一步裁剪 snapshot 字段与响应 schema，让模型只产出 `sectionTitle`、`spokenText`、`sourceBlockIds`、`kind`，本地再补 `id`。

**Tech Stack:** TypeScript、Vitest、Manifest V3 浏览器扩展

---

### Task 1: 为块预处理补失败测试

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\tests\rewrite-pipeline.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\domain\content\rewrite-pipeline.ts`

**Step 1: Write the failing test**
- 增加预处理测试，覆盖去掉 heading、清洗代码噪音、合并连续 list、合并相邻重复块

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts`
- Expected: FAIL，提示新预处理函数不存在或行为不符合预期

**Step 3: Write minimal implementation**
- 实现纯函数预处理逻辑，并保留合并后的 `canonicalBlockId` 集合

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本任务不允许执行写入型 Git 操作

### Task 2: 为请求构造与响应解析补失败测试

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\tests\openai-compatible-provider.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\lib\providers\openaiCompatible.ts`

**Step 1: Write the failing test**
- 覆盖请求体不再发送 heading、snapshot 仅保留必要字段、输入块使用 `canonicalBlockIds`
- 覆盖结构化输出 schema 不再要求模型返回 `id`
- 覆盖解析无 `id` 响应时由本地生成稳定 segment id

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: FAIL，表明请求或解析仍保留旧负担

**Step 3: Write minimal implementation**
- 调整请求 payload / schema / 解析逻辑

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本任务不允许执行写入型 Git 操作

### Task 3: 接入全链路并验证

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src\shared\types.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\domain\content\rewrite-pipeline.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\lib\providers\openaiCompatible.ts`

**Step 1: Wire integration**
- 在 rewrite fetch 流程接入块预处理
- 保持本地校验、顺序检查与旧 alias 兼容逻辑

**Step 2: Run targeted tests**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts tests/openai-compatible-provider.test.ts`
- Expected: PASS

**Step 3: Run full validation**
- Run: `npm test`
- Run: `npm run typecheck`
- Run: `npm run build`
- Expected: 全部 PASS
