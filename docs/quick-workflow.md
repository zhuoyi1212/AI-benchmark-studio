# 后台快速模式

用户操作：创建项目 → 采用方案 → 手动实测并上传 → 确认发现 → 查看文章。异常评分会额外停在人工复核。无需逐页点击调研、评分、选题、写作或润色。

## 运行方式

先应用两份增量 migration：`20260928180649_quick_backend_workflow.sql`、`20260928181719_quick_workflow_continuations.sql`，再部署应用。当前连接的 Supabase 项目已应用；其他环境必须单独迁移。

**常驻 Node**：`npm run dev` 或构建后的 `npm start` 自动注册后台 worker，每 5 秒检查队列。浏览器关闭不影响执行；主机休眠或服务停止期间不执行，服务恢复后继续。`QUICK_WORKER_DISABLED=1` 可关闭本进程轮询。

**Vercel / Serverless**：配置服务端 `CRON_SECRET`，使用独立调度器调用 `GET /api/cron/quick-workflow`，请求头为 `Authorization: Bearer <CRON_SECRET>`。该路径使用独立密钥验证，其余页面和动作继续由 Basic Auth 保护。不要将调度密钥放入浏览器或公开 URL。

仓库提供 `npm run worker:quick`，可在常驻主机执行；通过环境变量提供 `QUICK_WORKER_ORIGIN`（应用 HTTPS 地址）与相同的 `CRON_SECRET`。脚本串行等待每次调度完成，间隔 5 秒继续，网络失败后重试。也可使用平台支持的每分钟调度。平台的函数时限仍适用，单轮设为 300 秒；使用慢速供应商或长文档时优先选择常驻 Node。没有配置调度器的 Serverless 部署不能保证关闭页面后自动接力。

本次未发布线上部署或安装远程调度器。`after()` 仅唤醒一次已持久化任务，不承担持续运行保证。

## 执行与恢复

- 项目内部串行，重复创建同一任务自动去重。正常停止点是方案采用、原始实测证据、异常复核、发现确认。
- 文章先完成，专业分析与报告后置。报告失败不妨碍使用文章，工作台可独立重试。
- 模型成功输出经过 Schema 校验后保存检查点。写作分为初稿、语言调整、原始证据核对；每轮最多调用一个未完成阶段。
- 重试使用相同的模型、Prompt、Schema、输入签名命中成功阶段。证据链接的临时签名变化不导致重复生成。
- Worker 每分钟续租，失联后 15 分钟可回收；连续 3 次中断显示失败。供应商可重试错误有限自动重试，其他错误显示人工重试入口。
- 重试保留历史失败业务记录；新版本复用成功 AI 阶段。外部请求成功但数据库尚未保存时，重试可能重复请求和计费；不承诺供应商 exactly-once。
- 页面刷新仅读取状态。还未提交的本地上传队列不会因刷新被保存；批次确认以当前上传窗口为单位。

## 审计边界

`quick_jobs` 与 `quick_job_steps` 仅服务端可读写。前端不接收任务载荷、中间稿、lease 或 Judge 输入。业务结果仍来自原有 Research/Protocol/Judge/Findings/Publish 表，未引入第二份评分源。

沿用人工实测、不可变 Protocol 版本、Blind → Judge → Lock → Reveal、AI Score 不可修改、append-only Human Review 和原始 Artifact 追踪。AI 调用继续走 Task Service → Router → Provider Adapter，没有跨厂商或 Mock 静默回退，也不会生成证据图片。

## 验证命令

```sh
npm test
npm run typecheck
npm run build
npm run verify:full-e2e
npm run verify:quick-backend
E2E_QUICK_RECOVERY=1 npm run verify:quick-backend
```

E2E 使用隔离的 `[E2E]` 项目、真实 Supabase/Storage 和模拟供应商；结束后软删除项目，保留审计历史。恢复场景在润色阶段注入失败、重启 Next 服务并重试，要求初稿供应商调用仍为一次。测试 API 在生产环境强制返回 404，开发环境还需随机测试令牌。
