import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [envExample, gitignore, serverEnv, serverClient, repository, projectService, config, packageJson] = await Promise.all([
  read(".env.example"),
  read(".gitignore"),
  read("lib/env/server.ts"),
  read("lib/supabase/server.ts"),
  read("lib/repositories/projects.repository.ts"),
  read("lib/services/projects.service.ts"),
  read("supabase/config.toml"),
  read("package.json").then(JSON.parse),
]);

test("keeps elevated Supabase credentials server-only", () => {
  assert.match(envExample, /^NEXT_PUBLIC_SUPABASE_URL=/m);
  assert.match(envExample, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-/m);
  assert.match(envExample, /^SUPABASE_SECRET_KEY=replace-with-/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*(?:SECRET|SERVICE_ROLE)/);
  assert.match(serverEnv, /^import "server-only";/);
  assert.match(serverEnv, /process\.env\.SUPABASE_URL \?\? process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(serverEnv, /payload\.role === "service_role"/);
  assert.match(serverClient, /^import "server-only";/);
  assert.match(repository, /^import "server-only";/);
  assert.doesNotMatch(serverClient, /NEXT_PUBLIC_/);
});

test("ignores every local env file but commits the example", () => {
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test("uses a non-persistent typed server client", () => {
  assert.match(serverClient, /createClient<Database>/);
  assert.match(serverClient, /persistSession: false/);
  assert.match(serverClient, /autoRefreshToken: false/);
  assert.match(serverClient, /detectSessionInUrl: false/);
});

test("initializes reproducible local migrations", () => {
  assert.match(config, /project_id = "ai-benchmark-studio"/);
  assert.match(config, /\[db\.migrations\][\s\S]*enabled = true/);
  assert.match(config, /\[db\.seed\][\s\S]*sql_paths = \["\.\/seed\.sql"\]/);
});

test("pins the runtime SDK and CLI in the intended dependency groups", () => {
  assert.match(packageJson.dependencies["@supabase/supabase-js"], /^\^2\./);
  assert.match(packageJson.devDependencies.supabase, /^\^2\./);
});

test("derives project progress from TestRuns", () => {
  assert.match(projectService, /listProgressRows/);
  assert.match(projectService, /completed \/ total/);
  assert.doesNotMatch(projectService, /progress:\s*\{\s*completed:\s*\d/);
});
