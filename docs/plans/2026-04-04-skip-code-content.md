# Skip Code Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `skip` 代码策略，让原文模式和智能模式都直接跳过代码块内容。

**Architecture:** 通过扩展 `CodeStrategy` 为 `summary | full | skip`，把“跳过代码”作为统一策略贯穿到本地原文分段、LLM 改写输入过滤和设置/播放器表单。原文模式在生成 `SmartScriptSegment` 时直接忽略代码块；智能模式在构建 rewrite 请求前直接过滤 `type === 'code'` 的结构块，避免把代码内容发送给 LLM。

**Tech Stack:** TypeScript、Vitest、jsdom、Manifest V3 浏览器扩展

---

### Task 1: 原文分段跳过代码

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src\shared\types.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\lib\extract\blockProcessing.ts`
- Test: `E:\vibecoding-project\CatchyRead\tests\build-spoken-segments.test.ts`

**Step 1: Write the failing test**
- 在 `tests/build-spoken-segments.test.ts` 增加 `codeStrategy: 'skip'` 场景
- 断言代码块不会生成任何 `SmartScriptSegment`

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/build-spoken-segments.test.ts`
- Expected: FAIL，提示 `skip` 未被支持或仍然生成代码段

**Step 3: Write minimal implementation**
- 把 `CodeStrategy` 扩展为 `summary | full | skip`
- 在 `buildSpokenSegments()` 中遇到 `code + skip` 直接跳过

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/build-spoken-segments.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本仓库当前任务不允许执行写入型 Git 操作

### Task 2: 智能模式过滤代码块

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src\lib\providers\openaiCompatible.ts`
- Test: `E:\vibecoding-project\CatchyRead\tests\openai-compatible-provider.test.ts`

**Step 1: Write the failing test**
- 在 `tests/openai-compatible-provider.test.ts` 增加 rewrite request 场景
- 断言当策略为 `skip` 时，请求体里的 `blocks` 不包含 `type === 'code'`

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: FAIL，表明代码块仍被发送给 LLM

**Step 3: Write minimal implementation**
- 在 rewrite request 构造前过滤代码块
- 保持其他块顺序不变

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/openai-compatible-provider.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本仓库当前任务不允许执行写入型 Git 操作

### Task 3: 同步设置页与播放器选项

**Files:**
- Modify: `E:\vibecoding-project\CatchyRead\src\ui\content\player-view.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\ui\options\options-view.ts`
- Modify: `E:\vibecoding-project\CatchyRead\src\domain\options\settings-form-state.ts`
- Test: `E:\vibecoding-project\CatchyRead\tests\settings-form-state.test.ts`

**Step 1: Write the failing test**
- 在 `tests/settings-form-state.test.ts` 增加 `skip` 读写场景
- 断言设置表单可以恢复并提交 `playback.codeStrategy = 'skip'`

**Step 2: Run test to verify it fails**
- Run: `npx vitest run tests/settings-form-state.test.ts`
- Expected: FAIL，表明 `skip` 尚未进入表单状态模型

**Step 3: Write minimal implementation**
- 为设置页和播放器下拉框增加 `跳过代码` 选项
- 更新表单状态解析/回填类型

**Step 4: Run test to verify it passes**
- Run: `npx vitest run tests/settings-form-state.test.ts`
- Expected: PASS

**Step 5: Commit**
- 跳过：本仓库当前任务不允许执行写入型 Git 操作

### Task 4: 全量验证

**Files:**
- Modify: 无
- Test: `E:\vibecoding-project\CatchyRead\tests\*.test.ts`

**Step 1: Run targeted tests**
- Run: `npx vitest run tests/build-spoken-segments.test.ts tests/openai-compatible-provider.test.ts tests/settings-form-state.test.ts`
- Expected: PASS

**Step 2: Run full validation**
- Run: `npm test`
- Run: `npm run typecheck`
- Run: `npm run build`
- Expected: 全部 PASS

**Step 3: Commit**
- 跳过：本仓库当前任务不允许执行写入型 Git 操作
