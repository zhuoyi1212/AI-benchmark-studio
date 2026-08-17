import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:judge -- <projectId>");

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client
  .from("projects")
  .select("id,status,deleted_at,project_products(product_id,products(id,name))")
  .eq("id", projectId)
  .single();
if (projectError || project.deleted_at) throw new Error("Active verification project not found");

const { data: protocols, error: protocolError } = await client.from("protocols").select("id,version,status").eq("project_id", projectId).order("version", { ascending: false });
if (protocolError || protocols.length === 0) throw new Error("No Protocol found");
const protocol = protocols[0];
assert.equal(protocol.status, "locked");
const { error: blindSafetyError } = await client.rpc("assert_blind_protocol_safe", {
  p_project_id: projectId,
  p_protocol_id: protocol.id,
});
if (blindSafetyError) throw new Error(`Blind Protocol safety guard failed: ${blindSafetyError.message}`);

const [{ data: samples }, { data: testCases }, { data: rubric }, { data: judgeRuns }] = await Promise.all([
  client.from("blind_samples").select("id,label").eq("protocol_id", protocol.id),
  client.from("test_cases").select("id").eq("protocol_id", protocol.id),
  client.from("rubric_dimensions").select("id").eq("protocol_id", protocol.id),
  client.from("judge_runs").select("id,status,attempt,input_snapshot,input_signature,error_message").eq("protocol_id", protocol.id).order("attempt", { ascending: false }),
]);
assert.ok(judgeRuns.length > 0, "No JudgeRun found");
const run = judgeRuns[0];
assert.equal(run.status, "completed");
assert.match(run.input_signature, /^[0-9a-f]{64}$/);

const snapshot = JSON.stringify(run.input_snapshot);
for (const link of project.project_products) {
  assert.equal(snapshot.includes(link.product_id), false, "Product ID leaked into JudgeRun input snapshot");
  assert.equal(snapshot.includes(link.products.name), false, "Product name leaked into JudgeRun input snapshot");
}
assert.equal(snapshot.includes("productId"), false);
assert.equal(snapshot.includes("product_id"), false);

const [{ data: caseRuns, error: caseError }, { data: scores, error: scoreError }, { data: testRuns, error: testRunError }] = await Promise.all([
  client.from("judge_case_runs").select("id,test_case_id,status,provider,model,prompt_version,input_signature").eq("judge_run_id", run.id),
  client.from("judge_scores").select("id,judge_case_run_id,test_case_id,blind_sample_id,rubric_dimension_id,ai_score,reason,evidence,confidence,model,prompt_version").eq("judge_run_id", run.id),
  client.from("test_runs").select("id,test_case_id").eq("protocol_id", protocol.id),
]);
if (caseError || scoreError || testRunError) throw new Error("Judge verification query failed");
assert.equal(caseRuns.length, testCases.length);
assert.equal(new Set(caseRuns.map((caseRun) => caseRun.test_case_id)).size, testCases.length);
assert.ok(caseRuns.every((caseRun) => caseRun.status === "completed" && /^[0-9a-f]{64}$/.test(caseRun.input_signature)));
assert.equal(scores.length, testCases.length * samples.length * rubric.length);
assert.equal(new Set(scores.map((score) => `${score.test_case_id}:${score.blind_sample_id}:${score.rubric_dimension_id}`)).size, scores.length);

const { data: artifacts, error: artifactError } = await client.from("test_artifacts").select("test_run_id,mime_type").in("test_run_id", testRuns.map((testRun) => testRun.id));
if (artifactError) throw new Error("Artifact modality verification query failed");
for (const caseRun of caseRuns) {
  const caseTestRunIds = new Set(testRuns.filter((testRun) => testRun.test_case_id === caseRun.test_case_id).map((testRun) => testRun.id));
  const caseArtifacts = artifacts.filter((artifact) => caseTestRunIds.has(artifact.test_run_id));
  assert.ok(caseArtifacts.length > 0);
  const expectedProvider = caseArtifacts.every((artifact) => artifact.mime_type === "text/plain") ? "deepseek" : "zhipu";
  assert.equal(caseRun.provider, expectedProvider);
  const caseScores = scores.filter((score) => score.test_case_id === caseRun.test_case_id);
  assert.ok(caseScores.every((score) => score.judge_case_run_id === caseRun.id && score.model === caseRun.model && score.prompt_version === caseRun.prompt_version));
}
for (const score of scores) {
  assert.ok(score.ai_score >= 0 && score.ai_score <= 10);
  assert.ok(score.confidence >= 0 && score.confidence <= 1);
  assert.ok(score.reason.trim().length > 0);
  assert.ok(Array.isArray(score.evidence) && score.evidence.length > 0);
}

const { error: immutableScoreError } = await client
  .from("judge_scores")
  .update({ ai_score: scores[0].ai_score })
  .eq("id", scores[0].id);
assert.ok(immutableScoreError, "JudgeScore update unexpectedly succeeded");

const response = await fetch(`http://localhost:3000/projects/${projectId}/review`);
assert.equal(response.ok, true);
const html = await response.text();
for (const link of project.project_products) {
  assert.equal(html.includes(link.product_id), false, "Product ID leaked into Blind Review HTML");
  assert.equal(html.includes(link.products.name), false, "Product name leaked into Blind Review HTML");
}
for (const sample of samples) assert.equal(html.includes(sample.label), true);

console.log(`Protocol: v${protocol.version}`);
console.log(`JudgeRun attempt: ${run.attempt}`);
console.log(`Case routes: ${caseRuns.length}`);
console.log(`Immutable scores: ${scores.length}`);
console.log("Judge routing, score matrix, Protocol safety, and Blind leakage: verified");

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
