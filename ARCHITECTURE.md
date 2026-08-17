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
- Publish：publish_packs，绑定 report

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
| Community Post | 智谱 / `glm-5.2` |
| Screenshot Understanding | 智谱 / `glm-4.6v` |
| OCR preprocessing | 智谱 / `glm-ocr` |

路由只在集中 Config 中维护；页面、Domain 与数据库业务逻辑不得硬编码映射。第一版不做无脑跨厂商 failover，切换 Provider 必须创建新的 AI Run。

AI Pipeline：

`Research → Protocol Generation → Judge → Final Result Analysis → Report → Content Discovery → Community Post`

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

`ResultAnalysis → Report → PublishPack`

社区截图推荐最终引用真实 `test_artifact.id`。

## 17. Storage

建议 bucket：`benchmark-artifacts`

路径：

`projects/{projectId}/runs/{testRunId}/{artifactId}.{ext}`

不要依赖产品显示名作为路径主键。

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

某阶段真实化后，真实 Project 不允许 silent fallback 到 Mock。Demo fixture/test fixture 可以保留。
