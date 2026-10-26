# AI Benchmark Studio 提示词重构上下文

更新日期：2026-10-09  
配套清单：[生产提示词清单](./ai-prompt-inventory.md)  
最终文章规范：[最终内容生成规范](./final-content-generation-standard.md)

本文用于把项目交给另一个模型分析和重构提示词。它解释业务流程、各 AI 阶段的职责、数据边界和验收目标。具体 Prompt 原文、模型和 Prompt Version 以生产提示词清单为准。

## 1. 项目是什么

AI Benchmark Studio 是一套基于真实测试证据的 AI 产品测评和内容生产工作台。用户创建测评，系统研究产品并设计任务；用户亲自在第三方产品中执行任务、上传原始输出；系统再完成匿名评分、人工复核、体验发现和社区文章生成。

最终目标不是堆出一篇泛泛的 Benchmark Report，而是：

```text
产品调研
→ 设计可执行测试
→ 获取真实输出
→ 从证据中发现值得讨论的问题
→ 形成有边界的观点
→ 生成可以发布的社区内容
```

项目的核心原则是 Evidence First。文章里的产品行为、数字、引用、体验判断和限制，都必须能回到本次测试的原始 Artifact 或人工确认的 Findings。

## 2. 四个不要混淆的概念

### 2.1 单产品与多产品

这是实验对象维度。

- 单产品：分析一款产品在具体场景中的表现，不输出排名、冠军或竞品措辞。
- 多产品：1–3 款产品使用相同任务、Prompt 和输入进行横向比较，只比较共同且核心的能力。

### 2.2 快速模式与专业模式

这是流程深度维度，与单产品/多产品不是同一件事。

- 快速模式：默认模式；固定生成 1 个代表性 TestCase；后端自动接力；只在采用方案、人工执行测试、异常评分复核、确认 Findings 等必要节点暂停。
- 专业模式：生成 2–4 个 TestCase；保留完整人工复核、结果分析和深度报告。

一个项目可以是“单产品快速测评”，也可以是“多产品专业测评”。提示词不能把这两个维度合并成一个判断。

### 2.3 原始证据、评分与 Findings

- Artifact：用户从第三方产品取得的原始文本、图片、PDF、Office 文件或视频，是事实源。
- Judge Score：盲评模型按锁定 Rubric 给出的实验评分，不允许人工覆盖原值。
- Human Review：只纠正具体评分维度，写成独立审计事件。
- Findings：从真实证据中整理出的可观察体验发现，不是评分，也不是文章。

### 2.4 Report 与 Community Post

- Report 组织锁定分数、方法、证据和分析，服务于完整测评复盘。
- Community Post 围绕一个具体问题和有限观点写作，服务于社区阅读。

Report 不是文章母稿，Publish 也不是 Report 的缩写。完整 Report、排名和专业评分不能直接发送给正文模型。

## 3. 完整业务流程

```text
创建项目
→ 产品调研 Research
→ 测试计划 Protocol
→ 人工采用并锁定 Protocol
→ 用户在第三方产品中手动测试
→ 上传原始 Artifact
→ Blind Judge 匿名评分
→ Human Review
→ Lock Final Score
→ Reveal 产品身份
├→ Findings → 人工确认 → 选题 → 社区文章
└→ Final Result Analysis → Deep Report
```

社区文章生成内部再分为：

```text
Content Discovery
→ 自动材料投影与结构选择
→ 提纲及初稿
→ 初稿内容核验
→ 语言润色
→ 最终保真检查
→ 保存 ready 版本
```

完成后的标题可以单独刷新。刷新只生成标题并创建新的不可变 PublishPack 版本，正文和证据关系保持不变。

## 4. 快速模式如何运行

快速模式由服务端持久化任务队列接管，不依赖浏览器倒计时或连续点击。

### 阶段一：自动准备

1. 创建项目。
2. 如果产品存在可复用的 90 天内 Research 快照，复制快照；否则运行 Research。
3. 自动生成恰好 1 个代表性 Protocol TestCase。
4. 暂停，等待用户查看并采用方案。

### 阶段二：人工实测

1. Protocol 锁定后不可原地修改。
2. 用户将系统给出的 Prompt 和材料带到第三方产品中执行。
3. 用户上传该产品的完整原始结果。
4. 每个 `Product × TestCase` 至少有一个有效 Artifact 才能继续。

这里必须保留人工执行。当前产品不做浏览器 Agent，也不自动操作被测网站。

### 阶段三：自动分析

1. 创建 Blind Sample，隐藏产品身份。
2. 根据 Artifact 媒体类型选择 Judge。
3. 运行匿名评分。
4. 高置信度且证据正常时自动 Lock 与 Reveal。
5. 低置信度、证据不足、解析失败或结论冲突时暂停人工复核。
6. Reveal 后生成 Findings。
7. 暂停，等待用户确认或修改 Findings。

