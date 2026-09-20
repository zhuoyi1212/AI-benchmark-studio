# Safe Community Style Policy v2

规则属于 AI Benchmark Studio。libai 仅在 2026-09-06 的一次性审计中作为设计参考（SkillHub 发布包 1.0.4，审计内容哈希 6fb39fcdbd55eb518d1198461488fb1076f04d55455dc7de06c80271d569606d）。生产不读取、导入或执行它的任何文件；安装状态不影响 Publish。

## 边界

仅改变 HOW TO SAY：去报告腔、降低书面语、长短句与短段落、证据前置、自然转折、删除重复。不能改变 WHAT HAPPENED：数字、单位、算式、作者经历、用户动作、产品行为、观点极性与置信范围。具体表达只能来自已有 Evidence。疑似原稿事实错误必须由 Evidence Critic 退回，不能当作语言润色暗中纠错。

核心模块 `lib/community-style-policy.ts`；稳定版本 `safe-community-style.v2`。仅发送精简 Policy，不复制完整第三方规则。第三方的私人记忆、强补细节、随机口头禅、情绪升级和观点重构全部排除。

## 亲切、自然与逻辑（2026-09-08）

写作与润色共享精简语言规则：先交代已有场景与条件，再展开具体细节，让判断承接事实。允许当前个人判断，不强制固定连接句；明确指代、合并重复、避免短句切断因果。必要限制融入事件，不把“保留一点是”等审核备注写进正文。

WritingPacket 仅额外携带 anchor 对应的单一原任务背景（最多 600 字），不增加完整 Report 或其他 Test Case。任务里的第一人称不代表作者经历，必须转述，不能偷换对象、地点和条件。Critic 在既有 Style 门禁内检查背景缺失、指代不明、论述跳跃与机械免责声明；词简单或事实正确都不等于语言合格。

正文 / Rewrite 路由版本升级到 v5，Critic v6，模型与 token 上限不变。新增审核备注与“我家/我住在”等伪亲历回归，既有数字和含义校验保留。

## 链路与失败行为

现有素材链不变 → DeepSeek Flash 初稿 → 原稿三类 Critic → 一次 Safe Rewrite → 确定性校验 → 对照原稿的 Meaning Preservation + 三类 Critic → Final。

保留原稿预审是为了在改稿被拒绝时有独立的安全回退依据。Safe Rewrite 仍使用现有 Router 的 Flash/non-thinking 配置与 1200/1800/2600 输出上限，不新增 SDK、Provider 或 Pro fallback；一次请求，不作内容修复循环。Provider/JSON 协议失败沿用显式失败与用户重试。

改写输出只包含 title/body/interactionQuestion。coreOpinion、contentType、tags、截图身份及支撑声明锁定。段落重排后旧截图段落序号置空，避免虚假的段落定位。

确定性门禁比较各字段数值与单位、算式、中文量词数字、新增经历片段，以及部分新增动作和扩大结论模式。它有意偏保守，可能拒绝实际安全的改写；它不声称解决所有自然语言同义关系。

独立 Critic 必須返回六个布尔值：numbersPreserved、experiencePreserved、productBehaviorPreserved、conclusionScopePreserved、opinionPreserved、evidencePreserved，以及 violations。所有项为 true 且 violations 为空，三类 Critic 也通过，才能接收改稿。缺失或无法确认就拒绝。单靠关键词或模型自报“没有改事实”不能放行。

拒绝后只保留通过预审的原稿。若原稿也失败，整次生成失败，不会把不合格稿标 ready。审核保存原稿、候选稿、policyVersion、拒绝理由、前后 Critic、输入签名、模型和 token usage。

## 回归及示例

`tests/safe-community-rewrite.test.mjs` 执行真实校验函数与最终选择逻辑，覆盖数字修改/删除/添加、单位、算式换序、中文时长、第一人称、购买行为、产品动作、扩大结论、元数据、六项语义结果及不合格原稿禁止回退。

`tests/fixtures/safe-community-rewrite.json` 保存十条完整 Original → Safe Rewrite 和规则标签。来源为上一轮已保存的智谱社区帖纠错基线，不冒充十篇生产数据或本轮真实 API 输出。原句逐字匹配来源快照，改句经过确定性校验和人工语义对照；均未增加事实。该样例里的46Wh保留为被引用的原回答，不在润色中改成460.8。

局限：独立 AI 语义审查不是数学意义的事实保证；已有素材自身的错误仍依赖上游 Evidence 质量与复核。发现冲突时保守拒绝，不用更自然的文风掩盖不确定性。

## 验证记录（2026-09-07）

- `npm run typecheck`：通过。
- `npm run test:publish`：41/41 通过。
- `node --test tests/*.test.mjs`：168/168 通过。
- `npm run build`：通过，Next.js 生产构建完成。
- `git diff --check`：通过。
- 未调用真实 DeepSeek API或运行连接数据库的完整 E2E，未更新生产文章。本轮十条对照是可追溯的编辑回归样例，不声称模型实测成功率。
- 仅有既存 Node MODULE_TYPELESS_PACKAGE_JSON 提示；未为消除提示更改项目模块模式。
