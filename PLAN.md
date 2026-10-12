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

2026-10-06 Publish 视频证据配图修复：最终审计继续用视频参与事实核验，但可选配图只接受真实图片 Artifact。服务端确定性过滤模型返回的非图片、重复、超额、段落不存在或正文无逐字对应的推荐并重排 order；无有效图片时保存空数组，不再让配图建议阻断已通过的正文。保留最终 assertPost 门禁和历史失败版本。295 项测试、typecheck、build 与 diff check 通过。

2026-09-21 Evidence-backed Editorial Follow-up：按用户提供的体验清单、场景深度和多维度参考稿，新增三种一键写法，独立策划→正文→原始证据/文章质量核对。章节绑定 Findings/Artifact，使用收益从确认 impact 引用；无效证据、重复章节、未知方法依据及缺少具体观察均会失败。专业来源投影为不含数字评分的观察，专业功能不删除。保存各阶段 route/signature/usage；旧 JSON 兼容，无 migration。修复同一 pack 从 draft 变 ready 时编辑器状态未重置的问题。

验证：162 项测试通过，typecheck、build、diff check 通过。包含策划失败不执行写作、最终质量失败不写 ready、两种深度稿结构和真实模型发现的虚构调色/补拍收益负例。真实模型探测曾出现一次格式合格但内容越界的样稿，人工审查后拒绝并收紧规则；随后场景稿与多维稿核对阶段连续网络失败，未保存合格最终稿。浏览器只读确认生产构建首页正常，当前真实项目尚无可用 Publish 数据，未补造用户实验。线上语言质量及完整 DB/Storage/浏览器生成 E2E 不标为全部验收通过。

2026-09-21 Dedicated Language Editor：按用户要求在初稿后、最终证据核对前加入 community_post_style_edit。仅允许标题/正文/互动句，数值与已有观察锚点确定性校验；最终核对独立比较六类含义，缺失/false/issues 均拒绝 ready。保留原稿、改稿、changed、六项结果及四阶段实际 route/signature/usage，清空旧截图段号并重新核对；错误显示具体阶段。复用 publish_packs.community_post JSON，无 migration，不修改历史实验、Blind、Human Review、Final Score 或 Storage。

验证：166/166 测试、typecheck、build、diff check 通过。覆盖编辑输出越权、数值漂移、六类含义漂移、缺失审查、编辑失败停止、旧三阶段记录兼容和仓储 RPC 参数。真实合成素材探测完成策划/初稿/润色，最终 glm-4.6v 两次 network 失败，明确失败且未保存 ready。对同一初稿再次单独验证细化的语言规则，删去了分类套壳和部分同义复述，仍有局部生硬句与重复限制；不宣称语言质量已验收。仅合成素材隔离探测，未运行真实 DB/Storage/浏览器生成 E2E。失败中间稿持久化、按阶段续跑与实际材料的人读验收仍待后续。

2026-09-21 Test Artifact Multi-upload & Clipboard：上传文件选择器启用 multiple，弹窗内支持原生剪贴板图片粘贴；新增可追加/移除的队列和逐项状态。文件与粘贴文本在同次保存中逐个提交现有 Server Action，避免批量请求突破 51 MB 限制，也避免原逻辑文件优先导致文本被忽略。成功项不再重传，失败项保留；普通文本粘贴不被拦截，上传期间禁止关闭与编辑队列。复用原有文件签名、大小、Protocol 状态、Storage/DB 补偿机制，无 migration，不改 Blind/Human Review/Final Score。

验证：169/169 测试、typecheck、build、diff check 通过。Chrome 隔离组件测试通过多选、追加、移除、原生 ⌘V 图片粘贴、原生文本粘贴、文件文本同时保存、部分失败及只重试失败项；保留截图于 /private/tmp/artifact-upload-browser/upload-dialog.png。浏览器测试使用真实组件与测试上传函数，未写生产实验/Storage，不等同于真实 DB 端到端验收。刷新不保留本地待上传队列；网络响应丢失时需要先核对已保存记录。

2026-09-21 LAN Test Page Interaction Fix：真实测试页“添加原始文件”和“复制 Prompt”无响应。复现发现从本机局域网 HTTP 地址访问时，Next dev 阻止客户端 JS 与 HMR，脚本请求返回 403。next.config 的 allowedDevOrigins 现在仅包含回环及本机网卡实际 IPv4 地址，无通配符，不放宽生产或 Server Action 来源校验。复制 Prompt 增加 Clipboard API 不可用/被拒绝时的兼容复制并恢复焦点；上传队列 ID 在非安全上下文改用 getRandomValues，修复 randomUUID 缺失造成的选文件/粘贴错误。

验证：174/174 测试、typecheck、build、diff check 通过。直接在真实项目的局域网 HTTP 测试页验证：脚本无 403/浏览器无异常、复制的完整 Prompt 与剪贴板读取一致、添加文件弹窗可打开、多选和原生 ⌘V 截图粘贴正常、冷刷新后交互正常。环境确认 isSecureContext=false、navigator.clipboard 不可用、crypto.randomUUID 不可用，兼容路径已实际执行。未提交测试文件或改动现有实验、Storage、Blind/Review/Final Score。保留本轮前已有的 next-env.d.ts 开发类型引用改动。

