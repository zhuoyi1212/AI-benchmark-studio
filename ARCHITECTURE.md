# AI Benchmark Studio — Architecture

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
