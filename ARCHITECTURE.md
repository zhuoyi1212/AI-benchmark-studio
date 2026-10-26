# AI Benchmark Studio — Architecture

### 固定Skill编辑契约（2026-10-26）

`lib/ai/skills/de-ai-flavor-source.ts`保存用户指定上游Skill原文、提交与SHA；`community-de-ai-flavor.ts`提供原文＋项目覆盖契约和八项只读审稿指导，接入现有Story写作/定向修订/初审/终审。没有读全局Skill路径、远程下载、第三方脚本或新增调用阶段。四条受影响路由Prompt与内容策略升版参与检查点签名，现有JSON/实际输入追溯与失败/版本边界保持；无表或迁移。博主profile目前是语料收集/应用方案，没有把示意配置接入运行时。

### 图片分析副本（2026-10-26）

Direct Upload → TestExecutionService 完整图片 SHA/解码校验 → Sharp 有界无损/高质量编码 → 私有 Storage 副本 → record_test_artifact 一次保存 metadata.analysisImage。Judge/Findings/Publish 通过 server-only imageForAI 验证 available_test_artifacts 来源及副本校验值，以 Base64 发送并说明技术处理边界。旧图按需内存适配，策略参与输入签名。删除/失败补偿批量清理原图及副本，确认不明保留对象。无 DDL、新模型阶段或 Provider 变更；详见 docs/analysis-image.md。

### 逐文件删除（2026-10-25）

RemoveArtifactAction → 管理员Server Action → TestExecutionService → Repository → remove_test_artifact事务。复用restart_test_execution的项目mutex、活跃任务检查及完整任务复制；只把未删附件的元数据关联到新TestRuns，共享原Storage对象，不复制binary。test_artifact_deletions记录待清理/完成回执，available_test_artifacts安全视图排除被删对象。Storage API清理原件、预览和视频缓存后完成回执；失败持久显示重试。新轮重新评分，历史AI分与复核不改。协议版本与旧worker/上传防过期沿用现有逻辑，无新增AI路由或模型阶段。

### 社区分享指导（2026-10-25）

`community-sharing-policy.ts`集中维护用途、结果与评价的选材/表达及语义审稿指导，接入快速/专业Discovery、Story Brief、初稿、按需修订与只读初审/终审；没有新增调用阶段或规则打分器。Brief的ending允许空串，其他事实与引用门禁不变；策略与五条受影响路由Prompt升版参与既有检查点签名。无新表、migration、模型配置或历史回写。

### Reader editing输入投影（2026-10-17）

`buildStoryWritingInput`为正文与定向修订构建显式字段投影：config、products、完整tasks、完整factLedger与scopeNotes、可选authorPerspective、已验证storyBrief、originalDetails。去除旧selectedIdea和重复humanConfirmedFindings等元数据，原始事实与任务条件不裁剪；策划、初审及终审仍使用完整postInput/原始证据。无新增模型阶段或Schema/表变更。各受影响Prompt单独升版，写作路由沿用Kimi K3，审稿路由保持独立。剪贴板格式化仅省略空字段和与正文独立段落相同的互动，不改存储内容或语义去重。

## 1. 技术栈

锁定：

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Postgres
- Supabase Storage
- Supabase Auth（后续，不阻塞第一阶段）
- AI Provider Layer（第一版：智谱 AI / GLM + DeepSeek）
- Vercel
- GitHub

当前不要增加：LangChain、LangGraph、Vector DB、Redux、微服务、Kubernetes、独立 Python Backend。

## 2. 分层

目标：

`Page/Component → Application Service → AI Task Service / Repository → AI Router / Provider Adapter / Supabase`

当前 Mock：

`Page → Mock Service → Mock Response`

迁移时优先替换 Service 数据来源，不重写页面。

页面不得直接写 SQL、调用任何 AI Provider、使用 Service Role、读取 blind mapping 或依赖固定业务产品/Case/Rubric。

