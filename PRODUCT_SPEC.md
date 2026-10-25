# AI Benchmark Studio — Product Spec

### 重新上传测试文件（2026-10-25）

测试执行页为管理员提供“移除文件并重新上传”。确认后将本轮全部上传移出当前列表，沿用锁定任务、Prompt、输入及Rubric创建新的锁定Protocol版本与空TestRun矩阵；重新上传所有产品结果后按原流程重新分析。原文件、旧评分、复核、发现与文章保留，不原地删除或改写；新轮不采用旧分析的完成状态。后台有任务时拒绝重传，重复提交返回同一空的新轮，过期页面不能向旧轮上传。此入口为整轮替换，不是逐文件物理删除。详见docs/test-reupload.md。

### 社区分享表达增量（2026-10-25）

新生成从具体用途与分享理由选材，连接输入/动作、代表性结果和有依据的评价；参数、画面枚举与使用提醒按对当前任务的影响取舍。短分享可直说结果，有真实过程的长文可按步骤讲心得，不强制第一人称或情绪。图像任务不强求产品引语，实际引语仍须逐字真实；不同必要条件保留，不附加无依据的泛免责声明。Story Brief 的 ending 可为空，scope 和主线证据仍必需。共享规则用于选题、策划、写作、定向修订与独立审稿，不借用参考文事实或编造作者体验。细则见 `docs/community-sharing-generation.md`；模型、阶段、事实门禁、历史版本与上游实验规则保持。

### 社区输出编辑增量（2026-10-17）

沿用Story Brief → 初稿 → 只读初审 → 按需修订 → 独立终审。Brief围绕一个读者问题选材，正文说明具体细节怎样影响任务，减少无关参数、产品回答长引用和重复结论；不同必要条件必须保留。没有新增价值的结尾可省略，互动默认可空。实际正文输入保留完整任务、事实账本、限制、作者判断及原始文本，不重复旧选题元数据和Findings副本；审核继续读取完整来源与原始证据。题目仍须有产品、用途及具体信息，不强制列举或冒号。复制旧稿时，同一独立互动段落只输出一次，保存历史不变。模型、调用阶段数、事实门禁、评分、Blind与人工复核规则保持。

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

项目默认使用快速模式：每次只生成 1 个最有代表性的核心 TestCase，降低等待时间并让用户尽快进入真实测试。专业模式保留 2–4 个 Case、完整配置、逐项复核和专业报告能力；Protocol 锁定前可切换模式。

TestCase：

- title
- objective
- prompt
- inputDescription
- inputArtifacts
- observationFocus
- executionRules

历史多任务 Protocol 草稿仍可删除不合适的 TestCase，并按剩余任务继续测评。系统至少保留 1 个 TestCase；新 Protocol 默认只生成 1 个核心任务，锁定后仍保持不可修改。

生成任务前必须根据 Product Research 汇总真实输入能力，包括 Prompt 字符上限、文件上传支持和输入格式。横向测评取共同能力和最小已知字符上限；任一产品不支持文件上传时不得生成 `inputArtifacts`。长材料只有在代表性片段能独立验证原目标时才可缩短，并说明抽样范围；不得静默截断。缩短后无法验证原目标时必须改选任务。服务端在生成后及 Protocol Lock 前再次校验，无法执行的任务不能锁定。

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

用户上传 Raw Artifact：image / PDF / Word / PPT / Excel / text / video。只要每个 TestRun 至少存在一个通过文件签名与大小校验的 Artifact，就允许进入分析；预期输出类型只作执行参考，不作为阻塞条件。

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

快速模式默认接受高置信度且证据正常的 AI Score，只展示低置信度、结论冲突、证据不足、解析失败或疑似事实错误的异常项。没有异常时自动 Lock 与 Reveal；有异常时由用户一次确认后继续。专业模式保留完整逐项复核。

## 12.1 产品调研复用

- completed ProductResearch 会登记为产品级不可变快照，默认有效期 90 天。
- 新项目优先复制每个产品最新快照到当前 ResearchRun，并保存 `snapshot_id`；不重复调用完整 AI 调研。
- 过期快照显示“资料可能过期”，但不阻塞快速模式；用户可主动重新调研。
- 重新调研创建新快照版本，不覆盖旧版本；历史 Project 始终引用当时使用的版本。

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

### 测试结果批量上传（2026-09-21）

