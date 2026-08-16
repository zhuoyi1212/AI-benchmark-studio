# AI Benchmark Studio — MVP Acceptance Criteria

只有以下全部满足，Goal 才能判定完成。

## Project

- 可以创建新 Project
- 输入名称、意图、1–3 产品、官网
- 数据保存到 DB
- 获得真实 projectId
- 刷新不丢
- Project list 读 DB
- Test progress 由 TestRuns 推导
- 不跳回固定 demo

## Research

- 对当前项目真实运行 AI Research
- 使用真实用户产品输入
- 保存 ResearchRun / ProductResearch / Sources / Comparability
- 支持 failed/retry
- 支持重新运行
- 保留旧 run
- 刷新后存在

## Protocol

- 基于指定 ResearchRun 生成
- TestCase 数量动态
- Rubric 数量动态
- 不依赖固定 AI PPT 模板
- 单项 weight > 0 且 <= 100
- 总权重 = 100 才允许 lock
- locked 后刷新仍 locked
- locked version 不可原地修改
- 未 locked 不能进入 Test

## TestRun / Artifact

- 每个 `Product × TestCase` 有真实 TestRun
- TestRun 明确 projectId/protocolId/testCaseId/productId
- 支持至少 image/PDF/text
- 文件进 Storage
- DB 保存 metadata
- Artifact 可追溯到 TestRun
- 刷新不丢
- Test progress 来自真实 TestRun

## Blind

- Judge/Review 页面只显示 Sample
- Reveal 前普通客户端无法查询完整 BlindMapping
- Judge 不获得 product identity
- Reveal 前不能提前进入 Results/Report/Publish
- 不只依赖 UI 隐藏

## AI Judge

- 真实使用 Locked Protocol + Rubric + TestCase + Raw Artifact + Blind Sample
- 不使用固定 Mock Judge Result
- 保存 aiScore/reason/evidence/confidence/model/promptVersion
- 每个 TestCase 保存唯一 JudgeCaseRun 的 provider/model/promptVersion/inputSignature
- 同一 TestCase 的全部 Blind Samples 不得使用不同 Provider、Model 或 Prompt Version
- 纯文本 Case 路由 text-only Judge；图片/PDF/混合 Case 统一路由多模态 Judge
- 0 <= score <= 10
- 0 <= confidence <= 1
- AI Score immutable

## Human Review

- 默认 Final Score = AI Score
- 可修改具体 Rubric dimension
- 修改理由必填
- 评分 0–10
- 支持一位小数
- 不可直接改 Overall
- 支持 revert
- 0 项修改正常
- 保留完整 audit history
- AI Score 不被覆盖

## Review State

必须支持：

`reviewing → locked → revealed`

locked 后普通编辑关闭。

Reveal 只能发生在 locked 后，且不改变已锁定 Final Score。

## Final Result Analysis

- Revealed 后生成
- 使用当前 Final Score
- 使用 Product identity
- 使用 Rubric/Case/Judge evidence
- 生成人群建议/优势/弱点/跨产品发现/限制
- 有 final_score_signature 或等效版本绑定
- Final Score 改变时旧分析可识别为 stale

## Results

- ranking 来自真实 Final Score
- dimensions 来自真实最终维度分
- 展示 Human adjustment disclosure
- 产品总结来自当前 ResultAnalysis
- 不使用固定 Gamma/Canva 结论

## Report

- 绑定 ResultAnalysis
- 使用 Final Score
- 使用 Protocol/TestCase
- 可以关联 Artifact/Evidence
- 刷新后存在
- 不从固定 Mock 报告读取正文

## Publish

- ContentIdeas 动态生成
- 数量/type/title/angle 不写死
- Rediscover 真实重新调用生成逻辑，不是在两组 Mock 中切换
- 支持 Custom Angle
- Community Post 动态生成 title/body/tags/question
- Screenshot Recommendation 只能引用真实 TestArtifact
- 不生图
- 不自动发布

## Main Flow Mock Audit

真实项目主流程不得依赖：

- mockResearchResponse
- mockProtocol
- mockJudgeResults
- mockFinalResultAnalysis
- mockBenchmarkReport
- mockCommunityPost

允许存在于 demo/test fixture，但不得 silent fallback。

## Persistence

刷新后以下不能丢：

- Project
- Research
- Locked Protocol
- TestRuns
- Artifacts
- Judge Result
- Human Review
- Review Status
- Reveal
- ResultAnalysis
- Report
- PublishPack

## Error Handling

至少有明确失败状态：

- Research failed
- Protocol generation failed
- Upload failed
- Judge failed
- Result analysis failed

不能无限 loading，也不能失败后假装成功。

## Security

停止前确认：

- `ZHIPU_API_KEY`、`DEEPSEEK_API_KEY` 不在前端或 Client Bundle
- 页面和 Application Service 不依赖具体 Provider 或模型名
- AI Provider 失败不跨厂商静默 fallback，也不回退 Mock
- Service Role Key 不在前端
- Secret 不进 Git
- Blind Mapping reveal 前不可读
- Storage Access 合理

## AI Provider Routing

- 存在集中 `AITaskType`、Router 与可覆盖的模型配置
- 业务层只调用任务语义方法，不调用 GLM/DeepSeek-specific 方法
- Research Sources 来自智谱 Web Search 并真实保存
- Comparability 只基于已保存 Research Data 分析
- Provider Response 经 Normalize、Zod Validation 后才能进入 Domain
- 不保存或展示 Provider 内部完整 reasoning / thinking
- 不使用 `deepseek-chat`、`deepseek-reasoner` 或 Kimi/OpenAI 依赖
- AI Run 可记录 provider/model/tokens/latency/cost，暂不可得字段允许为空

## Engineering Checks

必须全部通过：

```bash
git diff --check
npm run typecheck
npm run build
```

并至少完成一条真实 E2E：

`Create → Research → Protocol → Lock → Upload → Judge → Review → Lock → Reveal → Results → Report → Publish`

## Completion Rule

只要还有 P0/P1，就不得标记 Goal 完成。

最终报告必须列出：

- 已完成 Milestones
- 当前 branch/commit
- typecheck/build/test 结果
- 已知限制
- Mock 审计结果
- 是否满足本文件全部条目