2026-09-21 Quick Findings Entry Fix：真实项目点击“提炼测评发现”报 JudgeExecutionError: Blind Samples 尚未建立。根因是 ResultsPage 把可选 getResultsWorkspace 与 Quick Findings 放在同一个无条件 Promise.all 中。改为先加载 Quick Findings 与导航状态，仅在专业 Review 已揭晓后读取专业结果；可选模块读取异常只在该模块显示错误与专业评分入口，不阻塞快速主流程，也不自动创建 Blind/Judge/Review。

验证：179/179 测试、typecheck、build、diff check 通过。新增真实页面函数的隔离运行测试，覆盖未启动专业流程不读取专业结果、揭晓后正常加载、可选读取失败不阻塞、主数据缺失重定向、完成 Findings 后显示人工确认编辑器。真实局域网项目从测试页点击入口已成功显示测评发现页面与生成按钮，无浏览器异常；未执行实际 AI 生成。自动审批拒绝真实生成验证，理由是向外部 AI 发送现有证据并持久化新 Findings 需要明确授权；待用户允许后继续，未冒充全链路验收完成。

2026-09-24 Private Deployment Gate：为公开 Vercel 部署增加整站 Basic Auth 门禁，统一覆盖页面、Route Handlers、Server Actions 与上传/AI 入口；生产环境未配置访问密码时 fail closed 返回 503，本地开发保持原行为。共享密码仅用于当前内部测试，正式多用户访问仍需 Supabase Auth；平台限流待产生部署与流量后按 log → preview → production 分阶段配置。203/203 测试、typecheck、build 与 diff check 通过；生产启动实测无配置返回 503、无凭据返回 401、正确凭据进入应用。

2026-09-26 Quick Evaluation & Research Reuse ✅ 新建项目默认快速模式，保留专业模式；产品库保存不可变调研快照并优先复用 90 天内最新版本，过期只提示不阻塞。快速模式自动生成单 Case 精简 Protocol，集中接受 PDF/Office/图片/文本等任意有效 Artifact，全部上传后提供 5 秒撤销并自动进入 Blind Judge；高置信度评分自动锁定/揭晓，只暂停异常项，AI Score 不可修改且人工调整继续使用 append-only Event。Findings 必须人工确认，专业分析/报告后台运行且不阻塞社区发布；快速 Publish 直接读取已确认 Findings 与原始 PDF 文本证据。远端 migration `20260925101034_quick_mode_research_reuse.sql` 已应用。真实浏览器以豆包完成 Research v3 复用 → 单 Case Protocol → PDF-only 上传 → Blind Judge 自动接受 → Findings 人工确认 → 878 字社区发布稿；212/212 测试、Mock 边界 3/3、typecheck、build、git diff --check 通过。真实供应商本次观测：复用后的项目适配约 31.8s、Protocol 约 17.9s、Judge 成功调用约 16.6s、Findings 约 34.8s、最终发布稿约 45s；外部模型仍是主要延迟来源，失败均有明确状态与重试，不做 Mock 静默回退。

2026-09-30 Backend Quick Workflow ✅ 用户授权的快速模式增量：新增统一 `/quick` 工作台和服务端持久化队列，替代浏览器倒计时/逐页 AI 触发。正常路径保留方案采用、人工实测上传和 Findings 确认；后台自动完成 Research → Protocol、Blind Judge → Findings、Discovery → Draft → Humanize → Evidence Check，专业 Analysis/Report 后置。新增 quick_jobs / quick_job_steps 与两份非破坏性 migrations，远端已应用；任务去重、项目串行、lease/续租、失败重试、成功阶段复用和进程重启恢复已验证。上传/创建/确认成功后的调度失败保留原结果并提供恢复入口。修复真实模型暴露的初稿缺字段/禁用词超长问题，Prompt 升至 v5，Schema 门槛未放宽。

验证：226/226 测试、typecheck、build、git diff --check；事务回滚 DB contract 覆盖重复投递、并发领取、过期回收、旧 lease 拒绝写入、检查点不可覆盖、原子后继、RLS 和归档停止领取。完整 DB/Storage E2E（含图片 Judge、比较/不可比回归）通过；后台无页面闭环及注入润色失败→服务重启→重试通过，初稿调用保持一次、最终 Publish v2。真实 AI 合成证据 E2E 最终通过：Findings/Discovery/Draft/Humanize/Evidence Check 各调用一次。浏览器核对精简文章页、刷新与复制正常，无控制台错误。测试项目均已归档。安全 Advisor 仅有预期的 RLS 无客户端 policy 信息项。

提交主题：feat: run quick evaluation and publishing in durable backend jobs。分支 codex/quick-backend-workflow。本次不重做既有 M0–M15；完成本增量本地/Node 验收。未发布线上，Serverless 外部调度及线上闭环待部署后验收，不能宣称全部产品 Acceptance Criteria 已重新全量认证。详情见 docs/quick-workflow-review.md。

