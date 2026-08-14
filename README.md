# AI Benchmark Studio

AI 产品标准化测评工作台，用于建立可复现的 Test Protocol、执行盲评与人工复核，并沉淀结果、深度报告和社区发布包。

## 当前技术栈

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

## 当前工作流

```text
Research
→ Protocol
→ Test
→ Blind Judge
→ Human Review
→ Results
→ Report
→ Publish
```

## 当前状态

当前为前端 Mock Prototype，不连接数据库、文件存储或真实 AI API。

## 动态数据边界

页面已按照未来真实 API Response 的结构开发。业务数据集中在 `lib/mock`，契约类型位于 `lib/types`；页面只负责展示、交互和本地状态，未来可将 Mock 数据访问函数替换为真实 API。

| 数据 | 当前 | 未来 |
|---|---|---|
| Project | Mock | Supabase |
| Research | Mock | Supabase + AI |
| Protocol | Mock / localStorage | Supabase + AI |
| Test Run | Mock | Supabase |
| Artifact | Mock | Supabase Storage |
| Judge Result | Mock | Supabase + AI |
| Human Override | localStorage | Supabase |
| Final Analysis | Mock | Supabase + AI |
| Report | Mock | Supabase + AI |
| Publish Pack | Mock | Supabase + AI |

## 下一阶段

- Supabase
- AI Research
- Protocol Generation

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
