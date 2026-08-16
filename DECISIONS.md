# AI Benchmark Studio — Product & Engineering Decisions

这些决定已经确定，Codex 不应重新发明；除非出现不可实现的技术冲突。

1. 产品是 AI 产品实验室 / Benchmark Studio，不是 AI 写文章工具。
2. 核心资产是结构化实验数据和原始证据，不是文章。
3. MVP 每个 Project 支持 1–3 个产品。
4. AI Research 必须做 Comparability Check，不强行比较不可比产品。
5. Protocol / Rubric / Prompt 必须在看到实验结果前锁定。
6. MVP 标准化测试默认 Same Prompt / Same Input / First Attempt。
7. MVP 不做 Browser Agent 自动操作第三方 AI 产品。
8. 用户手动执行测试并上传 Raw Artifact。
9. Raw Artifact 是实验原始证据，Report/Publish 不能制造替代证据。
10. Blind 是真实数据访问机制，不是单纯 UI 隐藏。
11. Blind Mapping reveal 前必须服务端保护。
12. AI Judge 原始分、reason、evidence 不允许人工覆盖。
13. Human Review 是纠偏，不是独立第二评分系统。
14. 默认 Final Score = AI Score。
15. 人工改分必须填写理由。
16. 人工只能改具体 Rubric Dimension，不直接改 Overall。
17. 0 项人工修改是正常情况。
18. Human Review 必须保留 append-only 历史。
19. 顺序固定：AI Blind Review → Human Review → Lock → Reveal → Results。
20. Results 使用 Final Score。
21. Human Review 改变分数后，Result Analysis 必须重新生成。
22. Final Result Analysis 是 Reveal 后的独立 AI 阶段。
23. Report 必须绑定某个 ResultAnalysis。
24. Report 必须保留 Methodology 与 Evidence traceability。
25. Community Publish 不是 Report 缩写。
26. ContentIdea 是动态 AI 输出，type 不是固定 enum，数量不固定。
27. Community 内容本身必须独立有信息价值，不是纯导流。
28. Community 截图来自真实 TestArtifact。
29. MVP 不 AI 生图作为社区证据。
30. MVP 不自动发帖到第三方社区。
31. 继续使用 Next.js + TypeScript + Tailwind + shadcn。
32. 后端使用 Supabase Postgres + Storage；Auth 后续接入。
33. AI 能力通过 Provider-neutral Task Service 与集中 Router 接入；第一版供应商为智谱 AI / GLM 与 DeepSeek，不使用 OpenAI 或 Kimi。
34. 所有 Provider 调用和 `ZHIPU_API_KEY`、`DEEPSEEK_API_KEY` 只在 server-side；页面与业务 Service 不知道供应商和模型名。
35. 暂不使用 LangChain/LangGraph。
36. 暂不使用 Vector DB。
37. 不做过度架构，代码应适合“产品经理 + AI Coding”维护。
38. 长期数据访问结构为 `Page → Service → DB/AI`。
39. Mock 可以保留为 demo/test fixture，但不能污染真实 Project。
40. Project Progress 由 TestRuns 推导，不维护第二套进度 source of truth。
41. Locked Protocol 不覆盖；要改就新建 version。
42. AI Run 至少记录 model、prompt_version、timestamps。
43. 重要实验历史优先保留，不为“数据库简洁”覆盖原始记录。
44. 删除策略要保护历史，尤其 Product 全局实体不能无脑 cascade。
45. MVP 优先完成真实闭环，不优先做复杂登录、团队权限、SEO、Dashboard 花哨图表。
46. Product Research 使用智谱 Web Search 获取可追溯 Sources，并由 `glm-5.2` 整理；DeepSeek 不凭已有知识生成官网事实。
47. Comparability、Protocol、Final Result Analysis、Content Discovery 默认使用 `deepseek-v4-pro`；Report 与 Community Post 默认使用 `glm-5.2`。
48. Judge 按 TestCase 而非 Sample 路由：全纯文本使用 `deepseek-v4-pro`，任一图片/PDF/视觉或混合 Artifact 则全 Case 使用 `glm-4.6v`。
49. `judge_runs` 是 Protocol 级批次，`judge_case_runs` 是 TestCase 级唯一 Provider/Model/Prompt 路由；Sample A/B/C 必须共享后者。
50. Provider 输出必须 Normalize 并通过运行时 Schema 校验；失败可在同 Provider 重试，不得静默跨厂商 fallback 或回退 Mock。
51. 不保存 Provider 内部完整 reasoning/thinking；只保存业务结构化结果与必要的 provider/model/token/latency/cost 元数据。
52. 模型默认值集中配置，可通过 server-side 环境变量覆盖；禁止 `deepseek-chat` 与 `deepseek-reasoner` 旧 alias。
