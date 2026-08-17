import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
const requireArtifact = process.argv.includes("--require-artifact");
if (!projectId) throw new Error("Usage: npm run verify:test-execution -- <projectId> [--require-artifact]");

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client
  .from("projects")
  .select("id,status,deleted_at,project_products(product_id)")
  .eq("id", projectId)
  .single();
if (projectError) throw new Error(`Project verification query failed (${projectError.code})`);

const { data: protocols, error: protocolError } = await client
  .from("protocols")
  .select("id,version,status")
  .eq("project_id", projectId)
  .order("version", { ascending: false });
if (protocolError || protocols.length === 0) throw new Error("No Protocol found for Test Execution verification");
const protocol = protocols[0];
assert.equal(protocol.status, "locked");

const [{ data: testCases, error: casesError }, { data: runs, error: runsError }] = await Promise.all([
  client.from("test_cases").select("id").eq("protocol_id", protocol.id),
  client.from("test_runs").select("id,project_id,protocol_id,test_case_id,product_id,status,generation_time_seconds,retry_count,manually_edited,notes").eq("protocol_id", protocol.id),
]);
if (casesError || runsError) throw new Error("TestRun matrix verification query failed");
const expectedCount = testCases.length * project.project_products.length;
assert.ok(expectedCount > 0);
assert.equal(runs.length, expectedCount);
assert.equal(new Set(runs.map((run) => `${run.test_case_id}:${run.product_id}`)).size, expectedCount);
assert.ok(runs.every((run) => run.project_id === projectId && run.protocol_id === protocol.id));

const { data: artifacts, error: artifactError } = await client
  .from("test_artifacts")
  .select("id,test_run_id,bucket_id,storage_path,file_name,mime_type,size_bytes,sha256")
  .in("test_run_id", runs.map((run) => run.id));
if (artifactError) throw new Error(`Artifact verification query failed (${artifactError.code})`);
if (requireArtifact) assert.ok(artifacts.length > 0, "Expected at least one real Artifact");
const runIds = new Set(runs.map((run) => run.id));
for (const artifact of artifacts) {
  assert.ok(runIds.has(artifact.test_run_id));
  assert.equal(artifact.bucket_id, "benchmark-artifacts");
  assert.match(artifact.storage_path, new RegExp(`^projects/${projectId}/runs/${artifact.test_run_id}/`));
  assert.ok(artifact.size_bytes > 0 && artifact.sha256);
  const { data: signed, error: signedError } = await client.storage.from("benchmark-artifacts").createSignedUrl(artifact.storage_path, 60);
  if (signedError) throw new Error("Signed Artifact URL creation failed");
  const response = await fetch(signed.signedUrl);
  assert.equal(response.ok, true);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, artifact.size_bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
}
if (requireArtifact) assert.ok(runs.every((run) => run.status === "ready_for_review"));

console.log(`Protocol: v${protocol.version} (${protocol.status})`);
console.log(`TestRun matrix: ${runs.length}/${expectedCount}`);
console.log(`Artifacts: ${artifacts.length}`);
console.log(`Project state: ${project.status}${project.deleted_at ? " (fixture archived)" : ""}`);
console.log("Artifact lineage and stored bytes: verified");

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
