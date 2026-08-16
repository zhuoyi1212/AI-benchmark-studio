# AI Benchmark Studio — Product Spec

## 1. 产品定位

AI Benchmark Studio 是用于设计、执行、审查和沉淀 AI 产品横向测评实验的工作台。

它不是 AI 写测评文章工具、单纯排行榜、AI 产品目录、第三方网站自动操作 Agent 或社区内容生成器。

核心价值：

> 建立可复现、可审计、可追溯的 AI 产品实验流程，并沉淀结构化实验数据与原始证据。

核心资产：

`Product × Version × Test Case × Prompt × Raw Output × Rubric × AI Judge × Human Review × Final Score × Time`

## 2. MVP 用户

- AI 产品经理
- 科技媒体/测评编辑
- AI 产品研究人员
- 需要横向比较 AI 工具的高级用户

## 3. 完整工作流

`Create Project → Product Research → Comparability Check → Generate Protocol → Review Protocol → Lock Protocol → Execute Tests → Upload Raw Artifacts → Create Blind Samples → AI Blind Judge → Human Review → Lock Final Scores → Reveal → Final Result Analysis → Deep Report → Content Discovery → Community Post`

### AI Provider 原则

业务工作流只依赖 AI Task Service，不依赖供应商或具体模型。第一版由集中 Router 在智谱与 DeepSeek 之间按任务分工：智谱负责 Web Search、Research Synthesis、多模态理解、Report 与 Community Post；DeepSeek 负责 Comparability、Protocol、纯文本 Judge、Final Result Analysis 与 Content Discovery。供应商失败不得静默跨厂商 fallback 或回退 Mock。

## 4. Create Project

输入：

- 项目名称
- 1–3 个产品
- 产品官网（可选）
- 测评意图

点击开始后必须真实创建 Project，获得 projectId，不得跳回固定 demo。

## 5. Product Research

智谱 Web Search 根据产品名、官网和测评意图优先检索官方来源，再由 GLM 文本模型整理结构化 Research：

- 官网
- 官方文档
- Pricing
- Help Center
- 官方 Blog / Release Docs

输出每个产品：

- positioning
- targetUsers
- capabilities
- keyFeatures
- pricing
- officialBestPractices
- limitations
- sources

Comparability 输出：

- comparable / partially_comparable / not_comparable
- score/confidence
- reason
- commonCapabilities
- warnings

不可比时要明确告知，不强行比较。

Comparability 只分析已经保存的 Structured Research Data，默认由 DeepSeek 完成，不重新凭模型知识生成官网事实。

## 6. Test Protocol

AI 根据 Project Intent + Research + Common Capabilities 生成：

- goal
- testMode
- rules
- testCases[]
- rubric[]

TestCase：

- title
- objective
- prompt
- inputDescription
- inputArtifacts
- observationFocus
- executionRules

Rubric：

- dimension
- weight
- description
- scoringStandard

Rubric 不是固定模板；AI PPT、AI Coding、AI Image、AI Search 应自然不同。系统只固定：总权重必须为 100%。

## 7. Protocol Lock

Protocol 必须在看到实验结果前锁定。

locked 后：

- Prompt 不可原地修改
- Rubric 不可原地修改
- TestCase 不可原地修改
- Protocol Version 固定

需要修改时创建新版本，不覆盖旧版本。

## 8. Standardized Test

MVP 默认同 Test Case、同 Prompt、同输入、独立执行、默认单次生成、不人工二次美化。

它测的是默认 UX / zero-learning / first-attempt performance。

Best-practice testing 以后再做独立模式。

## 9. Test Execution

用户手动在第三方产品执行测试，MVP 不自动操作第三方网站。

每个 `Product × TestCase` 形成 TestRun，记录：

- status
- generationTime
- retryCount
- manuallyEdited
- notes

用户上传 Raw Artifact：image / PDF / text。

Artifact 是实验原始证据，不能由 Report/Publish 重新生成替代。

## 10. Blind Review

Judge 和 Human Reviewer 在 Reveal 前只看到 Sample A/B/C。

Blind Mapping `Sample → Product` 是敏感数据。

Reveal 前：

- 普通前端不能直接查询 mapping
- Judge 不需要 product_id
- Human reviewer 不看到真实身份

