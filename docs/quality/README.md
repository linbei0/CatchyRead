# CatchyRead 质量基线

这套质量基线用于把“技术内容是否适合连续收听”从主观感受，收敛为可复盘、可比较的评分结果。

## 评分维度

- `contentExtraction`：正文抽取是否准确，是否明显混入导航、推荐、页脚噪音
- `codeHandling`：代码块、接口签名、表格等技术结构是否被正确处理
- `segmentation`：段落切分是否适合连续收听，是否存在明显断句异常
- `pageNavigation`：页面定位、段落回跳、高亮映射是否稳定
- `firstAudioLatency`：从点击播放到首段开始朗读的体验是否顺畅

每个维度按 `0-5` 打分，单页总分按 `25` 分换算为百分比。当前仓库里的纯函数实现位于 `src/domain/quality/parser-scorecard.ts:1`，对应测试在 `tests/parser-scorecard.test.ts:1`。

## 当前基准站点池

先覆盖高频技术阅读场景，优先顺序如下：

- 官方文档：MDN、React、Next.js、Vite、TypeScript、Python Docs、Node.js
- 教程博客：CSS-Tricks、freeCodeCamp、Smashing Magazine、LogRocket、Builder.io
- 代码与 README：GitHub README、GitHub Pages 文档、Stack Overflow 回答页
- API 参考：OpenAI Docs、Cloudflare Docs、Docker Docs、Kubernetes Docs
- 含复杂结构页面：表格密集页、API 签名密集页、callout 密集页、SPA 文档站

完整的首批目标清单见 `docs/quality/baseline-targets.md:1`。

## 使用方式

1. 先从基准站点池挑选页面，收集单页结果。
2. 按 5 个维度填写 JSON 样例，格式参考 `docs/quality/parser-scorecard-sample.json:1`。
3. 将低于 `80%` 的页面加入“优先修复”列表。
4. 修复解析逻辑后，重新运行同一批页面，确认得分不下降。

## 当前实现范围

本轮已经把以下能力接入主线：

- 技术文档中的 `table`、`callout`、API 签名识别与听读摘要
- 页面支持状态：`完全支持`、`部分支持`、`建议原文模式`、`当前不支持`

后续建议保持“先补基线，再扩能力”的节奏，避免回到零散修 bug 的状态。