线上访问分为公开只读与管理员两层。普通 GET/HEAD 页面请求可以读取项目、产品和已生成内容；所有 Server Action、非读取请求、`/api`、设置、创建项目和内部 Demo 仍须通过 Basic Auth。Proxy 覆盖内部访问标记，根布局只用该标记显示只读状态，业务授权以服务端请求门禁为准。`/admin` 用于触发管理员认证并返回工作台。生产环境缺少管理员密码时，公开读取继续可用，写入与内部入口 fail closed。

## 3. 核心 Domain

```text
Project
├ Product
├ Research
├ Protocol
│  ├ Test Case
│  └ Rubric
├ Test Run
│  └ Artifact
├ Blind Sample
├ Judge Run
│  ├ Judge Case Run
│  └ Judge Score
├ Review Session
│  └ Human Review Event
├ Final Result Analysis
├ Report
└ Publish Pack
```

## 4. 第一版核心表

```text
projects
products
project_products
research_runs
product_research
protocols
test_cases
rubric_dimensions
test_runs
test_artifacts
blind_samples
blind_mappings
judge_runs
judge_case_runs
judge_scores
review_sessions
human_review_events
result_analyses
reports
publish_packs
```

复杂 AI Response 可适度 jsonb，不要机械过度拆表。

## 5. Source of Truth

- Project：projects
- Project Products：project_products
- Research：research_runs + product_research
- Protocol：protocols + test_cases + rubric_dimensions
- Test Progress：test_runs
- Raw Evidence：test_artifacts + Supabase Storage
- AI Judge：judge_runs + judge_scores
- AI 原始评分：judge_scores.ai_score
- Human Review：human_review_events
- Final Score：latest active human override ?? ai_score
- Final Analysis：result_analyses + final_score_signature
- Report：reports，绑定 result_analysis
- Publish：publish_packs 当前保留 report 生命周期绑定，但内容输入独立构造成 CommunityPostSource；Report 正文不是文章 source of truth
- Publish Style QA：最终 Community Post JSON 内保存 Style Critic 结果、调用溯源与是否自动 rewrite；只有最终 Critic 通过的正文可以成为 ready
- Safe Rewrite：项目自有 `community-style-policy.ts` 固定语言规则；复用 community_post_rewrite Flash 路由，一次改写。确定性门禁加独立 Meaning Preservation 语义检查，拒绝改稿时只回退到审稿合格的原稿。规则不从第三方 Skill、文件或网络动态加载。

不要维护多个互相冲突的 Final Score 或 progress source of truth。

## 6. Protocol Versioning

支持：

`Project → Protocol v1 locked / Protocol v2 draft`

locked 后不能原地修改。test_cases、rubric_dimensions、test_runs、judge_runs 必须可追溯到具体 Protocol Version。

## 7. TestRun

标准化 TestRun 表示：

`Protocol × TestCase × Product`

MVP 默认一个标准主记录。重复实验的 attempt/repetition 以后再加。

## 8. Artifact

文件进入 Supabase Storage；Postgres 只存 storage path、fileName、MIME、size、previewPath、metadata。

Artifact 必须可追溯：

`Artifact → TestRun → TestCase → Protocol → Project`

## 9. Blind Architecture

blind_samples 与 blind_mappings 分开。

Reveal 前：

- 客户端可读取 BlindSample
- 客户端不可读取 BlindMapping
- Judge 输入 sample_id，不输入 product_id

建议用 Server Route/Server Action + RLS/DB function + server-only service role 实现。

禁止把 mapping 下载到浏览器后只隐藏 UI。

## 10. AI Architecture

所有 AI Provider 调用 server-side。业务层只表达 `researchProducts`、`evaluateComparability`、`generateProtocol`、`judgeSamples`、`analyzeFinalResults`、`generateReport`、`discoverContentIdeas`、`generateCommunityPost`，不得调用供应商函数或写模型名。

```text
Page
→ Application Service
→ AI Task Service
→ AI Router
→ Provider Adapter
   ├ ZhipuProvider
   └ DeepSeekProvider
```

