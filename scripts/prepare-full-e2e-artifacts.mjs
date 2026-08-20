import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: node scripts/prepare-full-e2e-artifacts.mjs <projectId>");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const client = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: project, error: projectError } = await client.from("projects").select("name,deleted_at").eq("id", projectId).single();
if (projectError || project.deleted_at || !project.name.startsWith("[E2E] ")) throw new Error("Refusing to modify a non-active temporary E2E Project");
const { data: protocol, error: protocolError } = await client.from("protocols").select("id,status").eq("project_id", projectId).eq("status", "locked").order("version", { ascending: false }).limit(1).single();
if (protocolError || protocol.status !== "locked") throw new Error("Temporary E2E Project requires a locked Protocol");
const { data: runs, error: runsError } = await client.from("test_runs").select("id,test_case_id,product_id,status,created_at").eq("protocol_id", protocol.id).order("created_at");
if (runsError || runs.length === 0) throw new Error("Temporary E2E TestRun matrix is missing");
const firstCaseId = runs[0].test_case_id;
let uploaded = 0;
for (const run of runs) {
  const { count } = await client.from("test_artifacts").select("id", { count: "exact", head: true }).eq("test_run_id", run.id);
  if (count) continue;
  const isImageCase = run.test_case_id === firstCaseId;
  const bytes = isImageCase
    ? Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    : Buffer.from(`Temporary raw output fixture\nProduct: ${run.product_id}\nTestCase: ${run.test_case_id}\nThis evidence is unedited and exists only to verify the complete system flow.\n`, "utf8");
  const artifactId = randomUUID();
  const extension = isImageCase ? "png" : "txt";
  const mimeType = isImageCase ? "image/png" : "text/plain";
  const kind = isImageCase ? "image" : "text";
  const storagePath = `projects/${projectId}/runs/${run.id}/${artifactId}.${extension}`;
  const fileName = `e2e-${run.test_case_id}-${run.product_id}.${extension}`;
  const { error: uploadError } = await client.storage.from("benchmark-artifacts").upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`Temporary E2E upload failed (${uploadError.message})`);
  const { error: recordError } = await client.rpc("record_test_artifact", {
    p_test_run_id: run.id,
    p_artifact: {
      id: artifactId, kind, storagePath, fileName, mimeType, sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), metadata: { fixture: true, purpose: "temporary full-flow E2E" },
    },
    p_run_metadata: { generationTimeSeconds: 12, retryCount: 0, manuallyEdited: false, notes: "Isolated temporary E2E fixture" },
  });
  if (recordError) {
    await client.storage.from("benchmark-artifacts").remove([storagePath]);
    throw new Error(`Temporary E2E Artifact record failed (${recordError.code})`);
  }
  uploaded += 1;
}
const { error: finalizeError } = await client.rpc("finalize_test_execution", { p_project_id: projectId, p_protocol_id: protocol.id });
if (finalizeError) throw new Error(`Temporary E2E test finalization failed (${finalizeError.code})`);
console.log(JSON.stringify({ projectId, protocolId: protocol.id, runs: runs.length, uploaded, imageCaseId: firstCaseId }));

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const index = value.indexOf("=");
    if (index < 1) return [];
    return [[value.slice(0, index).trim(), value.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
