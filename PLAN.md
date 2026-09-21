# AI Benchmark Studio — Goal Mode Plan

Codex 必须按 Milestone 顺序执行。每个 Milestone 完成后执行：

`实现 → Self Review → git diff --check → npm run typecheck → npm run build → 相关测试 → 修复 P0/P1 → commit → 更新 Progress Log → 自动继续`

除非遇到 `00_START_HERE.md` 允许暂停的条件，否则不要等待人工逐步确认。

## M0 — 当前 Mock 数据链最后收口

只修真实逻辑缺陷，不再完善 Mock 体验。

确认：

- Protocol locked 状态持久化
- Test 读取实际 locked Protocol
- 未 locked 不可进入 Test
- Test Case / Prompt 来自 locked Protocol
- TestRun 引用正确 protocolId
- “Protocol 已锁定”不是 UI 写死

不要用更多 localStorage 模拟完整后端。

## M1 — Database Schema

建立第一版 Supabase/Postgres Schema。

至少覆盖：

- projects
- products
- project_products
- research_runs
- product_research
- protocols
- test_cases
- rubric_dimensions
- test_runs
- test_artifacts
- blind_samples
- blind_mappings
- judge_runs
- judge_scores
- review_sessions
- human_review_events
- result_analyses
- reports
- publish_packs

完成 PK/FK/Unique/Check/Index/Delete Strategy/Versioning/Blind Security/Human Audit/Mermaid ER/TypeScript 映射。

输出：

- `supabase/migrations/*`
- `docs/database-schema.md`

## M2 — Supabase Foundation

完成：

- Supabase 依赖
- server client
- browser client（如需要）
- `.env.example`
- typed data access
- migration 可运行
- 基础 repository/service

禁止提交真实 Secret。

## M3 — Real Project Creation

打通：

`/projects/new → Create Project → Create/reuse Products → project_products → projectId → /projects/[projectId]/research`

验收：

- 用户输入真实保存
- 刷新不丢
- Project list 读 DB
- 1–3 产品限制
- 不再回 demo

## M4 — Real AI Research

输入 Project + Products + Official URLs + Intent。

保存：

- ResearchRun
- ProductResearch
- Comparability
- Sources
- status/error

要求：

- 智谱 Web Search 获取真实 Sources，`glm-5.2` 结构化整理 Research
- `deepseek-v4-pro` 只基于已保存 Research 分析 Comparability
- 调用统一经过 server-side AI Task Service / Router / Provider Adapter
- 结构化输出
- 可 retry
- 保留旧 runs
- 真实项目不 fallback 到 Gamma/Canva Mock

## M5 — Real Protocol Generation

根据指定 ResearchRun 生成：

- Protocol draft
- TestCases
- Rubric
- Weight validation
- version
- lock

locked 后不可原地改。Test 必须引用 locked protocol。

Protocol / TestCase / Rubric 默认由 Router 选择 `deepseek-v4-pro`，页面与业务 Service 不写模型名。

## M6 — Real TestRuns + Storage

根据 locked Protocol 创建 `Product × TestCase` TestRuns。

完成：

- image/PDF/text 上传
- Supabase Storage
- TestArtifact metadata
- generation time
- retry count
- manually edited
- notes
- 刷新持久化

## M7 — Real Blind Layer

完成：

- blind_samples
- stable/random mapping
- blind_mappings
- reveal 前客户端只能获得 Sample label
- reveal 前普通客户端拿不到 product mapping

做一次专门 Blind Leakage Review。

## M8 — Real AI Judge

输入：

- Locked Protocol
- Rubric
- TestCase
- Raw Artifact
- Blind Sample

输出并保存：

- Protocol 级 JudgeRun
- 每个 TestCase 唯一 JudgeCaseRun（provider/model/promptVersion/inputSignature）
- JudgeScores
- aiScore
- reason
- evidence
- confidence

Judge 不得获得真实 product identity。同一 TestCase 的全部 Blind Samples 必须使用同一个 JudgeCaseRun；纯文本统一使用 DeepSeek，多模态或混合类型统一使用 GLM 视觉模型。

## M9 — Human Review Persistence

把 localStorage 迁移数据库：

- review_session
- reviewing/locked/revealed
- human_review_events
- override/revert
- reason
- timestamps