第一版集中路由：

| Task | Provider / Model |
| --- | --- |
| Product Web Research | 智谱 Web Search |
| Research Synthesis | 智谱 / `glm-5.2` |
| Comparability | DeepSeek / `deepseek-v4-pro` |
| Protocol / TestCase / Rubric | DeepSeek / `deepseek-v4-pro` |
| Text-only Judge | DeepSeek / `deepseek-v4-pro` |
| Multimodal / Mixed Judge | 智谱 / `glm-4.6v` |
| Final Result Analysis | DeepSeek / `deepseek-v4-pro` |
| Report | 智谱 / `glm-5.2` |
| Content Discovery | DeepSeek / `deepseek-v4-pro` |
| Community Post | DeepSeek / `deepseek-v4-flash`（non-thinking） |
| Community Post Rewrite | DeepSeek / `deepseek-v4-flash`（non-thinking） |
| Community Style Critic | DeepSeek / `deepseek-v4-pro` |
| Screenshot Understanding | 智谱 / `glm-4.6v` |
| OCR preprocessing | 智谱 / `glm-ocr` |

路由只在集中 Config 中维护；页面、Domain 与数据库业务逻辑不得硬编码映射。第一版不做无脑跨厂商 failover，切换 Provider 必须创建新的 AI Run。

AI Pipeline：

`Research → Protocol Generation → Judge → Final Result Analysis → Report → Raw Evidence Mining → Micro Finding / Human-readable Moment → Community Angle → CommunityWritingPacket → DeepSeek Community Post → Three-part Critic`

每次运行记录：

- provider
- model
- prompt_version
- input snapshot/signature
- status
- timestamps
- input/output tokens、latency、estimated cost（API 不提供时可为空）
- output
- failure reason（如适用）

Provider 返回必须经过 Normalize → Runtime Validation → Domain Object。只保存业务需要的最终结构化结果，不保存或展示 provider-specific chain-of-thought。

## 11. Structured Output

AI 业务输出优先结构化 JSON，并有明确 TypeScript 类型与运行时校验。

适用：

- ResearchResponse
- TestProtocol
- AIJudgeScore[]
- FinalResultAnalysis
- BenchmarkReport
- ContentIdea[]
- CommunityPost

使用 Zod 对两家 Provider 的 envelope 与 Domain 输出做运行时校验。验证失败进入 retry/failed，不允许 silent fallback 到 Mock。

## 12. Research Versioning

Research 支持多次运行并保留旧版本。Protocol 必须引用具体 research_run_id。

## 13. Judge

`judge_runs` 表示 Protocol 级评审批次；`judge_case_runs` 表示该批次内某个 TestCase 的唯一 AI 路由。JudgeCaseRun 必须绑定 judge run、protocol、test case、provider、model、prompt version 与 input signature。

同一个 TestCase 的 Sample A/B/C 必须引用同一个 JudgeCaseRun。全部 Artifact 为纯文本才可选择 text-only route；任一 Sample 为图片/PDF/视觉文件或混合模态时，该 Case 全部 Sample 统一选择多模态 route。禁止按 Sample 路由。

多模态 route 每次只传一种二进制媒体族，避免 Provider 拒绝视频、图片和文档混合输入。系统先按 Locked Protocol 的 expectedOutputTypes 选择每个 Sample 都具备的共同媒体族，再附加文本 Artifact；视频任务优先视频，图片或文档仍保存在原始 Artifact 清单中但不与视频同请求发送。比较项目没有共同证据格式时，在调用 Provider 前明确失败并要求补充同类型证据。选择策略版本、媒体族和实际发送的 Artifact 进入 input signature，保持可审计。

JudgeScore 粒度：

`test_case × blind_sample × rubric_dimension`

## 14. Human Review

ReviewSession：

`reviewing → locked → revealed`

HumanReviewEvent append-only：

- override
- revert

不得 UPDATE AI 原始 Score。

## 15. Result Analysis

