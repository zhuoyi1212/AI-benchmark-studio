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

## 社区真实体验表达

Publish 支持按已确认 Findings 的好用 / 一般 / 难用分类组织文章，空类别不补写。内容规划包含开头结论与结尾感受，最终原始 Artifact 核对后还会校验语言与证据映射。

可选个人体验评分默认关闭，支持 5 / 10 分制；仅保存于帖子 `editorialPlan.personalRating`，不会写入专业评分。评分证据不足时省略。

发布预览和复制全文会按当前选图顺序生成 p1/p2 引用。删图、重排会重新编号；换图不继承旧图的证据关系，修改对应段落后引用失效。正文及选图仍为本地编辑，刷新恢复已保存版本。无新增数据库迁移。

### 按文章目标选择写法

- **体验清单**：第一人称说清功能好坏，适合日常使用分享。
- **场景深度测评**：围绕一个真实任务展开，连接案例、结果与使用建议。
- **多维度测评**：按证据支持的维度展开，数量不限于七个，不输出专业评分。

Publish 中点击写法即可同步风格、结构和篇幅，也可展开“文章思路”查看章节。生成分为独立策划、写作、最终核对，章节证据及文章质量不合格会明确失败。深度稿可以没有互动问题。

规划与边界见 [community-editorial-plan](docs/community-editorial-plan.md)。本地可执行 `node --env-file=.env.local scripts/verify-community-editorial.mjs --live` 验证场景稿，加 `--dimensions` 验证多维稿；会调用真实 AI 并产生费用，使用虚构文本测试夹具，只输出本地文件，不写数据库。这些样稿不能作为真实产品测评发布。