AI Score immutable。

Final Score = latest active override ?? aiScore。

## M10 — Reveal + Final Result Analysis

流程：

`Lock → Reveal → Final Score → final_score_signature → AI Result Analysis`

输出：

- winner
- product summaries
- strengths/weaknesses
- bestFor/notIdealFor
- cross-product insights
- recommendation
- limitations

旧分析和当前 Final Score 不匹配时必须识别为 stale。

Final Result Analysis 默认由 Router 选择 `deepseek-v4-pro`。

## M11 — Real Report

基于 Project/Research/Protocol/TestRuns/Artifacts/Judge/Human Review/Final Analysis 生成并保存 Report。

Report 必须绑定 `result_analysis_id`。

Report 默认由 Router 选择 `glm-5.2`，只组织已确定的 Final Analysis 与证据，不重新改变评分、排名或 Winner。

## M12 — Real Publish Pack

完成：

- AI Content Discovery
- ContentIdeas[]
- Rediscover
- Custom Angle
- Publish Config
- Community Post
- Screenshot Recommendations

截图只能引用真实 TestArtifact。不生图，不自动发布。

Micro Finding / Content Discovery 默认使用 `deepseek-v4-pro`；Community Post 首稿与单次 Rewrite 使用 non-thinking `deepseek-v4-flash`，不自动升级 Pro。截图优先复用 ContentIdea、Artifact metadata 与 Judge evidence，仅确需理解画面时使用 `glm-4.6v`。

## M13 — Remove Main Flow Mock Dependencies

真实项目 route 不允许 silent import/fallback：

- mockResearchResponse
- mockProtocol
- mockJudgeResults
- mockFinalResultAnalysis
- mockBenchmarkReport
- mockCommunityPost

允许 demo fixture / tests fixture / development seed。

## M14 — E2E + Hardening

至少完整跑通：

`Create → Research → Protocol → Lock → TestRun → Upload → Blind Judge → Human Review → Lock → Reveal → Results → Report → Publish`

测试异常路径：

- Research fail
- Protocol not locked
- incomplete test
- upload fail
- Judge fail
- early reveal
- invalid override
- stale ResultAnalysis
- missing artifact

## M15 — Final Review

进行：

- Code Review
- Database Review
- Security Review
- Product Rule Review
- Mock Audit

修复所有 P0/P1 后才允许完成。

## Progress Log

2026-09-08 Final Language Follow-up：最终写作 / Safe Rewrite 共享自然连贯规则，删除重复模板指令；仅给写作包补充 anchor 对应原任务背景（600字上限），增加任务转述与亲历边界、审核备注和连贯性审查。原上游不动。真实生成 v30 人工发现对象偷换，排除交付；v31–v33 被拦截，尚无可交付的新自动正文。Mac 锁屏，视觉验证未完成；不得将此项记为生成验收通过。保留混合工作区，未提交此前未归属改动。

2026-09-09 Existing Case Language Revision ✅ 保留上游与旧版本，仅将现有 v29 正文按“场景 → 回答细节 → 个人判断”做编辑辅助 Flash 改写，独立事实/语言/含义复审通过后保存为 v37 ready；审计明确记录编辑草稿与真实模型输出，不冒充纯自动生成。浏览器已刷新确认新版标题、正文及选题卡；上游数据、六份证据文件和历史版本校验不变。typecheck、Publish 53/53、build、diff check 通过。未运行 libai、未重新测试或创建项目；保留混合工作区，未提交此前未归属改动。

每完成一个 Milestone 追加，不删除旧记录：

```text
M0 ✅ <commit> <summary>
M1 ✅ <commit> <summary>
...
```

