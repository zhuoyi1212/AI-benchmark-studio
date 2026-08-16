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
33. OpenAI 用于 Research/Protocol/Judge/Final Analysis/Report/Content Discovery/Post。
34. 所有 OpenAI Key 只在 server-side。
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