上传弹窗支持一次选择多个文件、继续追加、移除待上传项，以及通过 ⌘V / Ctrl+V 粘贴剪贴板图片。普通文本粘贴保持原有行为；文件与文本可在一次保存操作中一起上传。所有项目逐个调用现有上传接口，保留原始字节、单文件限制与证据校验。逐项显示状态，明确成功的文件在重试时跳过；连接中断未确认结果时提示核对已上传文件。队列仅在当前页面会话保留，刷新需重新选择未上传文件。

## 快速模式后台执行（2026-09-30）

快速项目统一进入 `/projects/:id/quick`。创建后后台生成方案；用户采用并锁定方案后，手动去产品完成实测、上传原始结果。当前批次全部保存且所有产品都有证据后，后台依次运行 Blind Judge、异常检查和 Findings。正常流程只保留“采用方案，开始测试”“确认发现并生成文章”两次确认；评分异常仍需人工复核。

确认 Findings 后，后台选择推荐选题、生成初稿、调整语言、核对原始证据，完成后直接展示文章。专业分析和报告随后运行，不阻塞文章。默认复用已有写作偏好；首次使用短文自由结构。专业编辑入口保留。

任务及成功 AI 阶段保存在数据库；刷新、离开页面不承担推进流程的职责。失败显示当前阶段，支持重试并复用输入、模型和 Prompt 版本相同的成功阶段。上传失败不会进入分析；上传成功但调度失败时保留成功状态并提供继续分析入口。快速模式节省操作和重复生成时间，不承诺改变供应商单次响应速度。

## 同产品多次测评：统一产品入口（2026-10-03）

产品档案与测评项目分离：同一产品可以关联多次独立测评，每次保留自己的意图、方案、实测证据、评分、发现、报告和文章。产品库只展示已有原始测试结果的真实产品，详情页汇集不可变调研版本、有测试结果且未归档的测评记录，以及已完成报告/文章的入口；不将多次评分、证据或结论拼成一次实验。

新建测评支持输入名称/官网查找已有产品，也可从产品详情直接开始。明确选择已有产品后使用其稳定 ID 与数据库中的名称/官网；同一项目不能重复添加。新输入的规范化名称相同时复用已有产品，但官网冲突须选择已有产品或用厂商/产品线区分名称。相同域名仅用于推荐候选，不作为自动合并依据。产品字段与历史实验不因新建测评被覆盖。

新项目继续按既定规则引用调研快照。详情页的报告/文章计数包含完成版本，入口打开该项目现有报告/文章页面；逐版本内容浏览、历史方案复测、跨测评写作和既有重复产品的人工合并另行实现。

## 产品库收录与删除（2026-10-03 用户修正）

产品须在至少一个未归档、非内部验证项目中有属于自己的有效原始 Artifact 才进入产品库；仅名称、调研、测试计划或空 TestRun 均不算已测。同一对比项目其他产品的证据不算该产品的测评数据。新建表单的已有产品候选沿用此规则；以后上传结果会自动收录。未测条目从产品库展示中移除，原有产品身份和关联保留，不做永久数据删除。

每张产品卡提供“删除”，确认后设置 products.archived_at，并在“已删除”中提供恢复。归档不删除项目、调研、方案、测试结果、评分、报告或 Storage 文件。已归档产品不能用于新建测评，恢复后按收录规则重新展示；已有项目仍可访问。删除/恢复必须有处理中状态、失败提示和重试能力，刷新后状态保持。

## 测评记录重命名（2026-10-03）

“我的测评”卡片菜单提供“重命名”，支持已完成和进行中的未删除记录。名称须为 1–120 字符；保存时去除首尾空白、合并连续空白。未删除记录的名称在当前工作区内唯一，忽略英文大小写和空白差异；新建、改名及并发操作均由数据库唯一索引保护，已删除记录释放名称。重名时显示明确提示并保留输入，保存期间禁用重复提交。

改名仅更新项目名称，产品名称、方案、原始结果、评分和既有生成内容不变。列表、侧栏最近项目、产品库的测评记录同步显示新名称；已有报告/文章正文及生成输入快照保留历史原文，不因记录改名重新生成。

## 最终内容生成规范（2026-10-04）

用户确认统一规范见 `docs/final-content-generation-standard.md`，适用于快速与专业来源的社区文章。材料投影和结构选择由程序完成，按所选任务的证据覆盖自动选单场景、多功能或同任务多产品对比；不引入跨项目复测。提纲与初稿合并一次请求，后续为初稿内容核验 → 只改三项文案的语言编辑 → 独立事实保真/文章质量审核。最终审核只返回结论及图片关联，不再生成另一版正文。