M0 ✅ 67e8f25 Protocol 锁定状态已真实传递至测试执行，未锁定访问会被阻止，TestRun 与 locked protocolId 保持一致。
M1 ✅ 9dc36c5 建立 22 表证据链 Schema、RLS/Blind 边界、不可变评分与 append-only 人工复核审计，并补齐数据库设计文档和合约测试。
M2 ✅ 0b59fc4 Supabase server foundation 已连接远端空库并实际应用 migration，Schema lint、生成类型、服务端查询、typecheck、测试与 build 均通过。
Provider Routing ✅ 6552e80 建立 Provider-neutral AI Task Service、集中 Router、智谱/DeepSeek Adapter、按 TestCase 一致 Judge 路由与 AI Run 元数据。
M3 ✅ bf62800 新建测评通过原子事务持久化 Project、复用 Product 并创建 ProjectProduct，项目列表与动态 Research 路由读取真实数据库且不回退 demo。
M4 ✅ 7649340 Z.AI Web Search + GLM 结构化保存真实官方来源，DeepSeek 基于已保存 Research 完成可比性分析；ResearchRun 版本、failed/retry、路由元数据与真实 E2E 均通过。
M5 ✅ 13396fc 基于指定 ResearchRun 动态生成并原子保存 Protocol/TestCases/Rubric，100% 权重与最新版本锁定由数据库保护；真实生成、锁定、刷新持久化、typecheck、测试与 build 均通过。
M6 ✅ 4e3a756 从最新 locked Protocol 幂等生成 Product × TestCase 矩阵，支持校验后的 image/PDF/text 私有 Storage 上传、SHA-256、执行元数据与完整矩阵确认；正式 12/12 TestRuns 及隔离 Artifact E2E 均通过。
M7 ✅ a52045a 基于完整 Artifact 矩阵一次性生成稳定随机 Blind Samples/Mapping，映射仅由 service role 保存且不进入页面投影；未完成测试被阻止，Blind Leakage E2E、51 项测试、typecheck 与 build 均通过。
M8 ✅ 57953ba 按 TestCase 全样本模态统一路由 DeepSeek 文本 Judge 或 Z.AI 多模态 Judge，先持久化 Provider/Model/Prompt/Signature 再调用模型；完整 Sample × Rubric 评分矩阵、AI Score 不可变、Protocol 身份保护、真实 E2E、61 项测试、typecheck 与 build 均通过。
M9 ✅ 49a8497 将人工复核迁移到 ReviewSession 与 append-only HumanReviewEvent，Final Score 由有效 override 或 AI Score 单一推导；改单、恢复、0 项调整锁定、锁后禁改、Blind Reveal、真实 E2E、68 项测试、typecheck 与 build 均通过。
M10 ✅ 10639e6 基于 revealed ReviewSession 与 locked Final Score 构建签名绑定输入，数据库确定排名与冠军，DeepSeek 仅生成解释性分析；真实 E2E、76 项测试、typecheck 与 build 均通过。
M11 ✅ 4edacec Report 绑定当前有效 ResultAnalysis，以 GLM 组织 Research、Protocol、Final Score 与分析结论，并在完成前建立真实 Raw Artifact 证据关联；真实 E2E、84 项测试、typecheck 与 build 均通过。
M12 ✅ 8af8e4d 以 DeepSeek 动态发现社区选题、GLM 生成可编辑社区帖子，并仅从当前 Protocol 的真实图片 TestArtifact 推荐和持久化证据；选题与帖子路由血缘、重试版本、真实 E2E、typecheck、测试、build 与数据库 lint 均通过。
M13 ✅ 85cc7a4 真实项目 routes、Application Services、Repositories 与全局导航已移除 Mock import 和 demo fallback；Sidebar 改读真实最近项目，工作流链接绑定当前 projectId，95 项测试、typecheck、build 与浏览器检查均通过。
M14 ✅ 5f37200 完整真实跑通 Create → Research → Protocol → Lock → TestRun/Artifact → Blind Judge → Human Review → Lock/Reveal → Results → Report → Publish；保留 Judge/Report 失败审计，修复报告 ID 文案校验冲突与 Judge 并发配额问题，9 类异常路径、105 项测试、typecheck、build、浏览器交互及真实数据链验证均通过。
M15 ✅ 6537a7d 完成 Code、Database、Security、Product Rule 与 Mock 五项最终审查；修复社区选题/帖子暴露内部 Schema 字段名的 P1，新增可重复 Secret/Client/Provider/Mock 边界审计。远端 DB lint 零错误、16 个 migration 对齐、105 项测试、typecheck、build 与浏览器检查均通过，未发现剩余 P0/P1。
Single Product Flow ✅ 当前分支支持 1 产品从 Research、体验 Protocol、Test/Artifact、Blind Judge、Human Review 到 Results、Report、Publish 的完整语义分流，并保留多产品横评与多模态证据链。
Evidence-first Article Flow ✅ 支持直接粘贴并逐字保存文本证据，TXT/MD/JSON/CSV 统一走文本 Judge；Results 展示 Case 级 Judge/人工复核素材，Publish 可在无截图时基于真实证据生成文章，同时保留图片、多产品与 Blind 回归。
Community Content North Star ✅ Single Product Publish 改为 CommunityPostSource → 5–8 Community Angles → Community Post；Report 不再作为文章母稿，新增 Experience / Opinion 真实性边界、short/medium/long、多帖复用与观点密度门禁。
Watcha Community Style QA ✅ Publish 采用观猹式选题/写作 System Prompt，新增 Forbidden Patterns、独立 Style Critic、单次自动 rewrite、最终复审和事实风险硬门禁。
Micro Moment Community Writing ✅ Publish 增加 Raw Evidence → Micro Finding → Human-readable Moment → Evidence-bound Angle → CommunityWritingPacket；DeepSeek 生文后执行 Evidence / Jargon / Style-Vagueness 三类 Critic、奶奶测试、Anti-Vagueness 与单次 Rewrite。
Cost-aware Community Writing ✅ 最终正文与 Rewrite 切换至 non-thinking `deepseek-v4-flash`，medium 输出上限由 8000 降至 1800 tokens；Critic 继续拦截 Flash 新增的无证据观点，不允许默认 Pro fallback。
Safe Community Style Policy ✅ 2026-09-07 固化项目自有语言规则；复用 Flash 做一次窄职责改写，不依赖第三方 Skill/runtime。新增数字/单位/算式/经历确定性门禁、对照原稿的六项 Meaning Preservation、审计记录与只回退到合格原稿的选择逻辑。十条现有审计基线句子纳入回归；Publish 41/41、全仓 168/168、typecheck、build、git diff --check 通过。本轮未调用真实生文 API、未修改生产文章或数据库；保留已有混合工作区，未把此前改动混入新 commit。
Incremental Publish Regression ✅ 2026-09-08 仅复用现有豆包/智谱项目六份原文重新加工 Publish；新增原文引用校验、作者经历边界、观点绑定、缺失断言拦截和写入响应丢失恢复。真实 Flash 正文与一次 Safe Rewrite 生成 v29，Pro high 复审通过，人工对照原文及浏览器确认最新帖子可见。上游行与六份文件 SHA-256、旧 v1–v4 均未改变，无新项目或 migration。Publish 52/52、全仓 179/179、typecheck、build、diff check 通过。v21–v24 自动误放行已在交付审计排除，未覆盖历史；候选选题仍需人工语义审核，不宣称全部候选通过。保留混合工作区，未打包提交此前未归属改动。