### 阶段四：自动写作

1. 根据确认后的 Findings 发现候选选题。
2. 快速模式选择推荐选题。
3. 依次运行初稿、内容核验、语言润色和最终检查。
4. 通过后保存文章并展示。
5. 专业分析和 Report 可以在后台继续，失败不阻塞已经完成的文章。

成功阶段有检查点。刷新、离开页面或服务重启后可以继续；重试不能重复已经保存、输入签名相同的成功 AI 阶段。

## 5. 专业模式如何运行

专业模式沿用相同的 Research、Protocol Lock、Artifact、Blind、AI Score immutable 和 Publish 事实边界，主要差异是：

- Protocol 生成 2–4 个 TestCase。
- 用户逐项执行更多测试。
- Human Review 展示完整评分，而不是只处理异常项。
- Reveal 后生成 Final Result Analysis。
- Deep Report 绑定当前 Final Score 签名和 Result Analysis。
- Publish 可以从专业实验材料中选题，但写作输入仍只取可追溯观察、任务背景和必要边界，不把完整 Report、排名或数值评分交给正文模型。

## 6. 每个 AI 阶段的职责

### 6.1 Research Search

输入：产品名、官网、项目意图。  
职责：检索官网、文档、帮助中心、更新日志、定价和输入能力。  
重点：必须查清 Prompt 字符上限、文件上传支持、文件类型和限制。  
不能做：把搜索摘要直接当最终产品事实。

### 6.2 Research Synthesis

输入：检索到的来源。  
输出：positioning、targetUsers、capabilities、features、pricing、best practices、limitations、input/output formats、source URLs。  
职责：只根据给定来源整理结构化事实。  
不能做：凭模型记忆补事实；用“未找到”代替产品定位；编造价格。

### 6.3 Comparability

输入：已保存的结构化 Research。  
职责：多产品时找共同能力和不公平风险；单产品时提炼可验证的核心能力。  
不能做：重新搜索或补充外部知识；阻塞单产品体验流程。

### 6.4 Protocol Generation

输入：项目意图、产品 Research、Comparability、输入限制。  
输出：测试目标、TestCase、完整 Prompt、需要的输入材料、预期证据和动态 Rubric。  
职责：设计真实、原生、可执行、可留证、可评分的任务。  
不能做：为所有产品套通用写作任务；生成产品无法输入的 3000 字任务；在不支持附件时要求上传文件；静默截断材料。

快速模式固定 1 个 Case；专业模式 2–4 个。Protocol 在看到结果前锁定，后续修改必须创建新版本。

### 6.5 Blind Judge

输入：匿名 Sample、Locked Protocol、TestCase、Rubric、原始 Artifact。  
输出：每个 `Sample × Rubric Dimension` 的 score、reason、evidence 和 confidence。  
职责：严格按锁定标准评分并引用真实 Artifact ID。  
不能做：看到或猜测产品身份；改变 Rubric；遗漏 Sample；用未发送给模型的附件作为证据。

纯文本使用 DeepSeek；图片、PDF或混合视觉证据使用 GLM 视觉模型。同一 TestCase 的全部 Sample 必须共享一个 JudgeCaseRun 的 Provider、Model 和 Prompt Version。

### 6.6 Findings

输入：Research 背景、Locked Protocol、TestRun 元数据和原始证据。  
输出：好用、一般、难用或有问题的具体观察、影响和限制。  
职责：提炼可观察发现，为用户确认和后续选题提供材料。  
不能做：生成分数、排名和冠军；把单次失败扩大成产品整体失败；把测试不足写成产品缺点。

### 6.7 Final Result Analysis

输入：Reveal 后的产品身份、锁定 Final Score、Rubric、Case、Judge Evidence、Human Review 和 Artifact metadata。  
职责：解释已确定的结果，生成优势、弱点、适合人群、限制和跨产品洞察。  
不能做：重新判分；改变排名或 Winner；创造实验外数据。

### 6.8 Deep Report

输入：Final Result Analysis、Protocol、Research、Final Score 和证据。  
职责：把已确定事实组织成完整报告。  
不能做：第二次判分；改变证据、排名或结论。

### 6.9 Content Discovery

输入：人工确认 Findings 或专业实验的可追溯观察、TestCase、Research 背景和真实图片 Artifact。  
职责：判断哪些材料值得写，并提出有明确主线的选题。允许没有合格选题。  
不能做：为了数量凑选题；跨任务混用背景和数字；把测试不足当产品缺点；把选题设想当成事实。