2026-10-01 页面响应与报告排版：动态页面补齐 loading/error 边界，导航即时反馈，快速提交提示；Research/Protocol 独立查询并行，同次页面 GET 去重且不跨访客/刷新/写操作；上传完成检查改为轻量当前协议与证据读取，取消两次完整工作区构建。快速最近项目回到统一工作台。真实/demo 报告标题桌面 28px、手机 24px，目录与测试快照合为 208px 左栏，正文自动扩展；单产品复盘不再空出两个卡片列。真实报告两次热请求由 5.87s/4.38s 降至 2.92s/2.76s；同时观察到独立的间歇性数据库 DNS 故障，已恢复。详见 docs/report-response-review.md。

验证：235/235 测试、typecheck、build、diff check 通过；真实报告桌面/手机排版与导航 pending 已核对，无控制台异常。真实 DB/Storage 完整 E2E 重试通过，包含多模态 Judge 和比较/不可比回归，3/3 测试项目已归档。没有数据库结构、AI Prompt、历史报告或评分审计变更。当前分支 codex/quick-backend-workflow，未部署线上。

2026-10-02 Production deployment preparation：核对线上 aa7ab09 与本地已验证改动；新增 Supabase 私有调度器，在 Vercel Hobby 上每 30 秒按需唤醒后台队列，Vault/Production 环境保存独立密钥。新增 cron 身份验证测试和事务回滚 SQL contract，禁止匿名/用户/服务 API 调用调度函数，缺少配置 fail closed；HTTP 请求随测试事务回滚，无外发。236 项测试、build、typecheck 与 SQL contract 通过，Security Advisor 仅有既有的无客户端 policy 信息项。正式发布结果另见部署记录。

2026-10-02 Production deployed ✅ GitHub main 已快进至 6a9b24e（包含 c10c4f2 后台快速模式、8bfb933 响应/报告布局、288a238 工程规范）。Vercel production dpl_DH7d6pfWkPzdhrJH4DQyXkKVpSkK 为 READY，正式域名 https://ai-benchmark-studio-sand.vercel.app 已绑定。Supabase 每 30 秒按需调度已启用，独立密钥已配置到 Vercel Production 与 Vault，未进入 Git。线上页面未认证 401、调度未认证 401、调度正确认证 200；没有本机 Worker 和浏览器触发，隔离测试任务在约 28 秒内由线上 Worker 领取并按预设无效协议条件记录 failed（attempts=1），pg_net HTTP 200/无超时，未调用 AI。测试项目已软归档并保留审计，部署后 error/fatal 日志查询无结果。236 项测试、typecheck、build 与 SQL contract 在发布前通过；此次验证线上调度和访问保护，未重复完整真实供应商 E2E。浏览器工具无法打开受保护页面，线上视觉效果需用原有网站账号登录核对；本地桌面/手机视觉验收已在前次完成。模型延迟、300 秒函数上限和人工实测/确认边界仍适用。

2026-10-02 Quick workflow navigation regression：统一工作台此前只显示不可点击的进度文字，且隐藏嵌入页导航，导致已生成结果缺少回看入口。现复用持久化 WorkflowSteps，在后台运行/失败/文章完成时均可打开已解锁的调研、方案、实测和发现；详情页增加“返回快速工作台”，专业模式不显示该入口。修复发现详情页打开即自动重试生成的旧行为，恢复必须明确点击的重试。未改变后台任务、Blind 门槛、历史实验或评分。新增真实页面函数/导航组件回归覆盖运行、失败、未揭盲禁入、详情返回及打开失败发现不触发生成；241/241 测试、typecheck、build、diff check 通过。本地真实“懂你AI”项目已验证工作台 → 已锁定方案 → 返回工作台链接与即时导航反馈；不执行 AI 或写入实验数据。此次为导航增量验收，不重新认证全部产品 Acceptance Criteria。

2026-10-03 同产品多次测评第一阶段：新增产品详情和已有产品选择，统一归集调研版本、独立测评及报告/文章入口。产品 ID 明确关联，名称/官网冲突与同项目重复身份由服务端和数据库防护；创建项目不覆盖既有产品字段。产品库包含未调研产品，隐藏内部验证项目及旧基础设施夹具。后续方案复测、跨测评写作、历史重复产品合并未实施。

验证：新增 Service/Server Action/候选匹配/可见性回归；数据库 migration 已应用，service_role 下回滚事务验证通过（三次测评关联同一产品、原产品不变、冲突/无效/归档/重复拒绝、失败无半成品、执行权限），测试写入全部回滚。真实浏览器确认产品详情、调研历史、测评与内容入口、新建预选、更换产品、名称候选和重复选择禁用。未运行新一轮真实 AI/Storage 生成，也不宣称全产品 Acceptance Criteria 全部完成。

本阶段最终本地验证：249/249 tests、npm run build、npm run typecheck、git diff --check 全部通过；Supabase 安全检查无 WARNING/ERROR，现有 10 条 server-only 表 RLS 无客户端策略 INFO 保持不变。