### Publish 内容机制调整（2026-09-09）

2026-09-09 Publish 后续调整：在隔离副本实现选材分级、精简写作输入、合格即停、单次语言改写及失败调用保存。类型检查、60 项 Publish 回归与 build 已通过。用户明确授权后已运行真实验证。非思考与思考选材均发现错误；单任务选材也需要事实复核。保留全部新版本和调用记录，v40–v45 均未通过内容验收；浏览器确认 failed 状态，最新完成文章仍为 v39。最终 typecheck、60 项 Publish tests、16 项路由/韧性测试、build、diff --check 通过，原始任务、回答及历史文章比对未变。下一步需解决选题解释与审稿判断不可靠的问题，不宣称模块已经验收完成。

2026-09-10 Publish 继续：新审稿 v9 取消重叠分数，问题引文须属于当前文章；正文 v7 不复写选题元数据。新增 v46 failed、v47/v48 ready；v48 为自动 Flash 短观察，非人工正文。旧正确稿可通过，错误遗漏夹具被拒绝；咖啡馆审稿截断，真实内容质量验收尚未完成。完整对照和用量保存在工作区 outputs/publish-implementation/审稿与正文对照-20260910.md。

2026-09-11 自查修正：Publish 写作与审稿共享原任务和完整存档，去掉重复观察摘要；节选标记保留，补充证据不丢失。修复自定义角度将长引文拼进600字摘要导致失败，并把材料预校验前移到创建版本之前。65项Publish测试、typecheck、build、diff检查通过；新v50沿用旧选题仍偏格式检查，v51使用用户认可的人工角度、Flash自动正文。电动车隔离选材仍有算式解释及推断错误，候选未发布，整体内容质量未验收完成。原始材料和上游不变。