本文替代此前强制好用/一般/难用标题、第一人称开头、最低200字/四段及三阶段生成的要求。旧结构偏好仍可读，但分类只用于选材；没有发现的类别省略，测试范围不能变成产品缺点，短材料允许短文。程序检查来源/观察引用、重复选材、固定分类前缀、空类别、数值漂移、特定无依据收益/过程断言、图片映射；语义检查任一失败禁止 ready。专业正文输入不包含完整 Report、排名或数值评分；两类来源均核对原始 Artifact。

新文章保存规范版本、提纲、内容简报、润色前后文案、四阶段调用追溯及六项保真结果。旧文章与上游实验保持原版；重新生成沿用新 PublishPack 版本。详见规范中的重试上限及审计边界，不承诺模型审稿等同人工验收。

已完成文章支持单独更换标题。标题任务只读取已核验正文、当前标题、渠道和核心观点，不改正文、标签、互动句或证据关系；新标题须与当前标题不同、6–28 字、具体清楚且有真实钩子，禁止标题党和正文无依据数字。每次更换创建新的 immutable PublishPack 版本，并保存 route、输入签名、usage 与前后标题。


## 视频媒体证据架构（2026-10-11）

按本次用户要求，替代此前直接传输 video_url 的视频策略：视频由独立 Node/FFmpeg 预处理，限量关键帧视觉观察、原生字幕与可替换 ASR 汇总为 MediaEvidence；Judge、Findings、Publish 读取证据，不发送原始 MP4。视频 Case 的辅助截图也先形成观察，服务端对已知产品身份脱敏，再用集中 judge_video_evidence 文本路由评分；原生图片/PDF Case 仍保留既有多模态路由。局部提取/ASR/Vision 失败只记 warning，有有效证据就继续。Locked Rubric、同 Case 路由一致、immutable AI Score、人工执行与 append-only Review 不变，不重写历史记录。详见 [视频媒体证据架构](docs/video-media-evidence.md)。

## 作者判断与自然表达（2026-10-16）

确认发现和写作配置提供折叠选填区“补充你的判断”：用途、关注点、取舍、选择，各最多600字，不增加必须确认的步骤。作者真实偏好参与选材与表达，不能生成未记录的经历、情绪或产品事实。文章可保留有据的主观取舍、不同篇幅与自然结尾，不强制均衡优缺点、总结或互动。

已有文章可补充后显式重新生成，判断与文章一起保存到新版本，旧稿不覆盖；未填写兼容旧流程，全部清空代表禁用个人判断。当前确认来源可继承，文章输入优先，不跨不同Findings复用。AI不代填作者输入，审核同时检查事实与作者意见边界，工程回归不替代真实样稿效果评估。详见 [作者判断与自然表达](docs/author-perspective-writing.md)。


2026-10-12 标题概括优先：用户要求标题主要概括测评内容。首次选题、Brief、初稿、按需修订、初审与最终审核、单独刷新统一优先表达产品、测试用途或场景和有证据的主要结果，让未看正文的读者立即理解。不强制钩子、反差或负面问题，小摩擦不能替代全文主线；核心任务失败可以概括失败但必须交代用途。保持6–28字符、事实边界和独立换标题的新版本审计。旧文章不批量改写。此要求替代此前标题必须有真实钩子的偏好。


2026-10-12 文章重生成与保存：快速和专业编辑器统一提供“重新生成文章”“保存修改”。重生成沿用当前选题/写作配置与原始测评证据，在后台执行现有完整写作及独立审核流程，创建新版本，标题/正文/标签/配图可随新稿更新；不重测产品或覆盖旧稿。生成中和失败时显示上一版，失败可创建新尝试重试。保存标题、正文、标签、互动句和真实截图顺序，创建ready新版本，下次进入显示该版；人工修改不调用AI，也不冒称修改后已通过AI核验。过期版本拒绝保存，未保存修改先保存再换标题/重生成；所有写操作仍仅管理员可用。

## Kimi 写作模型（2026-10-17 用户授权）

文章正文、按需修订和单独标题刷新使用集中 Moonshot/Kimi 路由，默认 `kimi-k3`；独立文本审稿继续 DeepSeek，视觉审稿继续智谱。K3 始终思考，standard 映射为 low；这替代上述 Flash/non-thinking 写作限定，不改变证据门槛、有限重试、版本不可变或失败不能 ready 的原则。供应商密钥只在服务端，模型切换仅影响新调用，不覆盖旧文章。
