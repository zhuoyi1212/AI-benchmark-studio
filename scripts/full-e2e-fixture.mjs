import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [mode, projectId] = process.argv.slice(2);
if (mode !== "archive" || !projectId) throw new Error("Usage: node scripts/full-e2e-fixture.mjs archive <projectId>");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const client = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: project, error: readError } = await client.from("projects").select("name,deleted_at").eq("id", projectId).single();
if (readError || !project.name.startsWith("[E2E] ")) throw new Error("Refusing to archive a non-E2E Project");
if (!project.deleted_at) {
  const { error } = await client.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", projectId);
  if (error) throw new Error(`Fixture archive failed (${error.code})`);
}
console.log(JSON.stringify({ archivedProjectId: projectId }));

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const index = value.indexOf("=");
    if (index < 1) return [];
    return [[value.slice(0, index).trim(), value.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