2026-10-03 产品库清理与删除：按用户修正仅展示有自身有效原始测试结果的产品，同步已有产品候选与详情准入；从当前列表移除 17 个未测条目，保留懂你AI、豆包、deepseek、秘塔AI搜索。新增删除确认、即时 pending、错误重试及“已删除”恢复入口，复用 archived_at，无 migration 或物理删除。真实浏览器完成删除→列表移除→已删除→恢复→返回列表，验证产品已恢复；前后 TestRun/Artifact/ResearchSnapshot 行内容哈希一致。AI、Blind、Review、Final Score、Storage 及历史内容未改，不新增 Mock 回退。

最终验证：257/257 tests、npm run build、npm run typecheck、git diff --check 通过。浏览器读取真实数据库并完成产品删除/恢复闭环，测试状态已恢复；截图 /private/tmp/product-library-cleanup.jpg。此轮不执行 AI 生成或文件上传，不代表全项目 Acceptance Criteria 全部重新验收。

2026-10-03 测评记录重命名：项目卡片菜单新增重命名弹窗，校验非空、120 字符及空白规范化，提供 pending/失败重试。数据库新增 active 项目规范化名称唯一索引，同时保护新建、改名和并发写入；已删除记录释放名称。上线前检查无存量重名，不改写历史名称。保存只改 Project name，root layout revalidation 同步列表、侧栏和产品详情，不重生成历史报告/文章。

验证：261/261 tests 通过；service_role 回滚事务验证 duplicate INSERT/UPDATE、大小写/空白变体、原名保存、已删除名称复用、恢复冲突及其他字段不变。真实浏览器已验证重名提示、正常改名和跨页面/侧栏同步，临时验证名称随后恢复原名。数据库安全检查无 WARNING/ERROR，原有 10 条 server-only 表 RLS 无策略 INFO 保持不变。未触发 AI 或 Storage 写入；全产品 Acceptance Criteria 不在本轮重复验收。

本轮最终 npm run build、npm run typecheck、git diff --check 均通过；重名 UI 验证截图位于 /private/tmp/project-rename-duplicate.jpg。

2026-10-04 Final Content Policy v1：按用户要求新增 `docs/final-content-generation-standard.md`，统一快速/专业社区文章为材料与自动结构选择、证据关联提纲/初稿、原始证据内容核验、三字段语言编辑、只审不改的最终检查。取消固定分类标题、强制第一人称与最低200字/四段；保留短观察、空类别省略及测试范围独立。新增引用/重复选材/范围/分类前缀/数值/特定无依据收益和过程/图片映射门禁，六项保真或四项质量失败不得 ready。修复“15分钟”被旧评分正则误判、初稿核验声称修改但正文未变、仓储遗漏简报/润色状态的问题。Prompt 升版、四阶段 trace 与规范版本持久化，旧文章和上游实验不改；无 migration。

验证：283/283 tests、npm run build、npm run typecheck、git diff --check 通过。真实供应商合成短文跑通四阶段；早期视频样稿存在人工确认的越界，被排除为合格样稿并加入回归，收紧后多维样稿在最终审查明确失败而非保存 ready。短文样稿仍有轻微重复，模型审稿不能替代人工阅读，不宣称全部内容质量绝对合格。

真实数据库/Storage 后台恢复验证通过：隔离项目 96b13f81-2071-4116-a85b-b2a299b81196 注入语言阶段失败→重启→重试，初稿与内容核验各一次、润色两次（含注入失败）、最终检查一次，Publish v2 ready；已归档。只读持久化核验确认 contentBrief/languagePass/writingPlan/规范版本/四阶段 trace/审稿与实际正文一致。本验证 AI 响应使用隔离 Provider fixture；真实模型测试另以合成材料运行且不写生产文章。用户项目、Blind、Human Review、Final Score、原始文件及历史文章未修改；无 Mock fallback。分支 codex/quick-backend-workflow，本次为 Publish 增量，不重新认证全产品 Acceptance Criteria。

2026-10-05 标题刷新与任务可执行性：Publish 增加只换标题入口，生成 6–28 字、清晰且有真实钩子的标题，并用新的 immutable PublishPack 版本保存调用审计，正文与证据不重跑。Research 主动查找字符上限和文件上传能力；Protocol 以共同输入能力生成任务，并在模型输出后及 Lock 前确定性拦截超长 Prompt 和不受支持的附件。长材料只允许可验证的代表性抽样，无法保真时改选任务。远端 migration `20261004180420_refresh_publish_pack_title.sql` 已应用；事务回滚验证确认新版本、正文和 Artifact 复制正确且未留下测试数据。285/285 tests、typecheck、build、git diff check 与本地发布/方案页浏览器检查通过。

2026-10-05 Artifact 上传修复：定位到约 45 MB 视频此前经 Server Action 转发，虽然 Next 配置为 51 MB，Vercel Function 仍有独立 4.5 MB 请求体限制，请求会在业务函数前失败。改为服务端签发 Supabase 私有 Storage URL、浏览器直接 PUT，并显示真实进度与网络/5xx 有限重试；完成后服务端核验对象并原子记录，失败清理，确认响应丢失可幂等恢复。Supabase 签名 TUS 在当前托管项目与官方未解决问题一致返回 `Invalid Compact JWS`，因此不宣称断点续传。7 MiB 视频直传、对象大小/MIME 检查及删除已通过；286/286 tests、typecheck、build、git diff check 和 production dependency audit（0 vulnerabilities）通过。同步升级 Next.js 16.3.8；无 migration，不改变 Artifact 证据链、Blind 或评分规则。