只在 revealed 后生成，必须保存 final_score_signature。分数变化时旧分析视为 stale。

## 16. Report / Publish

`Research + Evidence / Findings + Product Context → CommunityPostSource → Community Angles → Community Post`

社区截图推荐最终引用真实 `test_artifact.id`。

Publish 使用独立的 `CommunityPostSource`：提取 productContext、interestingFacts、observedBehaviors、strengths、frustrations、surprises、expectationVsReality、userTradeoffs、productPositioning、unresolvedQuestions、qualitativeSentiment 与 artifacts。禁止把 `ranking`、`caseScores`、`dimensionScores` 或完整 Report 发送给 Content Discovery / Community Post。

Evidence authenticity 是硬边界：真实用户 Evidence 才能启用 Experience Post；Research、公开资料、Demo fixture 与模拟素材只能支持 Opinion / Discussion。Content Discovery 必须输出 5–8 个多类型 Community Angles，Community Post 按 short / medium / long 动态校验长度，并经过 score-free、report-language-free、观点密度与第一人称真实性校验。

## 17. Storage

建议 bucket：`benchmark-artifacts`

路径：

`projects/{projectId}/runs/{testRunId}/{artifactId}.{ext}`

不要依赖产品显示名作为路径主键。

Artifact 文件不经过 Next.js Server Action 或 Vercel Function。服务端校验 TestRun 与文件描述后签发一次性 Supabase 上传 URL，浏览器直接 PUT 到私有 bucket，并显示上传进度与有限自动重试；上传完成后，服务端再次核对 Storage 中的大小、MIME、文件头和文本 SHA-256，才写入 `test_artifacts`。校验或数据库写入失败时清理对应对象，成功响应丢失时可按 storage path 幂等确认。Vercel Function 的请求体上限不能作为 Artifact 大小上限。

## 18. 路由

长期目标：

```text
/projects
/projects/new
/projects/[projectId]/research
/projects/[projectId]/protocol
/projects/[projectId]/test
/projects/[projectId]/review
/projects/[projectId]/results
/projects/[projectId]/report
/projects/[projectId]/publish
```

逐步迁移 `/projects/demo/*`，不要长期依赖 `"demo"`。

## 19. Access Guard

- Test：必须有 locked Protocol
- Review：必须有可评审 Judge Run
- Results：ReviewSession 必须 revealed
- Report：必须存在当前有效 FinalResultAnalysis
- Publish：必须存在 Report

不能只靠“不显示链接”。

## 20. Error Handling

异步步骤考虑 pending/running/completed/failed/retry。

AI 调用失败不能破坏已有实验记录，也不能 silent fallback 到 Mock。

## 21. 安全

- Secret 不进前端
- 所有 AI Provider 调用与凭据 server-side
- Client Bundle 不得包含 `ZAI_API_KEY` 或 `DEEPSEEK_API_KEY`
- Service Role server-only
- Blind Mapping reveal 前不可读
- Storage 按项目控制
- 不信任客户端传来的 owner_id / product mapping / final score

## 22. 迁移策略

按顺序真实化：

`Project → Research → Protocol → TestRun/Artifact → Blind/Judge → Review → Analysis → Report → Publish`

快速模式将主链缩短为：

`Project → reusable ProductResearchSnapshot → 1-Case Protocol → Artifact → Blind/Judge → anomaly-only Review → confirmed Findings → Publish`

`ProductResearchSnapshot` 是全局不可变版本；每个 ResearchRun 复制快照到项目级 ProductResearch 并保留 `snapshot_id`，因此协议只读取项目快照，历史项目不会随产品库更新而变化。专业 Report 可独立后台生成，不作为 confirmed Findings 进入 Publish 的前置条件。

某阶段真实化后，真实 Project 不允许 silent fallback 到 Mock。Demo fixture/test fixture 可以保留。


### Publish 内容机制调整（2026-09-09）

