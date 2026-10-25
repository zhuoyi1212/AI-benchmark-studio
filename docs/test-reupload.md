# 重新上传测试文件

管理员进入测试执行页，点击右上角“移除文件并重新上传”，确认后上传新结果。此操作替换整轮文件，横评项目须重新上传所有产品和任务的结果。

任务、提示词、输入材料和评分标准完全沿用，不调用AI重新生成方案。原轮文件、评分、复核、发现和文章继续保存在数据库与Storage；新轮从零上传开始，按既有流程重新匿名分析和人工确认。不提供逐文件物理删除，避免破坏已评分证据。

## 数据与失败处理

- `protocols.retest_of_protocol_id`关联来源，新的Protocol先draft、复制子项、lock，再创建全产品TestRun矩阵。事务失败不留下半个新轮。
- `restart_test_execution`仅service_role可调用，Action另验管理员。项目锁与worker mutex串行化，活跃后台任务阻止替换；跨项目和非锁定来源拒绝。
- 双击/响应丢失可重试，只返回同一尚未上传的新轮；新轮已有文件则旧请求不能再次清空它。
- 原Artifact及Storage不删除，原AI分、append-only复核和文章不回写。新轮generation usage为0，原生成模型字段为来源信息。
- 导航保留旧项目历史兼容；出现重传后仅最新Protocol解锁当前流程。没有当前Findings时，旧写作任务不能遮挡新上传页。
- 旧上传页面在签发与完成前拒绝过期Protocol，worker在恢复业务记录前验证当前输入；既有SQL上传门禁继续最终校验。
- 后台忙、版本变化和请求失败显示可重试错误。新文件沿用直传、校验和有限重试，失败不伪报上传成功。

## 验证与发布边界

SQL合约在同一事务内验证原记录不变、完整复制、空矩阵、后台互斥、幂等和权限，最后ROLLBACK。独立E2E扩展完整流程：文章完成后开启新轮、重传到真实Storage、重新Judge，逐项核对旧文件与文章；模型使用本地fixture，临时项目按现有规则软归档。

浏览器在本地真实即梦项目只验证入口、确认弹窗及取消；不实际确认用户项目重传。访客无入口，管理员可以打开弹窗。截图为`/private/tmp/reupload-dialog.png`。

增量迁移为`20261025131254_test_execution_reupload.sql`，已通过回滚合约后应用。原CLI dry-run发现旧迁移文件名与远端历史不一致，因此在隔离目录只读fetch真实远端迁移，再追加本次文件；确认只推本次后应用，不repair旧历史，不更新Vault。应用后的安全检查无warning/error，Docker缺失仅影响CLI本地catalog缓存，不影响migration执行。

应用代码暂未push或部署。用户项目原轮保持，完整测试和E2E最终结果见PLAN Progress Log。本增量不代表全产品Acceptance Criteria重新认证。
