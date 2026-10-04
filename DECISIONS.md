# AI Benchmark Studio — Product & Engineering Decisions

这些决定已经确定，Codex 不应重新发明；除非出现不可实现的技术冲突。

1. 产品最终目的改为持续生产适合 AI 社区、X、小红书发布的 AI 内容；Single Product Mode 的 North Star 是发现问题、形成观点、用可信素材支撑并生成社区帖子。
2. Research、结构化数据与原始证据是内容可信度资产；最终产物不是测评报告，而是有观点密度的社区内容。
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
34. 所有 Provider 调用和 `ZAI_API_KEY`、`DEEPSEEK_API_KEY` 只在 server-side；页面与业务 Service 不知道供应商和模型名。
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
47. Comparability、Protocol、Final Result Analysis、Micro Finding / Content Discovery 与三类社区 Critic 默认使用 `deepseek-v4-pro`；Community Post 与 Community Post Rewrite 只负责语言组织，默认使用 non-thinking `deepseek-v4-flash`；Report 默认使用 `glm-5.2`。
48. Judge 按 TestCase 而非 Sample 路由：全纯文本使用 `deepseek-v4-pro`，任一图片/PDF/视觉或混合 Artifact 则全 Case 使用 `glm-4.6v`。
49. `judge_runs` 是 Protocol 级批次，`judge_case_runs` 是 TestCase 级唯一 Provider/Model/Prompt 路由；Sample A/B/C 必须共享后者。
50. Provider 输出必须 Normalize 并通过运行时 Schema 校验；失败可在同 Provider 重试，不得静默跨厂商 fallback 或回退 Mock。
51. 不保存 Provider 内部完整 reasoning/thinking；只保存业务结构化结果与必要的 provider/model/token/latency/cost 元数据。
52. 模型默认值集中配置，可通过 server-side 环境变量覆盖；禁止 `deepseek-chat` 与 `deepseek-reasoner` 旧 alias。
53. Publish 不公开 AI Judge 数值或排名；数值只作为内部 qualitative sentiment，文章必须由真实 Evidence 与人的解释形成观点。
54. Content Discovery / Community Post 使用专用 ArticleExperienceInput，不直接接收 ranking、caseScores、dimensionScores 或完整 Report；score-free 校验与一次定向修复是持久化前硬门禁。
55. Community Post 是一位真实用户围绕一个核心观点的体验表达，不是 Benchmark Report 摘要；标题、正文、标签、内部术语和 AI 套话都必须通过运行时风格校验。
56. Publish 使用 CommunityPostSource，不消费完整 Report；每次发现 5–8 个包含 hook、coreOpinion、whyInteresting、supportingEvidence、counterPoint、audience、contentType 的 Community Angles。
57. Experience Post 必须有真实用户 Evidence。Research、公开资料、Demo fixture 与模拟数据只能生成 Opinion / Discussion Post，禁止伪造第一人称实测，也不在正文机械披露 fixture 状态。
58. Community Post 支持 short（150–300）、medium（250–500）、long（600–900），默认 medium；结构按观点动态选择，不套固定测评章节。
59. Publish 生文前必须从 Raw Artifact、任务结果、Judge Evidence、Human Review 与 User Note 提取 10–18 个 Micro Findings，并生成同时包含 technicalTruth、whatHappened、whyItMatters 的 Human-readable Moment。
60. 每个 Community Angle 必须绑定一个直接支持 coreOpinion 的 Evidence Anchor；最终 DeepSeek 只消费围绕该 Anchor 构造的 CommunityWritingPacket，不消费完整 Report、Results、Research、Judge 或全部 Test Case。
61. ready Community Post 必须通过 Evidence Critic、Jargon Critic、Style / Vagueness Critic、奶奶测试与 Anti-Vagueness；任一失败仅自动 rewrite 一次，不做跨 Provider 或人工 curated fallback。
62. Community Post 首稿与定向 Rewrite 不得自动升级到 `deepseek-v4-pro`；Flash 的 Schema repair 仍保持 non-thinking。输出上限按 short / medium / long 分别限制为 1200 / 1800 / 2600 tokens。
59. Publish 的主要写作标准采用用户提供的观猹式社区规范；稳定 System Prompt 与选题规则集中维护，不在每次请求中注入整份 Style Guide。
60. Content Ideas 与 Community Post 必须通过确定性 Forbidden Patterns；标签默认 1–3 个，标题上限 28 个 Unicode 字符。
61. Community Post 生成后必须经过独立 Style Critic；未通过时自动 rewrite 恰好一次并复审，最终仍未通过或存在事实风险则失败。Critic 与 rewrite 都不得绕过 CommunityPostSource、Experience 真实性和 Evidence Grounding。
63. 2026-09-06 Safe Community Style Policy 替代开放式修稿：libai 仅为一次性设计参考，不作为运行时依赖。不加载完整 Skill、不运行其脚本；统一由项目固定 Policy 做一次 HOW TO SAY 润色，不能改变 WHAT HAPPENED。
64. Safe Rewrite 仅输出标题、正文和讨论问题；核心观点、内容类型、标签与证据绑定由系统保留。数字/算式/经历确定性检查之后，独立 Critic 必须比较原稿与改稿的六项 Meaning Preservation；缺失结果或任一失败均拒绝。
65. 改稿拒绝时保留已通过审稿的原稿；原稿本身有事实或质量风险则明确失败。此规则优先于旧“任何改稿失败均失败”的表述，不放宽 Evidence、Jargon 或 Style 门禁，也不新增 Pro fallback。
66. Protocol 草稿中的测试任务由用户最终选择；用户可删除不合适的任务并以剩余任务继续，至少保留 1 个，不要求必须测满 3 个。锁定后任务仍不可修改。
67. Protocol 默认采用快速模式：每次生成恰好 1 个最有代表性的核心任务，降低输出预算并使用普通强度修复；暂不增加深度模式，其余锁定、证据和评分规则不变。历史多任务版本继续保留。
68. 2026-09-25 起保留“快速模式 / 专业模式”项目级分段控制，快速模式默认，专业模式生成 2–4 个 Case 并保留完整复核与报告；此决定替代第 67 条中“不增加深度模式入口”的部分，不改变 Protocol Lock。
69. completed ProductResearch 进入全局、不可变、90 天默认有效期的版本快照。新项目复制最新快照并固定引用；过期只提醒，主动重新调研创建新版本，不覆盖历史。
70. 快速模式在完整 Artifact 上传后自动初始化 Blind Layer 并运行 Judge。高置信度正常评分沿用不可变 AI Score；只暂停异常项，之后 Lock、Reveal 并后台生成候选 Findings。此决定替代 2026-09-20 Quick Findings“不依赖 Judge / Review”的主流程描述；Findings 仍必须人工确认后才能 Publish。


