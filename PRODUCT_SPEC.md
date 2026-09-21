# AI Benchmark Studio — Product Spec

## 1. 产品定位

AI Benchmark Studio 的最终目的，是持续生产适合 AI 讨论社区、X、小红书等平台发布的 AI 内容。

Single Product Mode 不以“完整 Benchmark Report”为 North Star，而以“发现值得讨论的问题并形成有素材支撑的观点”为 North Star。结构化 Research、体验素材与内部分析是内容可信度基础，不是最终内容形态。

核心价值：

> Research / Experience → 找到值得讨论的东西 → 形成观点 → 用可信素材支撑 → 生成社区帖子。

核心资产：

`Product × Version × Test Case × Prompt × Raw Output × Rubric × AI Judge × Human Review × Final Score × Time`

## 2. MVP 用户

- AI 产品经理
- 科技媒体/测评编辑
- AI 产品研究人员
- 需要横向比较 AI 工具的高级用户

## 3. 完整工作流

`Create Project → Product Research → Experience / Evidence → Internal Analysis → Community Angle Discovery → Select Opinion → Community Post`

Benchmark、Blind、Judge、Human Review 与 Report 可以继续作为内部可信度和素材生产链，但不得决定社区帖的叙事结构，也不得以内部术语进入最终内容。

### AI Provider 原则

业务工作流只依赖 AI Task Service，不依赖供应商或具体模型。第一版由集中 Router 在智谱与 DeepSeek 之间按任务分工：智谱负责 Web Search、Research Synthesis、多模态理解与 Report；DeepSeek 负责 Comparability、Protocol、纯文本 Judge、Final Result Analysis、Micro Finding / Community Angle Discovery、Community Post 与单次 Rewrite。供应商失败只允许同 Provider 重试，不得静默跨厂商 fallback 或回退 Mock。

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

Protocol 草稿生成后，用户可以删除不合适的 TestCase，并按剩余任务继续测评。系统至少保留 1 个 TestCase，不要求用户必须执行 3 个任务；锁定后仍保持不可修改。

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

Publish 不是 Report 缩写，Report 也不是文章母稿。

当前流程（2026-09-09，用户授权的内容机制调整）：

`原始任务与回答 → 选材判断 → 精简写作材料 → Flash 初稿 → 事实与可读性审查 → 仅需语言修正时改写一次并复审`

一次围绕用户选择的一个真实任务选材，避免不同任务的数字和背景混用。先判断素材适合成帖、短观察、需要补充上下文，还是不建议发布。返回 0–8 个候选，不凑数量、不强求类型多样。每个候选保留任务背景、产品实际回答、逐字证据、一个有限判断和必要边界。原任务本来要求的普通动作不能拔高成产品特色。

Micro Finding / Human-readable Moment / CommunityWritingPacket 的历史字段继续可读，只作兼容与来源追踪；不再分配额外生成步骤，也不把同一判断重复投给正文模型。禁止把完整 Report、Results、排名或评分发给正文模型。

正文模型只接收选定产品、第三人称任务背景、观察、一次核心判断、最多三段原文与必要边界。最终正文及针对性改写继续使用 `deepseek-v4-flash` non-thinking；发现与 Critic 保留现有集中模型配置，不默认升级写作模型。

用简单话讲清一件具体的事。读者应知道任务是什么、AI 写了什么、细节为什么支持判断。每段增加内容；一句能说清就不扩成三段。不强制反差、三个理由、反例、第一人称观点、互动问题或免责声明。默认约 250–500 字，允许更短；short 最多 300 字，medium 最多 500 字，long 最多 900 字，均不设凑字数下限。标题最多 28 字、标签 1–3 个，互动问题可为空。

产品声称不等于已经核验，任务里的“我”不代表作者经历。无作者亲历证据不能新增使用时长、购买、养宠物、打电话、到店等经历；可以表达“我更在意这句提醒”等判断。数字、单位、原始结果、产品行为和来源不可改写失真。

事实安全和文章质量分别审查。遗漏判断仅在有完整记录时交给语义审稿，并把全文送给 Critic；只有节选时仍拦截无依据的遗漏判断。无可执行修改意见时停止，不盲目改写。沿用 Evidence / Jargon / Style 的事实门槛与模型配置，增加逐段新信息、重复结论、逻辑跳跃与篇幅是否匹配素材的语义判断。初稿通过直接完成；事实有问题停止，不拿错误初稿继续润色；仅语言问题允许一次修正。失败明确保存，不能把未通过文章存为 ready。不运行第三方 Skill 或默认脚本。

每次调用保存实际输入、模型返回（不含思维链）、route、usage、校验结果。失败稿也保留在当前 PublishPack 的 attemptAudit 中。原有文章保持不变，新生成使用新版本。旧选题可查看；再次生成须按新规范发现选题。原始 Evidence 与上游实验不重跑、不覆盖。

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


### Publish 新审稿规则（2026-09-10）

新生成不再以主观总分和多个风格分数决定通过。核对来源、数字、产品行为、作者经历和推断依据；具体事实、背景或选材问题停止，具体语言或重复问题最多改写一次并复核，无问题即可结束。此规则替代前文 Publish 中的旧审稿分数阈值，事实约束不变；旧分数仅作为历史记录显示。审稿意见必须指向当前文章，不能要求修改原始测试回答。选题元数据由程序保存，正文模型不再复写。模型自审通过不等于人工内容验收通过。

### 多种社区文章写法（2026-09-21）

按用户提供的四篇参考文章，Publish 支持“体验清单”“场景深度测评”“多维度测评”。后两种使用深度观察语气，允许从场景或问题开头，不强制第一人称或固定七个维度；篇幅由真实材料决定，参考预设为1500–2800字，材料少时缩短。体验清单继续使用真实体验和好用/一般/难用分类。

生成顺序为独立内容策划 → 完整正文 → 原始证据与文章质量核对。章节策划关联源观察及真实 Artifact，包含核心问题、读者、测试范围、逐字观察片段、已确认的使用影响、限制与建议。未实测的方法只能作为建议；不能从画面现象推测训练机制，不能扩写未经记录的省时、省钱、成功率或成片保证。质量核对覆盖具体案例、解释边界、重复内容和结尾价值；失败不能保存 ready。标题和正文不输出内部引用 ID。

以上规则扩展此前社区短帖规则，不改变 Quick Findings 主流程和专业评分支线；旧文章保持可读，新生成创建新版本。参考文章只是表达样本，不是当前项目的测试证据，不可借用其团队、人数、价格、版本和引用。

### 语言编辑步骤（2026-09-21）

用户提出增加专门的语言 Agent。新生成按“策划 → 初稿 → 语言编辑 → 原始证据及含义核对”执行。编辑只改标题、正文、互动句，沿用已选写法；无语言问题允许原样返回。不得增加事实、亲历、数字、成功率或改变判断范围，评分与证据关系由程序保留。最终核对独立比较润色前后六项含义，不通过不能 ready；截图关联以最终正文重建。保存成功文章的原稿、润色稿和实际调用追溯，原有文章不变。不引入循环润色或复杂 Agent 框架。
