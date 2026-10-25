# AI Benchmark Studio — MVP Acceptance Criteria

2026-10-25 测试重传增量：管理员可确认整轮移除并重传，访客无入口且Server Action拒绝写入。新锁定版本保持完整任务/输入/评分标准，全部TestRuns为空；旧文件、评分和文章不变。刷新保持新轮，旧分析不解锁当前下游，旧页面不可上传；新上传可重新评分。验证后台任务互斥、跨项目/过期请求拒绝、重复提交幂等及事务回滚，无物理删除和建轮时AI调用。

2026-10-25 社区分享增量：快速/专业选题、策划、写作与只读审核共享用途/具体结果/判断理由指导；图像任务不强求产品引语，有真实过程可用步骤长文。无关参数只有明确定位的删除指令才可移除，重要细节保护不变；Brief ending可空，scope与主线证据仍必填。原始证据、作者经历与事实范围失败仍不得ready；真实模型自然度与读者偏好另做样稿评估，不能以工程回归替代。

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
- 新建项目默认快速模式，项目设置可在 Protocol Lock 前切换快速/专业模式

## Research

- 对当前项目真实运行 AI Research
- 使用真实用户产品输入
- 保存 ResearchRun / ProductResearch / Sources / Comparability
- 支持 failed/retry
- 支持重新运行
- 保留旧 run
- 刷新后存在
- completed 调研进入不可变产品快照；相同产品在新项目中复用最新版本且不重复完整调研
- 过期快照只提醒不阻塞；主动重新调研创建新版本并保留旧版本引用

## Protocol

- Product Research 明确查找 Prompt 字符上限、文件上传能力与输入格式
- Prompt 不超过所有被测产品中最小的已知字符上限
- 任一产品未明确支持文件上传时不生成 `inputArtifacts`
- 生成后及 Lock 前校验任务可执行性；不兼容任务显示原因、不能锁定、可重新生成
- 长材料不得静默截断；只有代表性片段仍能验证原目标时才允许缩短，否则改选任务
- 基于指定 ResearchRun 生成
- 默认快速生成恰好 1 个最有代表性的 TestCase
- 历史多任务草稿仍可删除 TestCase，且至少保留 1 个
- Rubric 数量动态
- 不依赖固定 AI PPT 模板
- 单项 weight > 0 且 <= 100
- 总权重 = 100 才允许 lock
- locked 后刷新仍 locked
- locked version 不可原地修改
- 未 locked 不能进入 Test
- 专业模式生成 2–4 个 Case，快速模式固定 1 个 Case

## TestRun / Artifact

- 每个 `Product × TestCase` 有真实 TestRun
- TestRun 明确 projectId/protocolId/testCaseId/productId
- 支持 image/PDF/Word/PPT/Excel/text/video
- 只要存在有效 Artifact 就可分析，不因缺少独立文本文件或不匹配预期输出类型而阻塞
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
- 快速模式自动接受高置信度正常项，只暂停并展示异常评分
- Findings 必须人工确认；专业报告后台生成不阻塞社区内容

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

- 先将材料分为成帖、短观察、缺上下文、不建议，允许 0 个可写候选，不凑数量或类型
- 候选的原句必须能回溯到同一产品、同一任务的真实 Artifact；不能用页面外壳当回答
- 精简写作材料保留场景与原句，核心判断只传一次，不以 Report 或旧文章为母稿
- 一篇讲清一件具体事情；段落有新信息，判断有依据，措辞简单连贯
- 允许短观察只有一段、互动问题为空；篇幅服从材料，不靠重复或免责声明补字数
- 数字、来源、产品行为不失真；产品声称与核验事实分开；不得新增作者经历
- 个人判断不等同虚构经历，改写允许删重复句、重组段落，改变核心判断须另建候选
- 不向正文模型发送完整 Report、排名或评分；保留现有 score-free 和事实校验
- 正文与至多一次语言改写使用 non-thinking deepseek-v4-flash，复用 Task Service / Router / Provider
- 首稿通过直接完成；事实风险停止；语言修正失败明确失败，不无限重试或 silent fallback
- Critic 模型与事实门槛不变，分别审查事实与可读性，不把提问、反差作为硬要求
- 保存实际模型输入、返回、失败稿、route、usage 与审稿记录；不保存思维链
- 历史文章可读，新结果用新版本；不重跑上游步骤，不覆盖原始证据
- 使用多条真实材料验证自动结果，人工样稿不能冒充 API 输出或写进生产模板
- 执行 typecheck、相关 Publish tests、build、git diff --check，并在网站核对新文章
- Screenshot Recommendation 只能引用真实 TestArtifact，不生图、不自动发布到社区

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
- 已完成文章可单独更换标题，不重新生成正文或证据关系
- 新标题 6–28 字、与当前标题不同、无标题党词汇，数字在正文有依据
- 每次更换标题创建新的 immutable PublishPack 版本并保存 route、signature、usage 与前后标题

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

