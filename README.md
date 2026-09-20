# AI Benchmark Studio

AI 产品测评与内容生产工作台。核心目标是把真实测试、原始证据、测评发现和最终内容连成可追溯链路，而不是只生成一篇“像测评”的文章。

## 当前技术栈

- Next.js 16 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Postgres + Storage
- 智谱 + DeepSeek

## 当前工作流

```text
Research
→ 测试计划
→ 真实 Test + Artifact
→ 专业评分（当前保留，后续可降级为可选）
→ 测评发现
→ 深度报告（可选）
→ 社区内容：内容策划 → 风格生成 → 事实核对
```

## 当前状态

项目已接入真实 Supabase、文件存储和 AI Provider，并已有真实项目跑通 Research、Protocol、Test、Judge、Review、Results、Report 与 Publish。

当前重构方向：

- 社区内容优先围绕“真实发现”而不是“综合分”展开。
- 评分能力保留为专业模式能力，不再作为社区内容的中心。
- Publish 增加明确的写作风格、文章结构和事实核对阶段。
- 原始 Artifact 和历史版本继续保留，不用生成内容覆盖原始证据。

## 启动

```bash
npm install
npm run dev
```

## 检查

```bash
npm run typecheck
npm run build
```
