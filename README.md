# AI Benchmark Studio

AI 产品真实测评与内容生产工作台。核心目标是把测试计划、原始 Artifact、可核验 Findings 和最终社区内容连成一条可追溯链路。

## 主流程：快速测评

```text
Research
→ 测试计划
→ 真实 Test + Artifact
→ AI 提炼 Findings
→ 人工确认 / 修改 Findings
→ 内容策划
→ 风格生成
→ 原始 Artifact 事实核对
→ 社区内容
```

快速测评不要求先运行 AI Judge、Human Review、Final Score 或 Deep Report。

## 可选：专业测评

```text
真实 Test
→ Blind Judge
→ Human Review
→ Professional Result Analysis
→ Deep Report
```

专业评分能力继续保留，用于需要结构化分数、排名和深度报告的场景，但不会阻塞 Findings 和社区内容。

## 证据原则

- 第三方产品的真实输出必须由用户测试并保存为 Artifact。
- Findings 必须绑定真实 Product、TestCase 和 Artifact。
- 人工确认 Findings 是内容主线的编辑决策，不是“改 AI 分数”。
- Quick Publish 优先使用人工确认后的 Findings，并在最终事实核对时重新读取原始 Artifact。
- 评分和报告不能替代原始证据，也不能制造测试中不存在的体验。

## 技术栈

- Next.js 16 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Postgres + Storage
- 智谱 + DeepSeek

## 数据迁移

Quick Findings 需要应用最新 Supabase migration：

```text
20260920060000_quick_findings_flow.sql
```

该迁移新增 `experience_findings`，并让 `publish_packs` 可以二选一绑定 `findings_id` 或 `report_id`，不会删除已有 Report / Judge / Review 数据。

## 启动

```bash
npm install
npm run dev
```

## 检查

```bash
npm run typecheck
npm test
npm run build
```