- `ZAI_API_KEY`、`DEEPSEEK_API_KEY` 不在前端或 Client Bundle
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


### Publish 内容机制验收补充（2026-09-10）

- 新审稿不得出现分数与结论冲突；拒绝必须附当前文章原句、依据和修改要求。
- 不得把产品未完成历史任务误当成观察文章的事实错误。
- 无证据的遗漏断言停止；原文有署名时声称没有必须被拒绝。
- 简短事实稿可直接通过；正文不复写选题元数据，元数据由程序锁定。
- 多条材料的真实样稿与人工阅读仍是必需项；单篇通过或程序测试通过不表示全部内容质量验收完成。

## 快速模式后台接管增量验收

- 创建快速项目后后台自动完成调研和方案，采用后才允许实测。
- 全部证据保存后自动完成匿名评分；异常项暂停复核，正常项按既有规则 Lock → Reveal。
- 未确认 Findings 时不得生成文章；确认后自动完成选题、初稿、语言调整和事实核对。
- 无页面打开也能接力，重启服务后持久化队列可继续；失败重试不重复已保存的相同 AI 阶段。
- 重复投递不创建重复任务；过期 lease 不能写检查点或结束任务；浏览器不能读取队列载荷和中间稿。
- 专业报告失败不阻塞文章，并提供独立重试。
- Serverless 部署必须配置后台调度后，才可认定线上“关闭页面仍持续运行”验收通过。

## 最终内容规范增量验收（2026-10-04）

- 快速与专业来源使用同一四阶段管线，先核验初稿再做语言编辑。
- 旧的分类偏好不能强制输出“好用的/一般”等标题；少量材料不凑字数或空缺点。
- 提纲引用必须属于所选任务的真实材料；未知引用、重复选材、未提供范围说明失败。
- 润色只能返回标题/正文/互动句；数字和观察锚点变化受检，六项语义任一失败不 ready。
- 最终审核不返回正文，实际保存内容等于审核对象；截图只能关联真实可用图片和最终正文段落。
- 真实模型回归包含假称已改正文、虚构情绪/收益/过程和文本证据误推荐为图片；不能只看模型通过布尔值。
- 保存规范版本、提纲、文案快照、简报/润色状态和调用追溯；历史 JSON 可读，重新生成新版本。
- 通过相关与全仓测试、typecheck/build/diff check；隔离样稿、真实数据库恢复验证及线上部署分别记录，不冒充真实用户文章已重生成。


2026-10-12 标题增量验收：
- 新生成与独立刷新标题概括产品、测试用途或场景及有证据的主要结果，未读正文也能理解。
- 不强制反差/悬念，局部摩擦不替代主线，重大失败须交代任务用途；初审和最终审稿检查标题主次。
- 刷新仅以已核验正文为主要依据；不重跑正文/媒体、不覆盖历史，保留6–28字符、产品名、数字依据与独立新版本审计。


2026-10-12 文章编辑增量：
- 快速与专业页可保存文案/真实配图顺序，新请求读回同一已保存版本；人工编辑标识与原AI审核区分。
- 重生成在后台创建新版本，执行完整独立审核；页面显示上一版和进度，刷新/离开不丢任务，失败可重试，不修改测试/评分。
- 旧版内容与Artifact保留，过期保存拒绝，DB/queue失败不假成功；同一请求创建版本和任务原子完成。
- 无凭据仅查看；新Actions验证管理员，RPC仅service_role；脏编辑先保存，生成/保存中禁止继续输入造成覆盖。

2026-10-16 作者判断增量：
- 确认Findings与写作配置可选填四项判断，默认折叠；未填兼容历史数据，服务端限制600字/项并拒绝未知字段。
- 作者输入与AI Findings输出分开保存；自动继承当前确认来源，文章可覆盖或清空，不进入事实账本、不跨Findings误用。
- Brief、初稿、按需修订、两次审核均接收同一组有效判断；即便作者要求，也不能绕过无依据数字、事实与引用门禁。
- 成稿补充判断须显式重新生成；原子保存新版本配置与任务，旧稿/旧配置不变，非法输入不产生半成功版本。
- 原有模型路由、历史阅读、只读权限、Blind与评分规则不变；自然程度提升需真实模型样稿盲评，不能用模拟回归宣称提升比例。
