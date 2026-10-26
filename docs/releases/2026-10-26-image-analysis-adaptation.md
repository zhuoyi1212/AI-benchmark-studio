# 图片自动适配生产发布

用户要求部署线上。发布代码为 `f5f7c0e13a1985a1d0cc4145d0b8622ded4bbee1`，正常推送 `codex/quick-backend-workflow`，未改 main。发布快照仅来自该 Git 提交；518 个索引文件、77 个真实流程文件通过实际 Secret 值与客户端/Provider/Mock 边界审计，未包含用户未提交资料。

目标为既有团队 `z-z-y1`、项目 `ai-benchmark-studio`（`prj_hbBp4mC9Tb20UgpNJmDni06w7ORS`）。生产候选 `dpl_HKEYbrpG28x3dnzWLBBDZAgAXztz` 先以 skip-domain 构建，检查期间正式 sand 域名仍指向前一部署。实际上传的 516 个源码文件 SHA-1 与提交快照逐个一致，包含图片编码、来源验证、上传确认、评分/发现读图及原生依赖配置。

Vercel Linux x64 / Node 24.22.1 构建 READY，隔离函数包中实际完成 Sharp 图片解码、视频抽帧和单声道 16kHz 提音；项目/产品目录函数仍各约 3 MiB。沿用实现阶段的 533 项测试、typecheck、生产构建与完整隔离 DB/Storage E2E，详见 PLAN.md。此发布没有修改运行时代码。

候选通过 31 项只读页面/权限/来源检查后，promote 同一生产构建。正式 [网站](https://ai-benchmark-studio-sand.vercel.app) inspect 确认绑定上述部署，31 项再次通过；七项目的测试/工作台/文章页与即梦上游入口正常，当前上传图片仍显示。访客无删除入口，创建、管理员与媒体 API 受保护，匿名写请求为 401。新部署最近十分钟 error/fatal 两类日志各 0 条。

未执行 migration、环境变量/密码/访问保护变更，没有删除用户文件、重生成用户文章或主动调用付费模型。线上管理员实际上传及模型重试未执行；功能证据来自此前真实存储的隔离 E2E，原生依赖证据来自本次远端 Linux 构建自检，不能把这些写成线上管理员实操成功。没有据此保证所有供应商 400 错误消失。

后续记录提交只保存发布证据，不重建同一份运行代码。去敏详情见 [发布验证 JSON](2026-10-26-image-analysis-adaptation.json)。