Publish 内容链改为一次选材判断、一次 Flash 写作、一次现有 Critic；仅语言问题增加一次 Flash 改写和一次复审。legacy packet 字段继续用于历史读取和来源关联，正文只接收 editorialBrief。Router 新增可选 onResponse 观察接口，仅 Publish 使用，记录实际消息与 answer content，不存 provider reasoning；其他任务行为不变。

选材默认聚焦一个已有 Test Case，页面可选择任务；未截断的原始文本另存为 completeAnswer，仅用于 Critic 核对遗漏，不重复塞给正文模型。局部引文不能证明全文缺失。Pro high 选材对照没有显示优势且成本增加，最终恢复 Pro standard，Critic 原配置不变。


### Publish review v9（2026-09-10）

既有 Task Service / Router / Provider / append-only attemptAudit 继续使用。community-review.ts 校验五类事实依据与具体问题；communityReviewDecision 由问题类别导出 pass/rewrite/stop，不使用新分数。事实/背景/价值问题停止，语言/重复问题最多一次改写并复核含义。问题引文须属于 draft，避免修改历史任务。旧 review 通过旧字段读取；新 review 的 totalScore 为 null，页面不显示虚构分数。正文输出不含 coreOpinion/contentType，服务从已选选题补回并执行原有验证。无数据库迁移。

2026-09-11 Publish 输入修正：editorialBrief优先taskContext与completeAnswer，answerIsComplete说明是否使用完整存档；没有全文时保留摘录，额外证据仍保留。Critic不再在brief之外重复传同份任务/全文。自定义角度保留rawQuote而不拼入whatHappened；生成所需材料及配置先校验再begin。无数据库迁移。

### Evidence-backed Editorial Plan（2026-09-21）

现有 Publish Service 内顺序执行：community_post / CommunityEditorialPlan → community_post / CommunityPostDraft → community_post_evidence_check / EvidenceCheckedCommunityPost。两次写作调用共享现有集中 Provider 配置，策划 schema 先校验引用才允许正文调用；不新增并行 Publish 系统。

Quick 来源为 confirmed Findings；专业来源从 Case 的 Judge evidence 和 Human Review reason 投影为不含数值评分的观察。章节引用以观察 ID 和 Artifact ID 关联，readerBenefit 取已有 impact；正文与最终核对仍保留来源、任务与证据范围。原始 Artifact 最终读取逻辑不变。

publish_packs.community_post JSON 新增可选 articleReview、generationTrace，editorialPlan 扩展核心问题、读者、范围、sections、materialGaps；每阶段记录 provider/model/promptVersion/inputSignature/usage，pack usage 聚合三次调用。历史 JSON 缺少新字段仍可读。无表结构改动。失败继续使用既有 failed/retry 生命周期，不回退 Mock。

2026-09-21 语言编辑补充：CommunityPostDraft 后增加 `community_post_style_edit / CommunityStyleEdit`，只允许 title/body/interactionQuestion 三字段。既有多模态最终核对增加六项 stylePreservation，独立比较 originalDraft/draft，任一 false/缺失/有 issues 拒绝保存。community_post JSON 增加可选 styleEdit 原稿/改稿/changed 与 stylePreservation，generationTrace 扩展 style_edit，usage 聚合四阶段。段落重排后清空旧截图段号与引文，由最终核对重新建立。失败信息带阶段名，仍使用全流程新版本重试；无数据库迁移。

### Mixed PDF / Screenshot Evidence（2026-09-23）

智谱实测拒绝同一请求同时包含 PDF file_url 与 image_url（HTTP 400 / 1214）。Quick Findings 与 Quick Publish 原始证据核对复用的 buildArtifactContent 在混合输入时校验 PDF 大小与 SHA-256，使用服务端 PDF.js / Node Canvas 将全部页面渲染为 PNG，在内存中发送，每页仍绑定原 Artifact ID 与页码。PDF 单独输入保持原文件 URL，文本仍逐字读取；原始 Storage、Artifact 元数据和历史记录不变，页面渲染不是新实验图片，也不进入截图推荐。