2026-10-06 视频 Judge 修复：线上万彩AI的 46.9 MB MP4 已成功保存，但同一 TestRun 还保留一张截图，旧 Judge 请求同时发送 video file_url 与 image_url，智谱 `glm-4.6v` 三次返回 400/1214 mixed_media。新增确定性证据选择：按 Locked Protocol 期望类型，在全部 Blind Sample 共有的媒体族中选择一种，文本可同时发送；当前任务期望 video + text，因此实际评分只发送视频，不混入截图。原图继续作为原始证据保存，不会被模型引用。比较项目没有共同格式时在调用模型前明确失败。290/290 tests、typecheck、build、git diff check 通过；无 migration，不改变 Blind 顺序、AI Score 或 Review 审计。

2026-10-06 视频 Findings 修复：Judge 成功后，后台候选 Findings 仍沿用旧混合证据请求并再次触发智谱 400/1214。Findings 现与 Judge 共用 `single-media-family.v1`：按 Locked Protocol 与全部 TestRun 的共同格式选择一种二进制媒体，可附加文本；万彩AI任务分析原 MP4，辅助截图保留但不参与该次生成。PDF + 截图仍走逐页图片归一化，避免回退既有文档分析。输入签名和 PromptVersion 已升级，旧失败记录保留审计，重试创建新版本。291/291 tests、typecheck、build、git diff check 通过；无 migration。

2026-10-06 社区初稿核验恢复：万彩AI社区内容在视觉核验阶段收到 finishReason=stop 的完整响应，但内容不是合法 JSON；该路由旧配置 maxAttempts=1，导致通用结构修复没有执行。将同 Provider/Model 的上限恢复为两次，第一次 invalid JSON 或 Schema 失败时只做一次结构修复，不改变事实与质量门禁、不跨 Provider。相关路由测试、全量测试、typecheck、build 与 diff check 通过；无 migration。

2026-10-06 Provider JSON 规范化：万彩AI核验在有界重试后两次均以 stop 正常结束、输出 1301 tokens，但视觉模型持续返回非严格 JSON。新增独立解析边界，只接受严格 JSON 或完整 code fence，并有限修复原始控制字符和尾逗号；不从散文中提取对象、不补字段，之后仍执行完整 Schema 与内容门禁。新增直接解析回归测试；294/294 tests、typecheck、build 与 diff check 通过，无 migration。

2026-10-06 核验字段权限修复：JSON 规范化后确认真实失败项为核验模型改写 writingPlan.observationQuote，导致其不再逐字属于引用发现；第二次修复仍重复该问题。将内容核验契约缩小为三项文案和两项审核结果，服务端保留初稿已验证的 writingPlan、contentBrief、标签、截图及证据引用，再对合并结果执行原门禁。新增受保护字段 strict Schema 回归；295/295 tests、typecheck、build 与 diff check 通过，无 migration。

2026-10-08 公开只读工作台：移除普通页面读取的密码要求，不增加独立首页；访客直接浏览真实项目、产品、报告与文章。访客界面隐藏创建、重命名、删除、恢复和设置入口，已删除产品列表仅管理员可读。所有非 GET/HEAD、Server Actions、`/api`、创建项目、项目设置、全局设置与内部 Demo 继续要求管理员 Basic Auth；`/admin` 提供显式登录入口，页面显示只读状态。Proxy 覆盖访问标记并设置 no-store/Vary，生产密码缺失时写入 fail closed。297/297 tests、typecheck、build 与 diff check 通过，无 migration。

2026-10-08 历史页面加载优化：线上实测页面首包约 0.55–0.73 秒，但完整动态内容需 2–6 秒；请求级日志确认各步骤每次执行 19–37 个唯一 Supabase 请求，其中工作流导航状态单独读取 13 张表。新增只限 service role 的聚合 RPC，将导航状态收敛为一次数据库往返；浏览器 Router Cache 保留已访问的动态页面 120 秒，写操作继续通过既有 `revalidatePath` 立即失效。远端 migration 已应用，匿名/登录角色无执行权、service role 调用成功；本地复测各步骤唯一请求降至 5–24 次，健康请求下调研/方案/实测完成时间为 0.75–1.47 秒。299/299 tests、typecheck、build、diff check 通过。未缓存跨用户 HTML，未公开 Blind/评分内部数据；本机到 Supabase 仍有间歇性 TLS 重置，会产生独立的超时离群值。

2026-10-08 生产提示词清单：新增 `docs/ai-prompt-inventory.md`，覆盖 18 条生产 AI 路由、默认模型与 Prompt Version、全局结构化 JSON 指令、格式修复与重试指令、Research/Search/Comparability/Protocol/Judge/Findings/Analysis/Report，以及社区选题、初稿、证据核验、润色、最终审核和标题刷新。动态 User Prompt 以字段模板整理，明确 Search/OCR 当前只调用一次、OCR 没有自然语言 Prompt、测试夹具不计入生产清单。新增回归测试确保新增 Prompt Version 不会漏出清单。302/302 tests、typecheck、build 与 diff check 通过。

