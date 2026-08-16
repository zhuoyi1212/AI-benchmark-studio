# Supabase Foundation

## 当前边界

M2 建立可替换 Mock Service 数据源的基础层，不修改页面：

```text
Page → Service → Repository → typed Supabase server client
```

- `lib/supabase/server.ts`：唯一 elevated client factory。
- `lib/env/server.ts`：延迟、严格、无值泄露的服务端环境校验。
- `lib/repositories/*`：只处理数据库查询与标准错误。
- `lib/services/*`：组合业务数据；Project progress 从 TestRuns 计算。
- 未创建 browser client。Auth 尚未接入，现阶段没有必须在浏览器直连 Supabase 的用例。

## 环境变量

复制 `.env.example` 为 `.env.local`，填写：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

`SUPABASE_SECRET_KEY` 支持 Supabase 推荐的新 `sb_secret_...` key，也兼容本地 CLI/旧项目的 service-role JWT。它拥有 elevated 权限并绕过 RLS，只能由 server-only client 使用：

- 不加 `NEXT_PUBLIC_` 前缀。
- 不写入代码、日志、URL、错误响应或 Git。
- Repository 不能直接被 Client Component import。
- Service 在执行写操作前仍必须检查调用者与 Project 权限；RLS 不是 Service Role 的保护层。

官方说明：[Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)。

## 本地数据库

要求：Node.js 20+、Docker Desktop / OrbStack / Rancher Desktop / Podman 之一。

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
```

- `supabase:start` 启动项目隔离的本地 Supabase。
- `db:reset` **只允许用于本地空数据库**，会重建本地数据并应用全部 migrations/seed。
- `db:lint` 检查已启动的本地数据库。
- Migrations 是 Schema 唯一权威来源；`seed.sql` 只保存开发数据。

不要对已连接远端执行 `db reset --linked`。任何远端 migration push、非空数据库 reset 或数据删除都要先取得明确确认。

官方流程：[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)、[Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)。

## 类型

`lib/types/database.ts` 当前提供 Supabase-compatible Database shape 与严格 Row types。由于本机尚无容器运行时且未连接远端，M2 不能从实际 catalog 生成 relationships 与精确 Insert optionality。

数据库可用后必须运行并比较：

```bash
npx supabase gen types typescript --local
```

生成结果不得未经 review 覆盖 domain types。迁移 SQL 仍是数据库权威，生成类型用于验证 TypeScript 映射。

## 连接策略

- M3–M12 的业务写操作使用 server-only Service/Repository。
- 浏览器只接收当前阶段需要的最小 DTO。
- `blind_mappings`、Artifact 关联、Judge input snapshot 永不通过通用 Repository 返回给浏览器。
- Reveal 使用专用服务端方法，并先校验 ReviewSession 已 `revealed`。
- 真实调用失败返回 failed/error 并支持 retry；禁止 silent fallback 到 Mock。

## 当前本地验证状态

- Supabase CLI 已固定为项目 devDependency。
- `supabase/config.toml` 与 migration/seed 已纳入版本控制范围。
- 本机未检测到兼容容器运行时，因此 migration 尚未实际执行；这不是用静态测试替代数据库验证，M2 完成前必须在本地容器或授权的 Supabase 项目上真正应用 migration。