每次混合分析最多 32 页 PDF、页面图片编码总量 20 MiB；超限、损坏或加密明确失败，不截页或用 OCR 摘要替代。输入快照标记 mixed-pdf-pages.v1，Findings promptVersion 更新。Next 服务端依赖保留 native Canvas、worker、字体、CMap 与 WASM 追踪。Provider 错误仅保留数字业务码和已知混合输入错误分类，不记录供应商原始报错中可能回显的证据、签名 URL 或密钥；Findings 持久化可操作的中文错误。无数据库迁移。

Blind Judge 与 Experience Findings 共用 `single-media-family.v1` 证据选择规则。系统按 Locked Protocol 的期望输出类型选择所有 TestRun 都具备的一种二进制媒体（视频、文档或图片），可同时保留文本；未选中的附件继续作为原始 Artifact 保存，但不与另一种二进制媒体放进同一次 Provider 请求。这样既保留证据追踪，又避免供应商拒绝图片、视频和文档混合输入。

社区初稿的多模态内容核验允许同一 Provider/Model 做一次有界结构修复。第一次响应不是合法 JSON 或不符合 Schema 时，Router 使用精简校验问题请求第二次完整结构化输出；这只是传输结构修复，不会把未通过事实或内容审核的文章改判为通过，也不会跨 Provider fallback。

结构化响应解析只规范化四类不改变数据含义的格式偏差：UTF-8 BOM、包住完整对象的单层 JSON Markdown fence、JSON 字符串中的原始换行/制表符，以及对象或数组末尾的多余逗号。带说明性前后缀、缺少闭合结构或其他任意文本继续失败；规范化后的值仍须通过任务 Zod Schema 和业务门禁。

内容核验模型只拥有 `title`、`body`、`interactionQuestion`、`articleReview` 和 `factCheck` 的输出权限。初稿阶段已经验证的 `writingPlan`、`contentBrief`、标签、截图推荐和证据引用由服务端保留并合并，核验模型不能改写证据片段或来源关系；修订文案仍需重新通过事实、范围和表达门禁。

同轮真实验证中，同步 completion 在等待整段输出时出现网络中断。智谱 structured completion 改为 SSE 流式接收，在服务端仅累计 answer delta，逐事件丢弃 reasoning；收到结束标记后仍走既有 normalize 与 schema 校验。缺少 finish_reason 的半截响应视为网络失败，截断原因仍进入原有限重试，不把半截 JSON 保存为完成。原非流式 JSON 响应仍可兼容。

## Durable Quick Workflow

`Server Action → Quick Workflow Service → quick_jobs → Worker → existing Application Service → AI Task Service → Router → Provider`。原业务表仍是结果唯一来源，任务表只记录执行调度。`after()` 仅加速首次唤醒；常驻 Node 由 instrumentation 注册 worker，Serverless 使用受 CRON_SECRET 保护的调度入口。页面读取状态并刷新，不触发下一阶段。

领取任务通过行锁、SKIP LOCKED、项目级 advisory lock 和 lease token 实现项目串行、项目间可并行；完成与入队后继在同一事务内。每 60 秒续租，进程死亡后最多 15 分钟可回收；连续 3 次执行中断进入 failed。相同项目/种类/scope 入队去重。AI 成功结果按 route/schema/input 签名保存在服务端检查点；写作每轮最多一个未完成 AI 阶段，避免三次模型调用绑定同一个函数请求。外部供应商响应到检查点写入之间仍是 at-least-once，不能保证计费 exactly-once。

部署与验证见 `docs/quick-workflow.md`。

### Final Content Policy v1（2026-10-04）

`community-content-policy.ts` 集中维护生成、模板、内容核验、语言编辑、最终审核规则及确定性门禁。PublishService 从选题覆盖的 Findings/专业观察投影 factLedger，保留证据ID与任务关联，不传 Report全文/数值评分。初稿 schema 必需 writingPlan；ReviewedCommunityPost 同原始 Artifact 做内容核验；HumanizedCommunityPost 使用 strict 三字段 Schema；EvidenceCheckedCommunityPost 仅返回质量/六项保真/图片关联，程序合并实际审核文案。