2026-10-09 提示词重构上下文：新增 `docs/ai-prompt-refactor-context.md`，为外部模型解释产品目标、单/多产品与快/专业模式、完整证据工作流、快速后台接力、14 个 AI 阶段职责、模型路由、不可改变的产品边界、当前内容质量问题、评测矩阵和分阶段重构顺序，并附可直接交给新模型的任务说明。新增文档契约测试，确保完整流程和核心边界不会从交接材料中遗漏。305/305 tests、typecheck、build 与 diff check 通过。

2026-10-09 Claude 提示词重构三文件包：保留 `docs/ai-prompt-inventory.md` 作为完整生产提示词，新增精简的 `docs/prompt-refactor-project-flow.md` 与 `docs/prompt-refactor-final-goal.md`。流程文件只说明产品如何从调研、人工实测和证据分析走到社区文章；目标文件邀请外部模型重新设计阶段和提示词，描述读者价值、内容质量与事实可信目标，不预设固定文章模板或塞入详细工程约束。新增三文件契约测试。307/307 tests、typecheck、build 与 diff check 通过。


2026-10-11 Claude 内容方案第一迭代：在不修改 Protocol/Blind/Judge/确认 Findings 的范围内重构 Publish。选题与 Story Brief 以读者问题和实际证据分量为起点，写作者使用原始细节；审核只读、问题可定位，有问题才定向修订，最终独立审核实际保存全文。保留 structured output 与现有集中模型配置；标题含产品名且可独立版本化刷新。视频改为 native video_url，新增一次视频细节读取后再用文本策划/核验，避免视觉模型同时承担复杂文章策划。成功阶段继续沿用 quick_job_steps，保存兼容 Brief、初审、原稿/最终稿与4–6阶段审计；无数据库 migration、不覆盖历史。

验证：319/319 tests、typecheck、build、diff check、全仓边界审计通过。真实 Supabase/Storage 完整 E2E Run mv3n6vs8-5085083a 通过，3个夹具项目已软删除；后台恢复 E2E Run mv3nd97o-3320e54c 通过，服务重启后已成功阶段不重复生成，修订失败后仅修订阶段重试，夹具归档。隔离 AI 响应不冒充真实产品结论。用户授权的万彩AI真实本地对照未取得可验收的新旧样稿对：原链结构失败，新版视频调用出现智谱1210媒体解析错误；本机HEAD验证同一47MB视频200且MIME正确。不能据此宣布文章质量提升或达到方案65%盲评目标；尚需供应商视频稳定性及多项目人工偏好评测。此轮为下游增量，不重新认证全部 Acceptance Criteria；上游读者问题、测试者记录、Findings拆分与换模型留待后续。

2026-10-11 线上发布补充：实现提交3f816d4；Vercel production dpl_GCrSxBbqEc6VVjuYbXVYTG4Vr1ji READY，已验证并promote。alias确认公开sand域名指向该版本；无凭据工作台200、创建入口401，真实浏览器确认4个历史项目与只读标记。没有重生成或覆盖历史文章；真实视频对照的供应商解析限制仍保留在验证记录。

2026-10-11 视频媒体证据架构：先诊断上传/Judge/Findings/Publish 调用链，确认上传成功后的 native MP4 请求受智谱 1210 阻断。新增可迁移 VideoPreprocessor，以 FFprobe 获取元数据、FFmpeg 抽最多12帧 JPEG、提取16kHz单声道音频和原生字幕；独立 Vision/ASR 接口汇总严格 MediaEvidence，评分与文章只消费可追溯证据。ASR 尚无配置，明确 unavailable，不猜测声音。无音轨/字幕、ASR失败、部分Vision失败继续；没有任何有效证据才拒绝评价。Router 拦截 native MP4；不跨厂商静默 fallback，不生成替代评分。

持久化私有预处理/成功转录/完整证据缓存，部分失败证据限10分钟窗口，显式retry使用独立epoch；quick_job_steps只保存结构化观察和独立失败记录，缓存中断仍可续跑。每次快速后台调用最多解码一个新视频、执行一个新AI阶段。新增 service-role-only 视频身份脱敏 RPC，原Artifact与不可变历史评分保留；视频Judge验证引用属于当前Sample。两个非破坏性migration已应用，无新核心表；第二个隔离保留E2E项目，避免生产Cron抢占本地夹具。新增部署postinstall二进制检查、Node tracing及管理员媒体runtime自检。

验证：343/343 tests通过（原319项保留，新增24项），覆盖真实FFmpeg音频/无音频/无字幕/原生字幕、ASR异常/超时、Vision部分/全部失败、损坏/超大/超长视频、二进制失败、缓存故障、多视频续跑与显式重试。lint为0 errors、26条现有warnings；最终typecheck、build、diff check通过。真实数据库事务回滚验证脱敏、权限及Artifact引用保留通过，安全检查无WARNING/ERROR，仅原有10条server-only RLS INFO。完整原流程E2E Run mv3y6lci-9cd4e427通过，3个夹具归档；视频E2E Run mv3zk0ps-2199f501通过8阶段，坏批次/坏帧后成功、nativeVideoRequests=0、Evaluator收到匿名文本、写作5阶段各一次，夹具归档。AI fixture仅验证流程，不冒充真实产品结论。