### 6.10 提纲与初稿

输入：程序投影出的 fact ledger、来源观察、结构选择、写作配置和证据引用。  
输出：有来源映射的提纲，以及 title、body、interactionQuestion 等结构化初稿。  
职责：围绕一个核心问题，用具体细节形成有限判断。  
不能做：输出“好用的：”“一般：”等机械分类标题；虚构作者体验、情绪、收益、成功率或产品机制；重复同一发现凑篇幅。

### 6.11 初稿内容核验

输入：初稿和完整事实材料。  
职责：核对事实、范围、来源、结构和内容问题；确有依据时返回修正后的文案。  
不能做：修改证据计划、标签或内部元数据；假称已经修改却原样返回；降低事实门槛来放行文章。

### 6.12 语言润色

输入：已经通过内容核验的 title、body、interactionQuestion。  
输出：仍然只有这三个字段。  
职责：修复生硬标题、长句、衔接、重复和空话。原文清楚时可以原样返回。  
不能做：增加事实或感受；改变数字、对象、条件、正负判断、因果、频率、不确定性、建议与实测的区别。

### 6.13 最终保真检查

输入：润色后的正文、润色前快照、证据和真实图片。  
输出：检查结论、问题列表和图片映射，不返回另一版正文。  
职责：独立核验事实、范围、立场、亲历与情绪、建议、证据归属，以及文章是否具体、有界、不重复、有用。  
不能做：自行改稿；把模型的 `pass=true` 当成唯一通行条件。

程序还会执行确定性检查。任何语义项、Schema、引用、数字、观察锚点或图片对应关系失败，文章都不能成为 ready。

### 6.14 单独刷新标题

输入：已核验正文、当前标题、渠道和核心观点。  
输出：一个 6–28 字的新标题。  
职责：让标题清楚、具体、有真实钩子，并与当前标题明显不同。  
不能做：修改正文；使用标题党词汇；新增正文没有的数字或结论。

## 7. 当前模型分工

默认模型如下，生产环境允许通过环境变量覆盖：

| 工作 | 默认模型 |
|---|---|
| Web Search | 智谱 `search-prime` |
| Research、Report | 智谱 `glm-5.2` |
| Comparability、Protocol、文本 Judge、Result Analysis、Content Discovery | DeepSeek `deepseek-v4-pro` |
| 初稿、内容核验文本路径、语言润色、标题刷新 | DeepSeek `deepseek-v4-flash` |
| 图片/PDF/视频理解、视觉 Judge、视觉事实核验 | 智谱 `glm-4.6v` |
| OCR | 智谱 `glm-ocr` |

模型只是集中路由的默认值。业务提示词不得写死供应商或模型名。

## 8. 所有 Prompt 共享的工程约束

1. 所有 Provider 调用只在服务端发生。
2. 结构化任务必须返回单个 JSON 对象，并通过 JSON 解析、Zod Schema 和领域校验。
3. 记录 provider、model、promptVersion、input signature、usage、状态和必要输入快照。
4. 不保存供应商私有思维链。
5. Provider 失败只允许同供应商的有限重试，不静默切换供应商，也不回退 Mock。
6. 失败进入明确 failed 状态并支持 retry，不能无限 loading 或假成功。
7. 相同成功阶段通过输入签名和检查点复用，不能因刷新重复付费生成。
8. Prompt 修改必须升级 Prompt Version；历史运行继续保留当时版本。

## 9. 不能因重构 Prompt 而改变的产品规则

- Protocol 必须在看到实验结果前 Lock。
- 快速模式 1 个 TestCase；专业模式 2–4 个。
- 用户必须手动执行第三方产品测试。
- 原始 Artifact 不能由 AI 生成内容替代。
- Reveal 前不得向 Judge、页面或普通 API 暴露 Blind Mapping。
- AI Score immutable；Human Review 只能写独立、可回滚的修正事件。
- Final Score 锁定后才 Reveal，Reveal 不改变分数。
- Findings 必须人工确认后才能进入快速写作。
- Community Post 不得以 Report、排名或数值评分为母稿。
- 截图只能来自真实 Artifact，不能 AI 生图充当证据。
- 文章失败不能保存为 ready。
- 历史 Research、Protocol、Score、Report、文章和 Prompt Version 不得被新版本覆盖。

## 10. 当前最需要解决的内容质量问题

提示词重构应重点解决：