不能只靠 UI 隐藏。

## 11. AI Judge

输入至少包括：

- Locked Protocol
- Test Case
- Rubric
- Blind Sample
- Raw Artifact

每个 `TestCase × BlindSample × RubricDimension` 产生：

- aiScore 0–10
- reason
- evidence[]
- confidence 0–1
- JudgeCaseRun 的 provider / model / promptVersion

AI Score 属于原始实验记录，不允许人工覆盖。

同一个 Test Case 的全部 Blind Samples 必须引用同一个 JudgeCaseRun。全部 Artifact 为 `text/plain` 时默认路由 DeepSeek；包含 image、screenshot、PDF 或混合模态时统一路由 GLM 视觉模型，原始 Artifact 仍交给多模态 Judge，OCR 只能作为辅助预处理。

## 12. Human Review

目标是纠正明显不合理的 AI Judge，不是独立第二次评分。

默认：`Final Score = AI Score`

人工修改后：`Final Score = Human Override`

规则：

- 只改具体 Rubric Dimension
- 不直接改 Overall
- 理由必填
- AI Score 永久保留
- 保存修改历史
- 支持 revert
- 0 项人工修改正常

## 13. Lock & Reveal

顺序固定：

`AI Blind Review → Human Review → Lock Final Scores → Reveal → Results`

Reveal 不能改变已锁定分数。

## 14. Final Result Analysis

Reveal 后，AI 基于 Final Scores、Rubric、Case、Judge Evidence、Human Review、Artifact metadata、Product identity 重新生成：

- winner/top performers
- headline
- strengths
- weaknesses
- bestFor
- notIdealFor
- keyFindings
- crossProductInsights
- recommendationSummary
- limitations

Human Review 改变 Final Score 后旧结论不得继续使用。需要 final_score_signature 或等效机制绑定分析版本。

该阶段默认由 DeepSeek 完成复杂分析；不得被 Report 表达层重新改变排名、Winner、Final Score 或 Judge Evidence。

## 15. Results

展示：

- Final Score
- Dimension Scores
- Ranking
- AI Judge + Human Review 来源
- Human adjustment count
- Product summaries
- Cross-product findings

不要把综合冠军包装成对所有用户都唯一正确的选择。

## 16. Deep Report

Report 必须来自：

`Locked Final Scores + Final Result Analysis + Protocol + TestRuns + Artifacts + Judge Evidence`

至少包含：

- TL;DR
- Methodology
- Products
- Final Ranking
- Test Cases
- Prompts
- Case Findings
- Product Pros/Cons
- Recommendations
- Limitations
- Human Review disclosure

关键 Case 必须可关联 Raw Artifact。

Report Generation 默认由 GLM 文本模型负责组织已确定的分析与证据，只承担表达，不进行第二次判分。

## 17. Community Publish Pack

不是 Report 缩写。

正确流程：

`完整实验数据 → AI 发现值得讨论的观点 → ContentIdeas[] → 用户选/自定义角度 → 配置 → AI Community Post → 关联真实截图证据`

ContentIdea 的数量、title、type、angle 都必须动态。

Content Discovery 默认由 DeepSeek 从完整实验数据发现观点；用户选定角度后，Community Post 默认由 GLM 文本模型负责中文表达。两者都只能使用已存在的实验事实与证据。

## 18. Screenshot

社区图片只能来自真实 Test Artifact，用于支持正文观点。

禁止：

- AI 生成假实验截图
- AI 生图作为证据
- 自动裁图/拼图/水印/封面（MVP 不做）

## 19. Posting

MVP 只提供：

- 可编辑文案
- 复制
- 截图推荐
- 截图选择/排序/下载

不自动发布到第三方平台。

## 20. 长期产品原则

- Evidence First
- Protocol Locked Before Results
- AI Score Immutable
- Human Review Is Correction
- Blind Is Real
- Final Analysis Uses Final Score
- Structured Experiment Data Is Core Asset

## 21. MVP 不做

- Browser Agent 自动操作第三方 AI
- 自动购买订阅
- 复杂团队权限
- 多 reviewer 仲裁
- 公开社区平台
- SEO 排行榜平台
- Vector DB
- LangChain / LangGraph
- 自动社媒发布
- AI 生图作为实验依据