用户授权的真实万彩AI约46.9MB/103.817秒视频：源SHA验证、实际抽12帧，真实智谱返回5个有效观察，其余失败/超时保留warnings，未阻断证据产出；真实DeepSeek基于证据完成9项严格引用评价。输出只在本地保存，不覆盖原测评或文章；ASR不可用、稀疏采样项保持未知，不能据此宣称连续动画/配音或文章质量已验证。资源限制50MiB、下载120秒/解码60秒、音频最多300秒；长视频/大文件应迁独立工作端。详见docs/video-media-evidence.md。本轮为媒体架构增量，不重新认证全部M0–M15 Acceptance Criteria。

发布补充：实现提交dfbb519，生产部署dpl_ALuzC36YWunMcoMXsqapEYfDsggk已READY/promote，sand域名绑定确认。Linux x64 postinstall实际运行FFmpeg7.0.2及FFprobe N-66595，两者约159MB；远端Next构建和函数上传通过。无凭据/projects为200且只读，/projects/new与/api/media/runtime为401。管理员函数抽帧/提音自检仍待用户返回JSON：Vercel不允许读回现有Password Secret，本机无副本，未弱化认证或更改密码。最后重复测试发现临时目录全局快照与并发runtime夹具冲突，改为跟踪本测试真实创建的目录并断言ENOENT，保留清理验证；343/343再次通过，lint仍0 errors/26 warnings，全仓审计391文件/74真实数据边界通过。生产runtime代码与dfbb519一致，历史实验/评分/文章未重新生成。

2026-10-12 媒体自检500修复：用户已通过浏览器认证，但服务器在模块初始化时缺少 @ffprobe-installer/linux-x64/package.json，GET handler未执行。Vercel最近30分钟hnd1 Node24日志明确MODULE_NOT_FOUND；本地隔离旧Next trace也复现Darwin对应包缺元数据。补齐平台包manifest的tracing，将native包延迟加载至媒体操作的可捕获边界；不改变管理员认证或数据/模型流程。新增按Next实际nft清单重建隔离函数包并调用编译GET的构建门禁，检查真实抽帧与16kHz单声道音频，不依赖开发node_modules或凭据。新本地bundle返回ok/1帧/mono16kHz；344/344 tests、lint0errors/26既有warnings、typecheck、build、diff check通过。发布结果随后补充；不覆盖历史测评。

发布验收：实现7135c18，部署dpl_4RviTd5EgHXjJUEMvDATH249BA6f已READY并promote，公开sand alias绑定确认。Vercel Linux x64构建中的隔离GET实际验证ok/1帧/mono16kHz；用户Chrome原标签页重新加载同一正式URL，实际返回ok:true/linux/x64/Node24.21.0/decodedFrames1/audioHz16000/audioChannels1，hnd1函数日志记录probe/抽帧/提音，无此前MODULE_NOT_FOUND。截图/private/tmp/media-runtime-fixed.png。管理员验证已完成，没有取得/更改密码、弱化认证、调用AI或重生成历史结果。全仓审计392文件/74真实边界通过。本轮为部署打包修复，未重新验收全部M0–M15。

2026-10-12 历史读取优化：线上基线首次列表14.43秒、快速页6.64秒、报告8.33秒。确认目录函数被全局媒体tracing和本地poller编译图拖重；历史评分读完整调研链、多模块重复工作台构造、只看最新但下载全部版本。Vercel编译隔离本地poller，目录不包含视频二进制、约3MiB；真实Cron/本地worker和详情写操作仍保留媒体能力。锁定测试/Blind使用轻量当前协议上下文，身份guard仍先于Sample；页面render内工作台复用，失败重试、Actions/worker/不同访客均不共享缓存。最新文章/报告/分析仅取倒序第一条，历史默认读取及Final Score签名不变。

验证：350/350 tests、lint0errors/26既有warnings，最终typecheck/生产模式build/diff check通过。完整DB/Storage E2E Run mv4oky0b-c1537eb2通过，40个隔离模型请求，3夹具软删除；首次E2E在创建任何项目之前遭本机TLS重置，重试通过。报告只读请求27→22，健康连接样本4.37→2.34秒，响应80,273→58,908 bytes；文章版本响应45,763→18,310 bytes，TLS重置样本不冒充速度效果。详见docs/history-loading-performance.md；无migration，不改历史或AI/评分规则，增量验收不代表全M0–M15重认证。生产发布测量随后补充。

发布复测：d16fc33部署dpl_HwQ7hHQrWbM7Uj2Jqo1RWdXMBnLZ已READY/promote，sand alias确认。Linux目录3MiB/媒体自检通过，发布前工作台200且只读，首次完整HTML3.79秒。正式域名第一轮200：列表2.87秒、调研3.25秒、快速6.16秒、报告6.56秒、文章4.49秒；原4页标题一致。目录明显改善、详情仅部分改善，不宣称即点即开或每页都变快。第二轮在TLS握手前SSL_ERROR_SYSCALL/HTTP000约5秒失败，不作为后台读取速度样本；需保留网络波动限制。全仓审计395文件/74真实边界通过；历史评分、文章、Protocol与原始Artifact未改。