1. 标题信息量不足，缺少具体场景、结果或边界形成的真实钩子。
2. 正文把内部分类直接写成“好用的：”“一般：”“不舒服的地方：没有”。
3. 开头和结尾像固定模板，多篇文章结构雷同。
4. 同一判断换词重复，材料少时仍被扩写成长文。
5. 把“只测试一个场景”误写成产品表现一般，而不是测试范围限制。
6. 把测试任务中的角色设定当成作者真实经历或情绪。
7. 为了自然口语化虚构“我惊了”“松了一口气”等反应。
8. 结尾机械添加互动问题，与正文价值无关。
9. 上游任务忽略产品输入限制，生成用户实际无法执行的测试。
10. 审稿模型只做表面放行，未能发现事实、范围或含义漂移。

## 11. 重构目标与判断标准

提示词优化的目标顺序是：

1. **真实**：任何具体事实和体验判断都能追溯到证据。
2. **有界**：说明测试条件和覆盖范围，不以偏概全。
3. **具体**：写清任务、输出细节和这些细节为何支持判断。
4. **自然**：没有机械分类、固定开头、AI 套话和强制互动。
5. **简洁**：材料少就写短，不重复、不凑段落。
6. **有观点**：文章围绕一个值得讨论的问题，而不是罗列所有结果。
7. **职责清晰**：生成、核验、润色、最终审核各做自己的事。

单篇“看起来更好”不代表改造成功。至少用以下样本矩阵评测：

- 只有一个正向发现。
- 只有负向发现。
- 同时有正负发现。
- 没有值得写的发现。
- 单产品单场景。
- 单产品多任务。
- 同一任务多产品比较。
- 含数字、单位和直接引用。
- 只有文本证据。
- 有截图、PDF或视频证据。
- 输入限制严格、不支持附件的产品。
- 材料很少和材料很多两种情况。

每条样本建议保留：Prompt Version、完整结构化输入、模型原始输出、程序校验结果、人工修改稿、修改原因和偏好选择。

## 12. 建议的重构顺序

如果目标是改善最终文章，先不要同时重写所有 Prompt。建议按以下顺序实验：

1. `community-post.v6-evidence-plan`：决定文章主线、提纲、选材和初稿。
2. `content-discovery.v2`：决定选题是否值得写、是否具体。
3. `community-post-humanize.v2-copy-only`：只解决语言自然度。
4. `community-post-title.v1`：独立优化标题，可单独构建偏好数据。
5. Evidence Check：用误放行和误拒绝样本提高审稿能力，但不能降低事实门槛。
6. Protocol Prompt：单独解决任务与产品输入能力不匹配的问题。

每次只改变一个阶段并升级版本，使用固定输入做 A/B 对比。否则无法判断质量变化来自选题、写作、润色还是审稿。

## 13. 交给新模型的任务说明

可以把本文、生产提示词清单和最终内容生成规范一并提供给新模型，并使用下面的任务描述：

```text
你正在重构 AI Benchmark Studio 的生产提示词。

先理解项目工作流和每个阶段的职责，再阅读完整生产提示词。请不要改变 Protocol Lock、人工实测、Blind 安全、AI Score immutable、Human Review 审计、证据来源和历史版本规则。

你的目标是提高最终社区文章的选题、标题、自然度、信息密度和事实保真，同时减少固定模板、机械分类、重复内容、虚构体验以及范围扩大。

请完成：
1. 识别现有 Prompt 之间的重复、冲突、职责越界和缺失约束。
2. 区分应该由 Prompt、结构化输入、Schema、确定性校验或人工审核解决的问题。
3. 优先提出 Content Discovery、提纲与初稿、语言润色、标题刷新和 Evidence Check 的改造方案。
4. 为每个改动给出新版 System Prompt、User Prompt 数据结构、Prompt Version 和修改理由。
5. 设计覆盖正向、负向、混合、材料不足、单场景、多任务、对比、数字引用和多模态证据的评测集。
6. 给出旧版与新版的 A/B 评价维度，不要只依赖模型自评。

不得把样例文章中的事实写进生产 Prompt，不得降低证据要求，也不得让润色模型重新决定事实或观点。
```

## 14. 配套文件

- 全部生产 Prompt：[ai-prompt-inventory.md](./ai-prompt-inventory.md)
- 最终文章规则：[final-content-generation-standard.md](./final-content-generation-standard.md)
- 产品规则：`PRODUCT_SPEC.md`
- 技术边界：`ARCHITECTURE.md`
- 已确认决定：`DECISIONS.md`
- 验收条件：`ACCEPTANCE_CRITERIA.md`
- 路由与模型：`lib/ai/config.ts`
- 社区内容链路：`lib/services/publish.service.ts`
- 快速后台流程：`lib/services/quick-workflow.service.ts`、`lib/quick/worker.ts`

另一个模型提出新 Prompt 后，仍需要在代码中通过 Schema、领域校验、真实样本和全链路测试验证，不能直接以文档输出替换生产配置。
