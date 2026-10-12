# 历史页面加载优化

日期：2026-10-12。

## 诊断

线上只读计时，优化前同一轮请求：

| 页面 | 首字节 | 完整 HTML |
| --- | ---: | ---: |
| 项目列表（首次） | 12.45s | 14.43s |
| 懂你AI调研 | 0.71s | 2.65s |
| 懂你AI快速工作台 | 0.52s | 6.64s |
| 懂你AI报告 | 0.55s | 8.33s |

这不是历史阅读时又调用了 AI。页面框架先返回，正文等待跨服务数据库读取；首字节不代表正文就绪。首次列表明显较慢还涉及函数启动及网络，单次请求不能作为稳定延迟或精确归因。

确认的工程浪费：

- Vercel 无需本地队列轮询器，但 instrumentation 的编译依赖仍包含其 AI/媒体图；此前全局 tracing 又把 FFmpeg/FFprobe 打进列表函数。
- 阅读评分/报告经 Blind → 完整 ProtocolWorkspace → Research 重建上游，而锁定协议已保存这些必要字段。
- 一个页面的多个模块重复构造 Research/Test/Findings 工作台。GET 请求已有去重，但服务计算和 POST 签名下载仍可重复。
- 文章/报告/分析只显示最新版本，却读取该来源全部历史大 JSON。

## 改动

- `next.config.ts`、`lib/quick/vercel-node-worker.ts`：仅 Vercel 服务端构建替换不使用的本地 poller 编译入口。保留真实 Cron worker、本地轮询器及项目详情 Server Actions。媒体工具 tracing 限媒体接口、Cron 与项目详情，列表不携带二进制。
- `scripts/verify-media-bundle.mjs`：继续实际验证媒体函数抽帧/提音，同时在 Vercel 构建断言项目/产品列表不含视频二进制并记录体积。
- `protocols.service.ts`：新增当前已锁定协议读取，检查项目未归档、最高版本已锁定，复用原协议 schema。
- `blind-review.service.ts`、`test-execution.service.ts`：阅读已锁定测试和评分不加载无关调研快照。Blind identity guard 仍在读 Sample 之前，输出仍仅匿名字段。
- `read-scope.ts`、Research/Protocol/Test/Findings：仅一次页面 render 内复用工作台结果。失败移除缓存；不同页面、不同项目、访客、Actions 和 workers 均不共享缓存。
- Publish/Report/ResultAnalysis Repository 与读取服务：最新显示请求 `limit(1)`，仍按 version/attempt 倒序，包括最新失败记录；生成和历史读取默认保持全部版本。Final Score 签名检查不变。

无 schema migration、无历史重写、无 AI/Mock 替代。现有客户端 Router Cache 120 秒及写后 revalidatePath 不变。

## 本地验证

350/350 tests、lint 0 errors/26既有warnings；完整真实DB/Storage E2E Run `mv4oky0b-c1537eb2` 通过，40个隔离 Provider 请求、3个夹具项目已软删除。模型响应明确为 fixture，不冒充产品实测。

Vercel 模式本地构建的项目/产品列表 trace 各126文件、约3MiB，无FFmpeg/FFprobe；媒体接口仍实际抽帧及提取mono16kHz音频。

只读服务追踪：报告27次底层请求降至22次，响应约80,273→58,908 bytes；健康连接样本4.37→2.34秒。文章版本响应45,763→18,310 bytes。本机到Supabase出现过ECONNRESET及重试离群值，所以不把有连接错误的样本当作优化效果。第一次E2E在创建任何夹具前遭TLS重置，第二次完整通过。

线上发布后的测量在 PLAN 发布补充中记录。跨境访问、冷启动、Storage 签名、详情页仍需验证当前状态会保留耗时；不能保证所有页面首次访问都瞬间完成。详情函数同时处理管理员写操作，因此仍保留必需媒体资产。更彻底分离读/写计算属于后续独立架构工作。

## 上线复测

实现提交 `d16fc33`，部署 `dpl_HwQ7hHQrWbM7Uj2Jqo1RWdXMBnLZ` 已READY/promote到sand域名。Linux构建也确认两个目录约3MiB、媒体自检实际通过。正式域名第一轮完整HTML均200：列表2.87秒、调研3.25秒、快速页6.16秒、报告6.56秒、文章4.49秒；原历史页面标题保持一致。与基线相比目录提升明显，详情只有部分改善，调研单次样本略慢，不能说所有页面都更快。

第二轮计时在TLS握手建立前全部失败（HTTP000、SSL_ERROR_SYSCALL、约5秒），未到达应用查询阶段，不计作页面读取耗时。已有本机到Supabase的ECONNRESET离群值也应独立分析。以上是少量时点测量，并非稳定SLA或控制网络条件的统计实验；详情仍有当前评分/版本核验和多个串行请求，后续若要进一步压缩应围绕这些读取做独立聚合与实时性能观测。
