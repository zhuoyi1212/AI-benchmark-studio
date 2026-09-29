# 快速模式交付检查 — 2026-09-30

本增量实现后台快速模式，分支 `codex/quick-backend-workflow`，提交主题 `feat: run quick evaluation and publishing in durable backend jobs`。M0–M15 是既有工作，本次未重写历史 Milestone。

## 实现

统一工作台提供方案采用、实测上传、发现确认和文章编辑。后台持久化队列接管各 AI 阶段，异常评分仍停留人工复核。文章先就绪，专业分析/报告随后执行；独立失败不会挡住文章。

主要架构为 Action → Workflow Service → Repository/DB Queue → Worker → 既有 Application Service → AI Task Service → Router → Adapter。新增 `quick_jobs`、`quick_job_steps`；lease 与事务控制并发，输入签名绑定成功检查点，业务表仍是唯一结果源。两份增量 migration 已应用当前 Supabase 项目，无破坏性结构修改。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 单元及回归测试 | 226/226 通过，含异常评分停留、有限重试、分段写作、上传批次和检查点复用 |
| TypeScript / Production build | 通过 |
| git diff --check | 通过 |
| DB contract | 在事务中运行后回滚：去重、领取互斥、过期回收、旧 lease 拒绝、不可覆盖检查点、原子后继、普通角色拒绝访问、归档后不领取 |
| 无页面后台 E2E | `mulkqfjb-6d39a2c1` 正常闭环；Research 至 Report 八种任务各一条 |
| 重启与失败恢复 E2E | `mun0frxp-09f9ce80`：润色注入失败，重启服务后重试，初稿调用一次，润色两次（含失败），事实核对一次，文章 v2 与报告完成 |
| 完整 DB/Storage E2E | `mun0fw24-796c1179`：1 TestRun、1 原始图片、4 JudgeScore，包含比较/不可比回归，3/3 项目归档 |
| 真实供应商 E2E | `mun0mov1-4c44e06f`：隔离合成文本证据，Findings、选题、初稿、润色、事实核对各成功调用一次；DB/Storage/七个原有页面及比较回归通过，3/3 项目归档 |
| 浏览器 | 快速文章页、精简布局、刷新恢复、复制全文成功，无控制台错误 |
| Blind / Human Review | 沿用匿名输入、Lock → Reveal 与 append-only 纠偏；AI Score 不可修改。队列载荷与中间稿不下发浏览器 |
| Final Score / Analysis | 原有来源不变，分析与报告后置，包含完整流程回归 |
| Storage | 原始文件上传与 metadata 追踪沿用原机制；不生成证据图片 |
| Mock / Secrets | 生产真实流程无 Mock fallback，无客户端 Provider/Service Role；模拟 Provider 只存在于隔离测试 |

真实供应商首次验证因初稿漏字段、avoidPhrases 超长而明确失败，未保存 ready。补充完整 JSON 和最多 12 项提示、递增 Prompt 版本后重新验证通过；没有删除测试或放宽 Schema。一次开发配置热重启中断的 E2E fixture 也已单独归档。

Supabase Security Advisor 返回 INFO 级 “RLS Enabled No Policy”。这是队列及 Blind 内部表不开放客户端策略的预期结果，普通角色权限另由 contract 验证；未新增客户端读权限。[官方说明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。

## 限制与验收范围

- 尚未推送或部署线上。常驻 Node 自动运行；Vercel 等 Serverless 需配置 `CRON_SECRET` 和外部调度，线上关闭页面后持续执行仍待部署验收。
- 进程死亡后最多 15 分钟回收租约；主机休眠期间不运行。供应商成功而检查点尚未落库时可能重复请求/计费。
- 本次真实 AI 验证用隔离合成素材，不代表所有真实产品素材的语言质量都通过人工验收。供应商耗时仍受外部服务影响。
- 未在空数据库重新 reset 全量 migration；现有环境增量迁移和 DB contract 已通过。
- 完成本增量本地/Node 范围验收，不宣称整个历史产品的全部 Acceptance Criteria 已重新认证。部署步骤与操作说明见 [后台快速模式](quick-workflow.md)。
