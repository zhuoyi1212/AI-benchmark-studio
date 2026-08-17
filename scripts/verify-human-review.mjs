import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:human-review -- <projectId>");

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
assert.equal(project.status, "completed");

const { data: sessions, error: sessionError } = await client
  .from("review_sessions")
  .select("id,judge_run_id,status,locked_at,revealed_at")
  .eq("project_id", projectId);
if (sessionError || sessions.length !== 1) throw new Error("Expected one ReviewSession");
const session = sessions[0];
assert.equal(session.status, "revealed");
assert.ok(session.locked_at && session.revealed_at);

const [{ data: scores }, { data: finalScores }, { data: events }, { data: mappings, error: mappingError }] = await Promise.all([
  client.from("judge_scores").select("id,ai_score").eq("judge_run_id", session.judge_run_id),
  client.from("review_final_scores").select("judge_score_id,ai_score,final_score,active_override_event_id").eq("review_session_id", session.id),
  client.from("human_review_events").select("id,judge_score_id,action,override_score,reason,target_event_id,score_revision,event_sequence").eq("review_session_id", session.id).order("event_sequence"),
  client.rpc("get_revealed_review_mapping", { p_review_session_id: session.id }),
]);
if (mappingError) throw new Error("Revealed mapping query failed");
assert.equal(finalScores.length, scores.length);
assert.ok(finalScores.every((score) => Number(score.final_score) === Number(score.ai_score) && score.active_override_event_id === null));
assert.ok(events.length >= 2);
const lastTwo = events.slice(-2);
assert.equal(lastTwo[0].action, "override");
assert.ok(lastTwo[0].reason?.includes("E2E 复核"));
assert.equal(lastTwo[1].action, "revert");
assert.equal(lastTwo[1].target_event_id, lastTwo[0].id);
assert.equal(lastTwo[1].score_revision, lastTwo[0].score_revision + 1);
assert.equal(mappings.length, project.project_products.length);
assert.deepEqual(new Set(mappings.map((mapping) => mapping.product_id)), new Set(project.project_products.map((link) => link.product_id)));

const { error: lockedOverrideError } = await client.rpc("append_human_override", {
  p_project_id: projectId,
  p_review_session_id: session.id,
  p_judge_score_id: scores[0].id,
  p_override_score: Number(scores[0].ai_score),
  p_reason: "This write must be rejected after lock.",
});
assert.ok(lockedOverrideError, "Human override unexpectedly succeeded after lock");
const { error: immutableScoreError } = await client.from("judge_scores").update({ ai_score: scores[0].ai_score }).eq("id", scores[0].id);
assert.ok(immutableScoreError, "AI Score update unexpectedly succeeded");
const { error: immutableEventError } = await client.from("human_review_events").update({ reason: lastTwo[0].reason }).eq("id", lastTwo[0].id);
assert.ok(immutableEventError, "HumanReviewEvent update unexpectedly succeeded");

const response = await fetch(`http://localhost:3000/projects/${projectId}/review`);
assert.equal(response.ok, true);
const html = await response.text();
for (const mapping of mappings) {
  assert.equal(html.includes(mapping.sample_label), true);
  assert.equal(html.includes(mapping.product_name), true);
}

console.log(`ReviewSession: ${session.status}`);
console.log(`Final Scores: ${finalScores.length} (0 active overrides)`);
console.log(`Audit events: ${events.length}`);
console.log(`Revealed mappings: ${mappings.length}`);
console.log("Human Review persistence, immutability, lock, and reveal: verified");

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