2026-09-18 产品库清理：按用户要求移除 /products 的 demo 产品卡片与无效搜索入口，显示简洁空状态；不删除真实产品实体、项目或历史证据。typecheck、3 项 Mock 边界测试、build、git diff --check 通过，浏览器确认“暂无产品”。秘塔 Research v7 复用，Protocol v1 已生成；用户选择仅保留学术引用核验任务，后续等待真实手动实测证据。保持已有混合工作区，不将无关改动打包提交。

2026-09-20 秘塔真实测评继续：单学术引用核验任务已完成手动证据上传、Judge、append-only复核、Results与Report。智谱恢复版实际生成Publish v1–v5，保留失败、各次输入/输出/用量于工作区 outputs/metaso-review-20260920；根据实测只补完整正文校验、证据边界和取消固定第一人称模板，未重启观猹/短观察/Critic。v5在网站显示正常，891字，主要事实限定为HaluEval发表状态遗漏；仍有范围说明重复，上游Report/候选角度有过度概括，不能宣称内容全面验收。审计同时确认当前正文输入含Judge证据摘录而非完整文本Artifact，后续应优先补原文证据而非继续风格改写。Publish10/10、路由及Provider韧性16/16、typecheck、build、diff检查通过。原始记录和既有混合工作区保留，未提交。

Quick Findings Flow ✅ 2026-09-20 将社区主流程调整为 Research → 测试计划 → Test/Artifact → AI Findings → 人工确认 → Publish；新增 experience_findings 与 Findings-bound PublishPack，Blind Judge / Human Review / Result Analysis / Report 保留为显式专业模式，不再阻塞社区内容。Quick Publish 的最终事实核对重新读取完整原始 Artifact；不删除或覆盖既有专业测评历史。

2026-09-21 Community Experience Expression：在 chatgpt/content-flow-refactor 延续 Quick Findings Publish，新增内容分类规划、开头/结尾字段、真实体验风格运行时校验、默认关闭的个人评分及 Findings 来源校验；复用 screenshotRecommendations，以原段落锚点在预览/复制时生成 p1/p2，删图/换图/编辑不继承错误引用。保留原始 Artifact 最终核对、专业测评与历史 JSON 兼容，无 migration。新增 golden/style/formatter 回归及实际 Publish Service 的隔离集成测试，验证无 Judge/Report 依赖与失败不保存 ready。TypeScript 仅排除工作区原有未跟踪 dormant-community-pipeline 归档，严格检查实际源码。该轮验证不代表真实在线模型语言质量或完整外部 DB/Storage E2E 已验收。
验证结果：npm test 155/155、npm run typecheck、npm run build、git diff --check 全部通过。真实供应商在线生成、浏览器视觉验证和外部 DB/Storage E2E 本轮未运行；不能将本轮标为全部产品 Acceptance Criteria 完成。

2026-09-21 Evidence-backed Editorial Follow-up：按用户提供的体验清单、场景深度和多维度参考稿，新增三种一键写法，独立策划→正文→原始证据/文章质量核对。章节绑定 Findings/Artifact，使用收益从确认 impact 引用；无效证据、重复章节、未知方法依据及缺少具体观察均会失败。专业来源投影为不含数字评分的观察，专业功能不删除。保存各阶段 route/signature/usage；旧 JSON 兼容，无 migration。修复同一 pack 从 draft 变 ready 时编辑器状态未重置的问题。

验证：162 项测试通过，typecheck、build、diff check 通过。包含策划失败不执行写作、最终质量失败不写 ready、两种深度稿结构和真实模型发现的虚构调色/补拍收益负例。真实模型探测曾出现一次格式合格但内容越界的样稿，人工审查后拒绝并收紧规则；随后场景稿与多维稿核对阶段连续网络失败，未保存合格最终稿。浏览器只读确认生产构建首页正常，当前真实项目尚无可用 Publish 数据，未补造用户实验。线上语言质量及完整 DB/Storage/浏览器生成 E2E 不标为全部验收通过。
