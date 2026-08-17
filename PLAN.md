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

Content Discovery 默认使用 `deepseek-v4-pro`；Community Post 默认使用 `glm-5.2`。截图优先复用 ContentIdea、Artifact metadata 与 Judge evidence，仅确需理解画面时使用 `glm-4.6v`。

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
