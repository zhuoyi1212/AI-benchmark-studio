import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:result-analysis -- <projectId>");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client.from("projects").select("id,status,deleted_at").eq("id", projectId).single();
if (projectError || project.deleted_at || project.status !== "completed") throw new Error("Active revealed verification project not found");
const { data: session, error: sessionError } = await client.from("review_sessions").select("id,protocol_id,status").eq("project_id", projectId).single();
if (sessionError || session.status !== "revealed") throw new Error("Revealed ReviewSession not found");

const [{ data: finalScores }, { data: analyses, error: analysisError }] = await Promise.all([
  client.from("review_final_scores").select("judge_score_id,final_score").eq("review_session_id", session.id),
  client.from("result_analyses").select("id,status,attempt,final_score_signature,input_snapshot,winner_product_id,output,provider,model,prompt_version,input_tokens,output_tokens,latency_ms").eq("review_session_id", session.id).order("attempt", { ascending: false }),
]);
if (analysisError || analyses.length === 0) throw new Error("ResultAnalysis not found");
const analysis = analyses[0];
assert.equal(analysis.status, "completed");
assert.equal(analysis.provider, "deepseek");
assert.notEqual(analysis.model, "deepseek-chat");
assert.notEqual(analysis.model, "deepseek-reasoner");
assert.match(analysis.prompt_version, /^result-analysis\.v\d+$/);
assert.ok(analysis.winner_product_id);
assert.ok(analysis.output?.winnerReason);
assert.ok(Array.isArray(analysis.output?.products) && analysis.output.products.length > 0);
assert.ok(analysis.input_snapshot?.project && analysis.input_snapshot?.protocol && analysis.input_snapshot?.review);
assert.ok(Array.isArray(analysis.input_snapshot?.products) && analysis.input_snapshot.products.length > 0);
assert.ok(analysis.input_snapshot.products.every((product) => product.scores.length > 0 && product.artifacts.length > 0));

const canonical = [...finalScores]
  .sort((left, right) => left.judge_score_id.localeCompare(right.judge_score_id))
  .map((score) => `${score.judge_score_id}:${Number(score.final_score).toFixed(1)}`)
  .join(",");
const signature = createHash("sha256").update(canonical).digest("hex");
assert.equal(analysis.final_score_signature, signature);
assert.equal(analysis.input_snapshot.review.finalScoreSignature, signature);

const { data: sameAnalysisId, error: beginError } = await client.rpc("begin_result_analysis", {
  p_project_id: projectId,
  p_review_session_id: session.id,
});
if (beginError) throw new Error("Idempotent ResultAnalysis begin failed");
assert.equal(sameAnalysisId, analysis.id);
const { error: immutableError } = await client.from("result_analyses").update({ output: analysis.output }).eq("id", analysis.id);
assert.ok(immutableError, "Completed ResultAnalysis update unexpectedly succeeded");

const response = await fetch(`http://localhost:3000/projects/${projectId}/results`);
assert.equal(response.ok, true);
const html = await response.text();
assert.equal(html.includes(analysis.output.winnerReason), true);
assert.equal(html.includes("评分来源 · AI Judge + 人工复核"), true);

console.log(`Final Score signature: ${signature.slice(0, 12)}…`);
console.log(`ResultAnalysis attempt: ${analysis.attempt}`);
console.log(`Route: ${analysis.model} · ${analysis.prompt_version}`);
console.log("Revealed input, deterministic winner, signature binding, and immutability: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) return [];
    return [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
