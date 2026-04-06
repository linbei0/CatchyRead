# 播放器面板紧凑化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变播放器交互语义的前提下，压缩内容页播放器浮层的纵向空间占用，并让主标题和主控按钮更聚焦。

**Architecture:** 本次修改仅触及 `PlayerView` 的模板与 CSS，不调整领域逻辑、消息协议和状态模型。通过先写 DOM 失败测试，再最小化修改视图结构与样式实现紧凑化，最后执行全量验证。

**Tech Stack:** TypeScript、Vitest、jsdom、Manifest V3 浏览器扩展 UI

---

### Task 1: 为紧凑布局补失败测试

**Files:**
- Modify: `tests/player-dom.test.ts`
- Test: `tests/player-dom.test.ts`

**Step 1: Write the failing test**

在 `PlayerView` 的 DOM 测试中增加对以下关键样式 token 的断言：
- 面板宽高与内边距进一步收紧
- 顶部区、hero 区、标题、进度区、主控按钮、次级按钮尺寸更紧凑
- 队列卡片和说明文本的高度感下降

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: FAIL，新增紧凑布局断言不满足

**Step 3: Write minimal implementation**

仅修改 `src/ui/content/player-view.ts` 中模板或 `buildPlayerViewCss`，让新断言通过。

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: PASS

### Task 2: 收紧播放器模板和样式

**Files:**
- Modify: `src/ui/content/player-view.ts`
- Test: `tests/player-dom.test.ts`

**Step 1: Write the failing test**

如果 Task 1 的断言不足以覆盖结构性收紧，再补充如下失败断言：
- 队列入口卡文案结构保持不变但更紧凑
- 主控按钮与底部次级按钮的 aria 语义保持不变

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: FAIL，说明布局结构与测试预期尚未对齐

**Step 3: Write minimal implementation**

在 `buildPlayerViewCss` 中优先做以下最小修改：
- 收紧 `.panel`、`.hero`、`.headline-stack`、`.notice`、`.progress`
- 缩小 `.title`、`#current-title`、`.state-badge`、`.progress-meta`
- 缩小 `.toolbar-icon`、`.transport-button`、`.compact-action`

必要时对模板中纯展示性文案容器做轻量微调，但不改变控件 id、事件绑定和 aria 属性。

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: PASS

### Task 3: 全量验证交付

**Files:**
- Modify: `src/ui/content/player-view.ts`
- Modify: `tests/player-dom.test.ts`

**Step 1: Run targeted tests**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: PASS

**Step 2: Run full automated checks**

Run:
- `npm test`
- `npm run typecheck`
- `npm run build`

Expected:
- 所有测试通过
- 类型检查通过
- 构建成功

**Step 3: Summarize delivery**

记录修改文件、紧凑化重点、验证结果和任何已知限制，准备交付说明。

### Task 4: 第二轮收紧主控按钮与底部留白

**Files:**
- Modify: `tests/player-dom.test.ts`
- Modify: `src/ui/content/player-view.ts`

**Step 1: Write the failing test**

增加第二轮紧凑化断言，覆盖：
- 主控按钮高度、圆角、间距继续收紧
- 底部四按钮高度和字号继续缩小
- 面板高度或底部 spacing 再压一档，减少底部空白

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: FAIL，新增第二轮紧凑化断言不满足

**Step 3: Write minimal implementation**

仅修改 `src/ui/content/player-view.ts` 中 `buildPlayerViewCss`：
- 收紧 `.panel`
- 收紧 `.transport`、`.transport-button`
- 收紧 `.secondary-controls`、`.compact-action`
- 必要时同步收紧折叠态按钮尺寸，保持一致性

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: PASS

### Task 5: 第二轮全量验证

**Files:**
- Modify: `src/ui/content/player-view.ts`
- Modify: `tests/player-dom.test.ts`

**Step 1: Run targeted tests**

Run: `npx vitest run tests/player-dom.test.ts`  
Expected: PASS

**Step 2: Run full automated checks**

Run:
- `npm test`
- `npm run typecheck`
- `npm run build`

Expected:
- 所有测试通过
- 类型检查通过
- 构建成功
