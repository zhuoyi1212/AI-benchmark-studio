<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Benchmark Studio — Codex Working Rules

## 1. 规范与优先级

开始开发前必须完整阅读：

1. `00_START_HERE.md`
2. `PRODUCT_SPEC.md`
3. `ARCHITECTURE.md`
4. `PLAN.md`
5. `ACCEPTANCE_CRITERIA.md`
6. `DECISIONS.md`
7. 本文件

文件冲突时遵循 `00_START_HERE.md` 定义的优先级。产品行为以 `PRODUCT_SPEC.md` 和 `DECISIONS.md` 为准；本文件补充工程执行纪律，不覆盖产品原则或上方 Next.js 项目特定规则。

## 2. Git 与 Milestone

开始前检查：

```bash
git status
git branch --show-current
git log -5 --oneline
```

- 按 `PLAN.md` 的 M0–M15 顺序执行，不跳过未完成 Milestone。
- Goal 工作使用 `feature/real-benchmark-mvp`，不长期直接开发在 `main`。
- 禁止 force push、删除已有远程分支、未经检查合并 `main`，或把未验证的大改直接推入 `main`。
- 一个完整 Milestone 通常对应一个语义清晰的 commit；避免 `update`、`changes`、`fix stuff` 等含糊信息。

每个 Milestone 必须完成：

1. 阅读需求和 Acceptance Criteria。
2. 检查现有实现并设计最小必要改动。
3. 实现并 Self Review。
4. 检查 `git diff`，运行 `git diff --check`。
5. 运行 `npm run typecheck`、`npm run build` 和相关测试。
6. 主动检查并修复当前范围内全部 P0/P1。
7. 更新 `PLAN.md` Progress Log。
8. 创建清晰 commit，并自动继续下一个 Milestone。

不得通过删除测试、关闭检查或降低要求来让 Milestone 通过。

## 3. Secret 与 TypeScript

永远禁止提交：

- `.env`、`.env.local`
- 智谱 / DeepSeek API Key
- Supabase Service Role Key
- Access Token、Password 或其他 Secret

`.env.example` 只能包含变量名和非敏感说明。

禁止通过大量 `any`、`@ts-ignore`、`@ts-nocheck`、关闭 strict 或删除类型检查掩盖问题。第三方 SDK 类型确有问题时，只能使用最小、明确、可解释的边界处理。

## 4. 数据与 Mock 边界

长期数据链保持：

`Page → Service → Repository/API → DB/AI`

UI 组件不得拼 SQL、调用任何 AI Provider、使用 Service Role、读取 Blind Mapping 或写死业务结论。

真实 Project 主流程不得 silent fallback 到 Mock。真实调用失败必须进入明确的 failed 状态、显示错误并支持 retry；Mock 仅用于 demo fixture、test fixture 或 development seed。

## 5. AI 与 Blind Security

所有 AI Provider 调用必须：

- server-side
- 通过 AI Task Service → Router → Provider Adapter
- 使用 structured output
- 有 schema / runtime validation
- 有 error handling
- 记录 provider、model、prompt_version 和必要的输入快照或签名
- 不保存 provider-specific chain-of-thought
- 不跨厂商 silent fallback；切换 Provider 必须创建新的 AI Run

第一版 Provider 为智谱与 DeepSeek。任务映射集中维护，页面、Domain 和 Application Service 禁止硬编码 `glm-*`、`deepseek-*` 或调用 `callGlm` / `callDeepSeek`。禁止使用 `deepseek-chat`、`deepseek-reasoner` 旧 alias。

任何涉及 Blind 的改动都必须验证：Reveal 前浏览器不能通过 Network、API、客户端 DB 查询或页面源码获得真实 product identity。若能获得，视为 P0。

Judge 输入不得包含真实产品身份。同一 TestCase 的全部 Blind Samples 必须共享一个 JudgeCaseRun 的 provider/model/promptVersion；存在图片、PDF 或混合 Artifact 时不得路由到 text-only Judge。人工不得修改 `judge_scores.ai_score`、AI 原始 reason 或 evidence；Human Review 只能写独立、append-only event。

## 6. Database 与 Storage

Migration 必须：

- 能从空数据库按顺序执行
- 有合理 PK、FK、unique、check、index 和 delete strategy
- 支持 Protocol Versioning、Human Review Audit、Final Score Source of Truth 和 Artifact traceability
- 不无脑 cascade，不覆盖应保留的历史
- 同步更新 `docs/database-schema.md`

文件 binary 不进入 Postgres。Artifact 上传必须保持 Storage 与 DB 可追踪；DB/Storage 半成功时需要明确状态或补偿，不得生成假成功记录。

## 7. 状态与失败处理

异步业务必须考虑 `pending → running → completed / failed → retry`，不得无限 loading。

每轮 Self Review 至少检查：

- Data：是否存在第二 source of truth 或数据链断裂？
- State：刷新是否丢失？
- Security：客户端是否获得不应读取的数据？
- History：是否覆盖了应保留的实验历史？
- AI：动态内容是否被重新硬编码？
- Failure：失败后的用户状态和数据状态是否明确？

## 8. 必须暂停的操作

以下情况必须暂停询问用户：

- reset production database
- 删除生产数据或 drop 核心表
- 破坏性 migration
- 重写历史实验记录
- 缺少必须的外部服务权限或 Secret
- 必须改变既定核心产品规则

普通 SQL、索引、文件拆分、类型命名、组件拆分、测试组织和一般错误修复由 Codex 自行判断。

不得自行改变：Blind 顺序、Protocol Lock、1–3 products、人工手动执行测试、AI Score immutable、Human Review 纠偏定位、append-only audit，或禁止 AI 生成证据图片等既定产品规则。

## 9. Goal Final Review

完成 Goal 前必须重新审查：

- Product workflow
- Database integrity
- Protocol versioning
- Blind security
- AI input/output
- Human Review audit
- Final Score consistency
- Result Analysis freshness
- Artifact traceability
- Mock fallback
- Secrets
- Error states
- 全仓代码

全部 P0/P1 修复，`git diff --check`、`npm run typecheck`、`npm run build`、相关测试和真实关键 E2E 全部通过后，才允许停止。

最终报告必须列出：完成的 Milestones 与 commits、主要架构、数据库表、AI Pipeline、Blind、Human Review、Storage、Mock 审计、E2E、typecheck、build、已知限制、当前 branch/commit，以及是否满足全部 Acceptance Criteria。
