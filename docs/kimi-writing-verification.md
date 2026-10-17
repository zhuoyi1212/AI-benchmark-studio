# Kimi K3 写作接入验收

日期：2026-10-17。分支：`codex/quick-backend-workflow`。范围：M15 后用户指定的写作模型切换，不重新认证全部产品 Acceptance Criteria。

## 实现

沿用 `Page → Publish Service → AI Task Service → Router → Provider`，新增 server-only MoonshotProvider。`community_post`（正文）、`community_post_humanize` 和 `community_post_title` 默认使用 `kimi-k3`；`MOONSHOT_WRITING_MODEL` 可覆盖，凭据为 `MOONSHOT_API_KEY`。独立文本审稿仍用 DeepSeek，视觉核验仍用智谱，选题发现仍用原模型。Story Brief 继续按证据模态走 DeepSeek 选材或智谱视觉路由。

接口能力依据 [Kimi K3 官方文档](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)。K3 standard 映射为 `reasoning_effort=low`；high 映射为 high。采用 JSON mode、包含思考的 `max_completion_tokens`（最少 16384）及原有任务超时/最多两次尝试。Normalize 只读取最终 content，随后执行原有 Zod 和业务门禁；不保存思维链。修复将前次最终答案作为用户数据重新发送，避免伪造缺少 reasoning 的 assistant 历史；Router 审计保留实际发送的消息形状。无跨 Provider fallback、无 Mock 回退。

数据库迁移 `20261017060048_kimi_community_writing.sql` 已应用到项目 `ai-benchmark-studio`，仅扩展 `publish_packs.provider` CHECK 和 `start_community_post`、`refresh_publish_pack_title` 的 Provider 白名单。两个 RPC 保持 service_role 可执行、anon/authenticated 不可执行。没有新表、回填或历史文章改写；标题刷新依然创建新版本。安全 advisors 前后均为原有 10 项 service-only 表启用 RLS 无公共 policy 的 INFO，无新增告警；这些 INFO 的[官方说明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)与现有仅服务端访问策略一致。

Blind、Protocol Lock、AI Score、Human Review append-only、Final Score/Analysis、原始 Artifact/Storage、真实用户手动实测和证据门槛不变。Kimi 仅接收既有写作材料。测试模拟 Provider 继续只存在于显式非生产 E2E 边界，不进入真实项目 fallback。

## 已取得证据

- 充值前实际 `kimi-k3` 请求为 HTTP 404；充值后同一密钥请求 HTTP 200，返回模型 `kimi-k3`、正文 `OK`，89 input / 33 output tokens。
- `node --env-file=.env.local scripts/verify-kimi.mjs` 经真实 Router → MoonshotProvider → JSON/Zod 首轮成功，252 input / 56 output tokens，3291 ms。只发送合成连接文本，不写项目数据，不输出密钥或思考内容。
- `npm test`：当前工作区 448/448 通过（包含用户已有未跟踪的 2 项文档回归，本次不提交这些资料），新增 Kimi 路由、缺失 Key、请求参数、最终答案隔离、JSON 修复、永久失败/认证失败、旧新元数据兼容与迁移权限回归。
- 最终 `npm run typecheck`、`npm run build`（含隔离媒体函数真实抽帧/提音）与 `git diff --check` 通过。
- 从暂存区导出的干净快照运行更新后的 `final-audit.mjs`：450 个 tracked 文件、74 个真实业务文件通过 Secret（含新增 Moonshot Key）、客户端边界、Provider/Mock 审计；不包含用户未提交资料。
- 完整 E2E 首跑服务端返回 HTTP 200，3/3 临时项目已软删除，但客户端命中 Node fetch 独立的 300 秒 headers timeout，故不计为客户端验收通过。测试客户端改用 native HTTP，第二轮又触及原有 360 秒场景期限；3/3 临时项目随后按精确 ID 和本轮名称保护手动软删除。最终将测试客户端场景期限调整为 600 秒，保留全部业务断言，不调整业务超时或审核门槛。
- 修改范围 ESLint：0 errors，5 条既有未使用变量 warnings。

## 使用和边界

本地重启服务后，新文章/重生成/换标题采用 Kimi；原有文章不会自动重写。生产应用尚未部署，线上环境仍需配置同名服务端密钥后发布代码。未为真实用户项目生成整篇新稿，未对写作自然程度、质量提升、成本或耗时作对照结论。本次没有购买操作、上游重评或自动发布到第三方社区。

完整 E2E 最终通过：Run `mvc069zk-3ab494eb`，HTTP 200 / 3.4 min；46 次本地模拟 Provider 请求、7 条真实页面请求、首次文章生成、手动保存、后台重生成、Kimi 标题刷新及 provider/model 元数据持久化、旧稿保留、横评与不可比拦截均通过，3/3 临时项目自动软删除。模型为模拟，DB/Storage/Service/Router/Provider 和页面响应为真实链路；Kimi 真实 API 另由前述合成 JSON smoke 验证，不能将 E2E 夹具当成真实用户内容质量评测。前两轮共 6 个临时项目也均已确认软删除。

最终 build/typecheck、diff 检查与 Secret/Mock 审计通过；提交结果见本次 PLAN Progress Log 和 Git。
