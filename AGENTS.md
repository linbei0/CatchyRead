# AGENTS.md

## 项目概览

CatchyRead 是一个 Manifest V3 浏览器扩展原型，用来把教程页、技术博客和文档页整理成更适合听的内容，并提供浏览器语音或远端 TTS 朗读。

当前代码已经按分层重构为以下结构：

- `src/app/`：三个入口装配器，只负责连接依赖并启动模块
- `src/domain/`：纯业务逻辑与状态计算，不应直接依赖 DOM、`browser.*`、`Audio`
- `src/infra/`：浏览器扩展 API、存储、权限、消息网关、音频会话、远端 Provider 调用
- `src/ui/`：播放器与设置页视图、DOM 绑定、交互控制
- `src/shared/`：跨层共享类型、默认配置、消息协议
- `src/lib/`：仍保留部分底层实现与兼容转发，改动时优先向新分层归位，不要继续往旧入口堆逻辑

关键技术栈：

- TypeScript（`strict: true`）
- esbuild
- Vitest + jsdom
- `webextension-polyfill`
- `@mozilla/readability`

## 安装与常用命令

- 安装依赖：`npm install`
- 监听构建：`npm run dev`
- 生产构建：`npm run build`
- 全量测试：`npm test`
- 监听测试：`npm run test:watch`
- 类型检查：`npm run typecheck`

本仓库没有单独的 lint/format 脚本。不要擅自引入新的格式化工具或改写全仓风格。

## 开发工作流

- 扩展构建输出目录是 `dist/`
- esbuild 入口在 `scripts/build.mjs`
- 当前打包入口：
  - `src/app/background/index.ts`
  - `src/app/content/index.ts`
  - `src/app/options/index.ts`
- 构建后需要在浏览器扩展管理页手动加载 `dist/`

改动浏览器扩展逻辑后，建议最少执行：

- `npm test`
- `npm run typecheck`
- `npm run build`

只有这三项都通过，才能认为改动可交付。

## 测试说明

- 测试框架是 Vitest，环境是 `jsdom`
- 测试文件位置：`tests/**/*.test.ts`
- 没有 E2E 测试；行为回归主要依赖单元测试和 DOM 测试
- 修改以下内容时必须补测试：
  - 消息协议与后台路由
  - 设置页表单映射与 Provider 交互
  - 播放器视图状态、键盘导航、页面定位
  - 远端音频缓存、播放会话、错误映射

定位单测时可直接运行：

- 单文件：`npx vitest run tests/<name>.test.ts`
- 按测试名过滤：`npx vitest run -t "<test name>"`

## 代码风格与组织约束

- 使用路径别名 `@/` 指向 `src/`
- 新逻辑优先放入 `src/app` / `src/domain` / `src/infra` / `src/ui` / `src/shared`
- `src/content/*.ts`、`src/options/*.ts`、`src/background/*.ts` 当前允许作为薄兼容入口或转发层，不应重新塞回复杂逻辑
- 业务规则写成可测试的纯函数；副作用通过网关、repository、session 或 controller 收口
- 不要新增静默 fallback、mock 成功路径、吞错逻辑；失败要显式暴露
- 不要为了“先跑起来”引入新的边界限制或降级分支，除非文件里明确需要且可关闭
- 复用已有类型定义，优先使用 `src/shared/types.ts` 与 `src/shared/messages.ts`

## 浏览器扩展特定注意事项

- Provider 默认只允许 `HTTPS` 公网端点
- 本地 / 私网 / HTTP Provider 仅用于开发调试，相关逻辑在权限与安全模块中
- 保存或测试 Provider 配置时，扩展会请求目标域名权限；改这块时要同步验证权限申请流程
- Content script 不是常驻全量注入，而是通过 `activeTab + scripting` 按需注入
- 变更后台消息时，必须保持现有 runtime message type 与 payload shape 兼容，除非任务明确要求升级协议

## 构建与发布

- 构建脚本：`scripts/build.mjs`
- manifest 由 `scripts/manifest-config.mjs` 生成并写入 `dist/manifest.json`
- HTML 模板来自 `src/options/options.html`
- 发布前至少确认：
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
  - 浏览器中重新加载 `dist/` 后，播放器与设置页能正常打开

## 调试建议

- 播放器问题优先看：
  - `src/app/content/`
  - `src/ui/content/`
  - `src/infra/playback/`
  - `src/domain/playback/`
- 设置页问题优先看：
  - `src/app/options/`
  - `src/ui/options/`
  - `src/domain/options/`
  - `src/infra/runtime/options-message-gateway.ts`
- 后台消息问题优先看：
  - `src/app/background/index.ts`
  - `src/background/runtime-message-router.ts`
  - `src/background/activation.ts`

遇到 bug 时先复现并补失败测试，再修；不要先改代码再补测。

## PR / 交付前检查

- 改动应尽量小而聚焦，优先修根因，不做表面补丁
- 不要顺手修无关问题，除非它阻塞当前任务
- 提交前最少执行：
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
- 如果改了分层边界、消息协议、设置字段或播放器状态流，必须在说明中明确指出影响范围
