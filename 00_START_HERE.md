# AI Benchmark Studio — Codex Goal Mode 启动说明

## 核心材料

请按顺序阅读以下 6 份核心材料：

1. `PRODUCT_SPEC.md`
2. `ARCHITECTURE.md`
3. `PLAN.md`
4. `ACCEPTANCE_CRITERIA.md`
5. `DECISIONS.md`
6. `AGENTS.md`

如果文件之间出现冲突，优先级为：

`PRODUCT_SPEC.md` → `DECISIONS.md` → `ACCEPTANCE_CRITERIA.md` → `ARCHITECTURE.md` → `PLAN.md` → `AGENTS.md`

## 当前项目状态

当前已经完成：前端 Mock Prototype、动态数据类型拆分、Mock Service Layer、Protocol/Test Case/Rubric 动态结构、Blind Review、人工评分修正、Final Score、Results、Deep Report、Community Publish Pack、Review 状态持久化、Reveal 前访问保护、Final Score 改变后重新生成 Mock Result Analysis。

尚未真实完成：

- 新建项目输入持久化
- 真实 AI Research
- 真实 Protocol Generation
- Protocol Lock → Test 的最终数据链检查
- TestRun / Artifact 持久化
- Artifact → AI Judge
- 服务端 Blind Mapping 隔离
- 真实 AI Judge
- Human Review 数据库化
- 真实 Final Result Analysis / Report / Publish
- Supabase 主流程

不要继续完善 Mock 体验本身。下一阶段目标是把现有数据驱动前端逐步替换成真实数据库、真实文件证据和真实 AI 流程。

## Goal Mode 启动指令

```text
实现 PRODUCT_SPEC.md 定义的 AI Benchmark Studio 真实 MVP。

开始前完整阅读：
- 00_START_HERE.md
- PRODUCT_SPEC.md
- ARCHITECTURE.md
- PLAN.md
- ACCEPTANCE_CRITERIA.md
- DECISIONS.md
- AGENTS.md

严格按照 PLAN.md 的 Milestone 顺序持续工作。

每个 Milestone 必须：
实现
→ Self Review
→ git diff --check
→ npm run typecheck
→ npm run build
→ 运行相关测试
→ 修复该 Milestone 的全部 P0/P1
→ 创建清晰 commit
→ 更新 PLAN.md Progress Log
→ 自动继续下一个 Milestone

不要因为单个 Milestone 完成就停止。

只有满足 ACCEPTANCE_CRITERIA.md 中全部 MVP 验收条件后才允许停止。

只有以下情况可以暂停询问我：
1. 缺少必须的账号、Secret、Supabase 项目或外部服务权限。
2. 需要执行不可逆的数据删除、生产数据库重置或破坏性 migration。
3. 产品文档存在无法通过优先级规则解决的实质冲突。
4. 必须改变 DECISIONS.md 中已经确定的核心产品行为。
5. 外部 API/平台能力与产品要求根本冲突。
6. 同一个阻塞问题经过合理修复仍无法继续。

普通实现细节不要询问我，自行判断。

禁止：
- force push
- 提交 .env / API Key / Secret
- 用 any、@ts-ignore 或关闭 TypeScript 绕过问题
- 删除测试来让检查通过
- 用新的硬编码替代真实数据链
- AI/DB 失败时静默 fallback 到 Mock
- reveal 前把 blind mapping 发给普通客户端
- 覆盖 AI 原始评分
- 未经允许改变核心产品规则

最终停止前必须：
- 完成所有 Milestone
- git diff --check
- npm run typecheck
- npm run build
- 关键 E2E
- 主流程 Mock 审计
- 数据库完整性 Review
- Blind 数据泄露 Review
- Human Review Audit Review
- Final Score / Result Analysis 一致性 Review
- 全仓 Code Review
- 修复所有 P0/P1

最后输出完整完成报告。
```

## 外部服务

后续 Codex 可能需要：Supabase 项目、Supabase URL/keys、OpenAI API Key、`.env.local`、Node/npm、GitHub 写权限。

任何 Secret 只放环境变量或安全本地配置，禁止写进 Markdown、源码、migration、README 或 commit。