同一原始 Artifact 读取助手用于两类来源；图片/PDF混合路由仍按实际内容模态选择。复用 Router 和 quick_job_steps；新增阶段名称不新增任务队列，Prompt/Schema/输入参与签名，旧检查点不能误当新规范结果。publish_packs.community_post 保存 writingPlan/contentPolicyVersion/contentBrief/languagePass/styleEdit/stylePreservation/generationTrace，旧字段可选保证历史可读。此次补齐仓储曾遗漏的 contentBrief/languagePass 保存。没有新增表或客户端权限。


### Reader Story 下游链路（2026-10-11）

此版替代旧 Publish 强制模板与无条件润色流程，保留 AI Task Service → Router → Provider。人工确认 Findings 或专业证据投影后，选题以读者问题为起点；服务限定所选任务及来源 Artifact，再执行 Story Brief → 四字段初稿 → 只读初审 → 按需三字段修订 → 独立最终只读审核。正常为四阶段、修订为五阶段，选题另计；视频先增加一个 evidence_read 阶段。文本策划复用 content_discovery；图片/文件的策划与复核明确使用视觉路由；视频仅由视觉路由先抽取 details，随后文本路由进行策划/审稿。正文和定向修订模型配置不变。

Brief 关联事实和 Artifact ID，服务校验引用及共同任务比较准入；写作者读取原始文本、PDF 抽取文本和 Brief 中的视觉细节。视频在本次下游传输使用 video_url，并将当前任务及其材料与视频放在同一个 user 消息，避免嵌入测试 Prompt 被误当任务；修复请求移动而非重复原视频消息。此前 Judge/Findings 传输及历史评分不在本轮改变范围内。错误日志仅增加媒体数量，不记录 URL 或原始视频。

publish_packs.community_post JSON 增加兼容性的 storyBrief / draftReview，成功保存原稿、实际最终稿、四项质量与六项保真、阶段路由/版本/输入签名/usage。Repository 的既有完成 RPC 原子写入；无新表、无 migration。历史 writingPlan、contentBrief、editorialPlan 仍可读取；重生成创建新版本。成功阶段沿用 quick_job_steps，失败不能 ready 或回退 Mock。配图段落按最终正文锚定句由程序定位。


## 视频媒体证据架构（2026-10-11）

按本次用户要求，替代此前直接传输 video_url 的视频策略：视频由独立 Node/FFmpeg 预处理，限量关键帧视觉观察、原生字幕与可替换 ASR 汇总为 MediaEvidence；Judge、Findings、Publish 读取证据，不发送原始 MP4。视频 Case 的辅助截图也先形成观察，服务端对已知产品身份脱敏，再用集中 judge_video_evidence 文本路由评分；原生图片/PDF Case 仍保留既有多模态路由。局部提取/ASR/Vision 失败只记 warning，有有效证据就继续。Locked Rubric、同 Case 路由一致、immutable AI Score、人工执行与 append-only Review 不变，不重写历史记录。详见 [视频媒体证据架构](docs/video-media-evidence.md)。


2026-10-12 标题策略：lib/community-title-policy.ts 提供共享概括与审核规则，供选题发现、Story Brief、初稿、定向修订、独立审核和refreshCommunityPostTitle复用。标题刷新以articleBody为主、旧标题只作避免重复，旧Brief/选题不再发送，同一次结构化标题任务先输出用途/结果事实摘要再生成标题（至多两次尝试），服务仅保存标题与原有审计及现有immutable PublishPack RPC，不新增模型阶段或表。语义主次由提示词与原有文章审核判断；名称、长度、数字、重复/夸张等确定性校验保留，不用关键词黑名单猜任务是否重要。


