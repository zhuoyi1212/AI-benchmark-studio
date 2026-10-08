import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261008144040_workflow_navigation_snapshot.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../lib/repositories/workflow-navigation.repository.ts", import.meta.url), "utf8");
const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

test("loads cross-stage workflow navigation with one service-role RPC", () => {
  assert.match(repository, /\.rpc\("get_workflow_navigation_snapshot"/);
  assert.doesNotMatch(repository, /\.from\(/);
  assert.match(migration, /returns jsonb[\s\S]*stable[\s\S]*security invoker/i);
  assert.match(migration, /revoke all on function public\.get_workflow_navigation_snapshot\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_workflow_navigation_snapshot\(uuid\) to service_role/i);
});

test("retains recently visited dynamic pages in the client router cache", () => {
  assert.match(nextConfig, /staleTimes:\s*\{\s*dynamic:\s*120\s*\}/);
});