### Publish 内容机制调整（2026-09-09）

2026-09-09：用户授权按三篇社区文章案例调整最终生成。Publish 先判断素材价值，取消旧的 10–18 Findings / 5–8 选题及类型配额；历史字段仅作兼容。写作只收精简材料，合格初稿不再强制改写，语言修正最多一次，事实风险直接停止。保留模型配置与事实门槛。此决定替代此前 Publish 中与上述规则冲突的配额、最低篇幅和强制结构要求。

2026-09-09 真实实验补充：Pro high 选材出现截断及事实错误，不保留该配置。选材聚焦一个任务；遗漏判断的审核依据改为完整记录。短观察的篇幅不由最低字数驱动，审稿没有可执行修改意见时停止。


2026-09-10：用户认可简短的建议函目标样稿并授权继续。实际 v45 出现通过/82分/无修改意见矛盾，v46 审稿错把历史信件当作待修文章。用具体检查和问题清单替代多重风格分数，增加问题引文须属于当前文章的确定性校验。历史 Schema 保留可读，不伪造兼容分数。正文只生成文案，核心观点和类型由已选元数据写入。Flash non-thinking 正文、Pro high 审稿保持不变。

2026-09-11：在单任务范围内，写作优先使用原任务和完整存档回答，审稿复用同一材料；不把补全背景推迟到审稿，不重复发送观察摘要。完整标记只说明当前存档没有被截取，不代表外部事实核实。选材同时考虑有用的处理办法与不足，不把挑错当作全部测评价值。

