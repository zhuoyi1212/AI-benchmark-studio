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
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

服务端优先读取可选的 `SUPABASE_URL`，未设置时复用 `NEXT_PUBLIC_SUPABASE_URL`；URL 不是 Secret，不需要维护两份。Publishable key 只能用于受 RLS 约束的普通客户端。

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

`lib/types/database.generated.ts` 由已应用 migration 的远端 Catalog 生成，保存精确的 Insert/Update optionality、relationships 与 PostgREST metadata。`lib/types/database.ts` 在生成类型上叠加由数据库 check constraint 保证的严格业务状态 union，页面与 Service 继续使用清晰的 Domain Row types。

Schema 变更并应用 migration 后必须重新生成并 review：

```bash
npx supabase gen types typescript --linked --schema public > lib/types/database.generated.ts
```

生成结果不得未经 review 覆盖 domain types。迁移 SQL 仍是数据库权威，生成类型用于验证 TypeScript 映射。

## 连接策略

- M3–M12 的业务写操作使用 server-only Service/Repository。
- 浏览器只接收当前阶段需要的最小 DTO。
- `blind_mappings`、Artifact 关联、Judge input snapshot 永不通过通用 Repository 返回给浏览器。
- Reveal 使用专用服务端方法，并先校验 ReviewSession 已 `revealed`。
- 真实调用失败返回 failed/error 并支持 retry；禁止 silent fallback 到 Mock。

## M2 验证状态

- Supabase CLI 已固定为项目 devDependency。
- `supabase/config.toml` 与 migration/seed 已纳入版本控制范围。
- 初始化 migration 已在空的远端项目实际应用；本地与远端 migration history 一致。
- 远端 `public`、`private` 与 `extensions` Schema lint 无错误，22 张证据链数据表已创建。
- Catalog 类型已从远端重新生成并接入 server client。
- 本机仍未检测到兼容容器运行时，因此本地 `db reset` 尚不可运行；后续 migration 仍需同时通过 linked dry-run/lint，安装容器运行时后补跑本地 reset。
