# 删除并重新上传测试文件

管理员点击文件卡片右上角的叉号即可删除，不弹窗。其他文件继续保留；可以补传文件，再点击继续分析。正在分析或生成内容时暂时拒绝删除。

删除实际清理Storage原件、预览与视频缓存，不保留历史文件副本。数据库保留必要的来源/删除回执及已生成的不可变AI评分、复核、文章。旧分析不再作为当前证据集的结果。

## 数据与失败处理

- `remove_test_artifact`为service-only、security invoker、空search_path事务；Action另验管理员。复用项目锁/worker mutex、活跃工作检查和锁定任务复制。
- 新轮完整沿用任务、提示词、输入和Rubric。幸存附件只新增元数据关联，共享相同Storage对象；保留其执行元数据，不复制文件、不调用AI生成方案。
- `test_artifacts`依然不可变；同一run内路径唯一，全局路径建索引。`test_artifact_deletions`记录删除与清理状态，`available_test_artifacts`视图排除所有指向被删对象的历史关联。视图security_invoker，表启用RLS，仅service_role可读写。
- DB先隔离被删证据，再通过Storage API清理，最后完成回执。半成功后页面显示“存储清理未完成”和重试；刷新仍可恢复，重复请求不会再创建轮次。完成回执失败也不能伪报成功。
- 新轮只采用当前文件与分析完成状态；上传确认在验证/锁定run之前取得与删除相同的项目mutex；旧上传/worker继续有scope检查。最后一个文件删除后恢复pending，其他文件仍可下载。旧AI分与append-only复核不回写。
- 已删除文件不参与当前生成。大量历史binary主要占用存储；历史元数据仍有查询成本，本次不宣称做了全量数据库性能优化。

## 验证与发布

增量migration为`20261025134553_remove_individual_test_artifact.sql`。先在回滚事务验证权限、互斥、幂等、幸存文件/执行元数据和旧评分不变，再只追加本次迁移；不修复旧迁移历史，不修改Vault，不自动删除用户项目文件。

隔离E2E覆盖文章生成后删除单个真实Storage文件、幸存文件下载、最后一项删除、补传、重新Judge和历史文章不变。AI使用本地Provider fixture，数据库与Storage真实。浏览器只在用户即梦项目检查入口与访客权限，不点击其删除按钮；实际删除限独立测试项目。结果见PLAN Progress Log。