2026-10-12 文章版本编辑：Editor → authenticated Server Action → PublishService → PublishRepository.createRevision → create_publish_revision事务。服务从当前工作台校验sourcePackId、内容格式及图片权限；RPC锁定Project和源Findings/Report、核对最新版本后创建版本，不更新ready原稿。manualEdit仅记录来源、保存时间及aiReviewed=false，AI路由字段保留来源追溯，当前编辑稿不显示旧AI审核徽章。regenerate的PublishPack和quick_jobs同事务插入，payload绑定packId/sourcePackId/mode，worker按固定版本复用四至五阶段流程，hard restart保留generating继续；失败明确终止，新尝试新版本，完成不重跑分析/报告。response后唤醒一次，Cron/本地poller续跑，页面只读取状态。quick页将文章重生成交给Editor显示上一版及状态，避免全页遮挡。仅未完成regeneration读取一条job，不增加正常历史读取请求。

2026-10-16 作者判断：FindingsEditor / PublishEditor复用折叠选填组件，经Server Action → Service Schema校验 → Repository/RPC保存人工输入；AI Findings Schema不接收该字段。已确认human_output中的authorPerspective按来源继承到publish_packs.config，文章输入可覆盖或显式清空。PublishService把偏好独立投影到选题、Brief、初稿及两次只读审核/定向修订，不放入factLedger；实际配置与输入签名参与版本追溯和检查点。增强自然表达不新增模型阶段或改变Provider/Model；确定性百分比来源检查也不接受偏好作为事实来源，语义归属继续由独立审核负责。新版本配置与重生成任务同事务写入，旧版本配置保持不可变。

2026-10-16 截图结构修复：多截图仍每批最多2张，用独立截图提示词明确根observations字符串数组、固定数量、字符串转义和禁止answer包装。Router的结构修复将原始图片/原生文件与标签按序移动到当前用户消息，附加修复指令，不重复发送同一批媒体；纯文本消息结构不变。同Provider至多两次请求，失败明确为截图JSON或字段错误，不省略截图、不补造观察、不修改历史实验或旧稿。集中截图Prompt升版，Schema/正文与评分门禁保持。

2026-10-16 重新生成可靠性：Quick worker恢复前检查最新写作请求与目标packId；旧任务不能采用或标记更新版本。普通Publish也以有效lease持久化目标，当前failed合法重试创建新版本后先绑定再调用模型；不再以时间范围批量恢复Publish。重试入口与工作台过滤同步排除已被更新请求替代的旧任务。新终审在原有只读契约上要求每条阻断意见定位最终draft，理由与质量/保真问题一致；结构缺失之外要求逐字引文，无效定位进入既有同Provider有限修复。定向修订在返回时执行标题及已知无依据断言校验，保存前仍保留最终门禁。历史JSON继续可读，无新增migration。排查证据及限制见docs/regeneration-reliability-20261016.md。

2026-10-16 真实回归补充：修订Schema同步执行communityExpressionIssues，避免修订新增报告套话后直到终稿才失败；语言错误包含实际触发短语。初审/终审和相应repair instruction共享locatedReviewOutputRules，明确根issues为六字段问题对象数组，嵌套articleReview.issues为字符串摘要数组。视觉修复仍保留原图，最多两次同Provider尝试，不合格对象不转换、不补造定位。修订/审核Prompt升版，无新增模型阶段或数据表。

### Kimi 社区写作（2026-10-17）

在既有 Task Service → Router → Provider Adapter 中新增 MoonshotProvider；community_post、community_post_humanize、community_post_title 使用 `MOONSHOT_WRITING_MODEL`（默认 kimi-k3）和 `MOONSHOT_API_KEY`。沿用统一 HTTP 错误、最终答案 Normalize、Zod 和同 Provider 有界修复；不保存 reasoning_content。K3 标准推理为 low，预算改用包含思考的 max_completion_tokens。独立文本/视觉审稿、Research/Judge/Findings/Report 路由保持。Publish provider CHECK 和两个 service-only RPC 接受 moonshot，generationTrace/titleRefreshes 新旧 Provider 兼容，历史内容不回填。
