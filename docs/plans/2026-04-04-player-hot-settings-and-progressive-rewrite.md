# Player Hot Settings And Progressive Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复“设置保存后需重开播放器才生效”，并实现“智能整理首块先播、失败块回退原文”的增量播放。

**Architecture:** 在内容页播放器增加存储变更监听和设置应用函数，统一处理热更新与缓存失效；同时把智能整理 orchestration 从“一次 await 全量结果”改成“本地分块、多次 rewrite、增量合并”，保留现有 background provider 调用和响应校验能力。

**Tech Stack:** TypeScript、Vitest、webextension-polyfill、Manifest V3 浏览器扩展

---

### Task 1: 为设置热生效补失败测试

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\tests\content-message-gateway.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\tests/provider-config-controller.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src/app/content/index.ts`

**Step 1: Write the failing test**
- 增加设置变更订阅/应用场景
- 断言无需重开播放器即可更新后续请求使用的设置

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/content-message-gateway.test.ts tests/provider-config-controller.test.ts`
- Expected: FAIL，说明当前没有热更新能力

**Step 3: Write minimal implementation**
- 新增监听注册、注销与设置应用逻辑

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/content-message-gateway.test.ts tests/provider-config-controller.test.ts`
- Expected: PASS

### Task 2: 为增量整理与回退补失败测试

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\tests\rewrite-pipeline.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\tests\openai-compatible-provider.test.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src/app/content/index.ts`

**Step 1: Write the failing test**
- 覆盖 chunk 级请求成功/失败混合场景
- 断言首块先可播、失败块被回退成原文段落

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts tests/openai-compatible-provider.test.ts`
- Expected: FAIL，说明当前仍是整页阻塞或单块失败整页失败

**Step 3: Write minimal implementation**
- 新增本地 chunk orchestration 和 fallback 合并

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts tests/openai-compatible-provider.test.ts`
- Expected: PASS

### Task 3: 全量验证

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src/app/content/index.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src/infra/runtime/content-message-gateway.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src/domain/content/rewrite-pipeline.ts`

**Step 1: Run targeted tests**
- Run: `npx vitest run tests/rewrite-pipeline.test.ts tests/openai-compatible-provider.test.ts tests/content-message-gateway.test.ts tests/provider-config-controller.test.ts`
- Expected: PASS

**Step 2: Run full validation**
- Run: `npm test`
- Run: `npm run typecheck`
- Run: `npm run build`
- Expected: 全部 PASS
