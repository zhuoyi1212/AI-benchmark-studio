import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:protocol -- <projectId>");

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: protocols, error: protocolError } = await client
  .from("protocols")
  .select("id,project_id,research_run_id,version,status,test_mode,generation_provider,generation_model,prompt_version,input_signature,locked_at")
  .eq("project_id", projectId)
  .order("version", { ascending: false });
if (protocolError) throw new Error(`Protocol verification query failed (${protocolError.code})`);
assert.ok(protocols.length > 0, "No Protocol versions found");
const current = protocols[0];
assert.equal(current.status, "locked");
assert.equal(current.test_mode, "standardized");
assert.ok(current.generation_provider && current.generation_model && current.prompt_version && current.input_signature);
assert.ok(current.locked_at);

const [{ data: sourceRun, error: sourceError }, { data: testCases, error: casesError }, { data: rubric, error: rubricError }] = await Promise.all([
  client.from("research_runs").select("id,project_id,status,comparability").eq("id", current.research_run_id).single(),
  client.from("test_cases").select("id,position,title,prompt,observation_focus,execution_rules").eq("protocol_id", current.id).order("position"),
  client.from("rubric_dimensions").select("id,position,name,weight,scoring_standard").eq("protocol_id", current.id).order("position"),
]);
if (sourceError || casesError || rubricError) throw new Error("Protocol lineage verification query failed");
assert.equal(sourceRun.project_id, projectId);
assert.equal(sourceRun.status, "completed");
assert.ok(["comparable", "partially_comparable"].includes(sourceRun.comparability?.status));
assert.ok(testCases.length > 0);
assert.ok(testCases.every((item, index) => item.position === index + 1 && item.prompt && Array.isArray(item.observation_focus) && Array.isArray(item.execution_rules)));
assert.ok(rubric.length > 0);
assert.equal(rubric.reduce((total, item) => total + Number(item.weight), 0), 100);
assert.ok(rubric.every((item, index) => item.position === index + 1 && item.scoring_standard?.excellent && item.scoring_standard?.poor));

console.log(`Protocol versions: ${protocols.length}`);
console.log(`Current Protocol: v${current.version} (${current.status})`);
console.log(`TestCases: ${testCases.length}`);
console.log(`Rubric dimensions: ${rubric.length}, total weight 100`);
console.log("ResearchRun lineage: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) return [];
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    return [[key, value]];
  }));
}