2026-09-21：用户授权按四篇参考稿扩展社区内容表达。保留体验清单，新增场景深度与多维度预设；复用现有 community_post 路由，先独立策划并校验章节证据，再写正文；原始 Artifact 最终核对同时校验文章质量。对深度稿取消固定第一人称开头与短文篇幅限制，但不放宽事实边界。使用影响必须来自已确认内容，未实测建议明确区分。专业评分继续保留，但 Publish 写作输入只取可追溯观察及任务，不传报告全文、排名或数值评分。无新增 migration。

2026-09-21 语言 Agent：在初稿与最终证据核对之间增加一次独立语言编辑，沿用现有智谱文字模型配置并使用独立任务路由/Prompt 版本；仅限三项文案字段，不使用第三方 Skill 作为运行时依赖。无修改必要可原样返回；Schema/数值/锚点失败只允许既有同 Provider 有限重试。最终核对须比较原稿与改稿的事实、范围、立场、经历、建议和证据含义。这里的初稿尚未通过最终核对，因此编辑失败不能回退未验证初稿并假报 ready。原稿/改稿与六项结果仅随成功的新版本保存；断点续跑和失败中间稿归档另行实现。

2026-09-30 后台快速模式：用户授权由后端接管流程。新增持久化任务队列和成功阶段检查点；页面仅提交用户动作与读取状态，不再以倒计时/自动点击串联 AI 请求。正常门槛保留 Protocol 采用、实测原始证据、Findings 人工确认，异常评分仍暂停复核。确认后自动选择推荐选题并完成写作三阶段；专业分析/报告后置。此决定替代 5 秒倒计时推进机制，不改变 Blind、Protocol Lock、人工实测、immutable Score 或 append-only Review。

2026-10-03 同产品复测第一阶段：建立产品统一入口和显式产品选择，不改每次实验独立保存的原则。产品 ID 为关联依据，规范化名称保留唯一约束；同域名仅提示，官网冲突不静默合并，不在创建项目时更新已有产品。产品库按产品归集资料、测评和已完成内容入口，排除内部验证及归档项目。产品别名与历史重复实体合并、方案复测、跨测评内容生成仍为后续范围。

2026-10-03 用户修正产品库：取消未测产品展示，以有效原始 Artifact + 未归档非验证项目作为收录依据，同一产品按自身证据判断。提供产品级可恢复删除（products.archived_at）与“已删除”入口，不级联删除实验和文件；替代前一阶段包含未调研/未测条目的展示行为。

2026-10-03 用户新增测评重命名：对未删除项目名称实施全工作区唯一约束（折叠空白、忽略大小写）；新建同样不能重名。删除记录释放名称，重新恢复时仍须满足唯一约束。已生成内容中的历史名称不追写，仅更新项目标签。

2026-10-04 最终生成规范：用户授权按 `docs/final-content-generation-standard.md` 实施。统一为自动材料/结构选择与提纲初稿 → 内容核验 → 三字段语言编辑 → 只审不改的最终保真检查；用运行时门禁补充模型审稿，移除固定分类标题、强制第一人称与最低篇幅。完整规范优先于旧版冲突的 Publish 结构/顺序要求，保留个人评分独立规则、来源证据及失败不可 ready。复用现有四条集中任务路由与检查点，Prompt 升版，正文与润色供应商/模型不变，不引入新 Agent 框架或数据库 migration。旧文章继续读取、新生成创建新版本。

2026-10-05 标题与任务可执行性：完成文章可只刷新标题，每次创建新 PublishPack 版本，正文与证据原样复制，记录独立标题调用审计；标题限 6–28 字并拒绝夸张词、同名标题及正文无依据数字。Research 必须查明字符上限和文件上传能力，Protocol 生成与锁定都做确定性校验；不支持文件时不得生成附件任务，长材料仅可在代表性片段仍能验证原目标时缩短，否则改选任务。禁止静默截断或让用户执行产品做不到的输入操作。
