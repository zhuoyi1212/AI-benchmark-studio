# 图片后台自动适配

浏览器先直传私有 Storage；上传确认在服务端校验完整 SHA-256、解码图片、准备 AI 分析副本，再通过原有事务保存 Artifact。进度达到 100% 后显示“正在校验与处理…”，处理成功才显示已保存、进入分析。这是服务端上传确认步骤，不依赖浏览器后台计时或新增任务队列。

## 处理规则

- 静态 PNG/JPEG/WebP，上传上限仍为 50 MiB。输入最多 1 亿像素，每次编码限 20 秒；动画或损坏图片明确失败。
- 分析图片最多 4 MiB、最长边最多 6000 像素，按比例缩小，不放大或裁剪。普通合规 PNG/JPEG 保持原字节。
- 需要适配时先使用不减色 PNG；仍超限依次尝试 JPEG 95/90/85、4:4:4 色度采样。JPEG 透明区域使用白底。仍超限则明确停止，不无限降低质量。
- 不模糊、锐化、重绘、补字。处理变化不得归因于被测产品；看不清的文字和细节保持未知。

## 存储和追溯

原图路径不变。只有需要变换时才增加私有副本，原路径追加 `.analysis-image.v1.png` 或 `.analysis-image.v1.jpg`。副本不创建 Artifact ID，不进入配图、页面展示或下载。

不可变 `test_artifacts.metadata.analysisImage` 在初次记录时保存策略、原图/副本 SHA、原始及输出宽高、MIME/字节数、编码/质量和路径。无新表、列、RPC 或 migration，不更新历史元数据。

Judge、Findings、Publish 共用 server-only `imageForAI`，从 `available_test_artifacts` 重查来源，读取并校验副本，以 Base64 image_url 发送，避免模型再抓临时链接。策略进入输入签名，副本摘要和技术处理边界随证据发送；评分继续引用原 Artifact ID。

旧图在用户显式分析/生成时按相同规则在内存中适配，不改历史行/文件或自动重评分。副本缺失/损坏可从校验通过的原图重建到内存；原图校验失败则停止。页面 GET 不压缩或调用模型。

## 失败和清理

编码、存储或记录失败不显示已保存。未记录的原图与两个副本路径由同一 Storage remove 补偿，清理失败明确报错。DB 确认不明时保留对象并提示重试，不能把查询失败当成没有记录。重复确认只接受匹配的记录，不匹配请求不能删除已提交证据。

点击叉号删除时沿用原事务及清理回执，原图和两个副本格式在同一请求中清理；幸存附件共享原路径/副本，不增加历史文件副本。

## 验证边界

真实 Sharp 测试覆盖无损/JPEG、WebP、透明度、方向、比例、动画、解码、完整性、旧图、缺失副本、直传、补偿、响应丢失及删除路径。完整隔离 E2E 使用真实 DB/Storage、本地 Provider 夹具，验证超 5 MiB 图片签名直传、自动压缩与副本下载校验，再运行评分/文章及删除重传回归。构建门禁在隔离 Next 函数包内实际解码，验证原生依赖。

这降低已知输入体积/格式风险，不保证供应商全部 400 消失，也不证明模型识字准确率提高。未换模型、重生成用户文章或部署生产。实际结果见 PLAN.md。

参考：[Z.AI 官方示例的 5 MiB 校验](https://github.com/zai-org/GLM-V/blob/main/skills/glmv-caption/scripts/glmv_caption.py)、[Sharp 输出参数](https://sharp.pixelplumbing.com/api-output/)、[Supabase Storage 上传](https://supabase.com/docs/reference/javascript/storage-from-upload)。