2026-10-12 标题概括测评内容：按用户要求共享标题策略，优先产品+测试用途/场景+有依据的主要结果，不强制钩子/反差，不用局部问题替代主线。选题/Brief/初稿/定向修订/初审与最终复核/独立刷新均接入，六条Prompt升版，模型不变。标题刷新移除历史选题与Brief输入，旧标题仅作avoidTitles；单次请求先返回用途/结果事实摘要再写标题，只保存既有标题审计，正文/标签/证据不重跑，immutable新版本RPC不变。提示词清单与最终规范同步，旧文章不批量改写，无migration。

验证：354/354 tests（保留原350，新增4项）通过，覆盖标题问题定向修订保持正文、旧摩擦角度不进入刷新输入、名称/重复/无依据数字拒绝、文档与实际提示词一致；lint0errors/26既有warnings、最终build（含隔离媒体bundle自检）/typecheck/diff check通过。完整E2E Run mv4yi8kc-0db8fe72通过，40个隔离模型请求，3夹具软删除；首次在创建任何夹具前数据库fetch失败，重试通过。8次现有DeepSeek标题调用只用两段合成文本且结果仅本地：初版仍偏旧摩擦，改为已核验正文主导与同次事实摘要后，输出能交代用途和主要结果，核心导出失败不被掩盖；其中正面样本仍带局部调整作为次要短句，语义生成不是确定性保证，不能据此保证每次标题理想。无用户证据外发，无历史标题/正文改写。本次为标题增量，不重新认证全部M0–M15；发布结果随后补充。

标题发布验收：实现5e4d94a部署dpl_Bk3WiaXFs9R891ruNWtcWsAPw9me已READY/promote，sand公开alias绑定确认。Vercel Linux build与隔离媒体自检通过，目录仍约3MiB；待发布/projects200且只读，正式域名/projects200/完整HTML2.33秒且只读。首次部署上传后fetch失败，重试成功；未改密码、历史文章或原始证据。全仓审计397文件/74真实数据边界通过。新生成和管理员“换标题”使用新规则；历史标题保留至用户主动刷新。

2026-10-12 文章重生成和人工保存：快速/专业统一编辑器新增“重新生成文章”“保存修改”。后台复用publish队列与完整策划/初稿/只读审核/按需修订/最终核验；同事务创建draft和固定packId任务，response后唤醒一次、Cron/本地worker续跑，生成中/失败显示上一版，失败新版本重试。仅显式文章重生成扩展专业项目worker，其余任务quick-only与E2E隔离保持；不重测产品、不改评分/Findings、不额外生成报告。保存标题/正文/标签/互动句/真实截图顺序，创建immutable ready新版本并记录manualEdit/aiReviewed=false，下次请求读回；不调用AI、不把旧核验当作新文案的核验。过期版本拒绝、脏编辑先保存、处理中锁定编辑；图片失效锚点清空，段落按当前正文重定位。新Actions显式管理员检查，RPC仅service_role。

验证：364/364 tests通过（此前354保留，新增10项），包括服务保存/冲突/图片来源/无假成功、worker固定版本续跑及明确失败、管理员与公开只读SSR、两种编辑视图的保存/重生成入口、修改后的证据段落与删除锚点。lint0errors/26既有warnings；最终build（含隔离媒体bundle）/typecheck/diff check通过。非破坏性migration发布前事务回滚验证保存读回、旧稿不可变、过期冲突、原子任务及RPC权限；随后已应用，无新表/数据回写。归档E2E夹具的隔离回滚验证professional regeneration可claim，原项目/归档状态未改；安全advisors无WARN/ERROR，保留server-only表10条RLS INFO。

完整DB/Storage/页面/worker E2E Run mv50h5fb-8fc58043通过，45个隔离模型请求，每篇各一次初稿/审核/修订/最终核验，3夹具软删除；保存后新HTTP请求读到修改、旧稿正文原样、后台重生成经过5阶段且不继承人工编辑核验标识。首次应用流程已200通过但runner旧单稿调用计数未更新；改为精确2篇检查后遇到两轮网络fetch中断，其中一轮未创建夹具，另一轮协议页面读取与清理断连，保留日志并用限制E2E前缀的归档脚本清理自建夹具。最终完整重跑通过；不是降低验证或把模拟输出当真实产品效果。无用户历史改写/真实模型外发。本轮增量不重认证全M0–M15，发布验收随后补充。

文章编辑发布验收：实现0b00501部署dpl_EgaYgHx9gdexYmUXTSiufGyBBDC7已READY/promote，sand公开alias绑定确认。Vercel Linux构建及隔离媒体自检通过，目录仍约3MiB。待发布与正式域名真实历史文章均返回编辑器且只读，公开页面不显示保存/重生成按钮；正式GET为200（完整HTML5.93秒），匿名POST为401。全仓审计399文件/74真实数据边界通过。未更改管理员密码、覆盖历史文章或重新调用真实测评模型。
