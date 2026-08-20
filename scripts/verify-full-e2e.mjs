import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectIdArgument = process.argv[2];
if (!projectIdArgument) throw new Error("Usage: node scripts/verify-full-e2e.mjs <temporary-e2e-project-id>");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const client = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const projectQuery = client.from("projects")
  .select("id,name,status,deleted_at,project_products(product_id,products(name))");
const { data: projectRows, error: projectError } = await projectQuery.eq("id", projectIdArgument).order("created_at", { ascending: false }).limit(2);
if (projectError || projectRows.length !== 1) throw new Error(`Expected exactly one temporary E2E Project (${projectError?.code ?? projectRows.length})`);
const project = projectRows[0];
if (project.deleted_at || !project.name.startsWith("[E2E] ")) throw new Error("Active temporary E2E Project not found");
const projectId = project.id;
assert.equal(project.status, "published");
const productIds = project.project_products.map((item) => item.product_id);
assert.equal(productIds.length, 2);

const { data: researchRuns, error: researchError } = await client.from("research_runs")
  .select("id,status,provider,search_provider,comparability_provider,input_signature,comparability,error_message")
  .eq("project_id", projectId).order("version", { ascending: false });
if (researchError || researchRuns.length === 0) throw new Error("Research chain missing");
const research = researchRuns.find((run) => run.status === "completed");
assert.ok(research);
assert.equal(research.provider, "zhipu");
assert.equal(research.search_provider, "zhipu");
assert.equal(research.comparability_provider, "deepseek");
assert.match(research.input_signature, /^[0-9a-f]{64}$/);
assert.ok(["comparable", "partially_comparable"].includes(research.comparability.status));
const { data: productResearch } = await client.from("product_research").select("product_id,sources").eq("research_run_id", research.id);
assert.equal(productResearch.length, productIds.length);
assert.ok(productResearch.every((item) => Array.isArray(item.sources) && item.sources.length > 0));

const { data: protocols, error: protocolError } = await client.from("protocols")
  .select("id,research_run_id,status,version,input_signature").eq("project_id", projectId).order("version", { ascending: false });
if (protocolError || protocols.length === 0) throw new Error("Protocol chain missing");
const protocol = protocols.find((item) => item.status === "locked");
assert.ok(protocol);
assert.equal(protocol.research_run_id, research.id);
assert.match(protocol.input_signature, /^[0-9a-f]{64}$/);
const [{ data: testCases }, { data: rubric }] = await Promise.all([
  client.from("test_cases").select("id,prompt").eq("protocol_id", protocol.id),
  client.from("rubric_dimensions").select("id,weight").eq("protocol_id", protocol.id),
]);
assert.ok(testCases.length > 0 && rubric.length > 0);
assert.ok(testCases.every((item) => item.prompt.trim().length > 0));
assert.equal(rubric.reduce((sum, item) => sum + Number(item.weight), 0), 100);

const { data: testRuns, error: testRunError } = await client.from("test_runs")
  .select("id,test_case_id,product_id,protocol_id,status").eq("protocol_id", protocol.id);
if (testRunError) throw new Error("TestRun chain missing");
assert.equal(testRuns.length, testCases.length * productIds.length);
assert.ok(testRuns.every((run) => run.protocol_id === protocol.id && run.status === "ready_for_review"));
assert.equal(new Set(testRuns.map((run) => `${run.test_case_id}:${run.product_id}`)).size, testRuns.length);
const { data: artifacts, error: artifactError } = await client.from("test_artifacts")
  .select("id,test_run_id,kind,mime_type,storage_path,sha256").in("test_run_id", testRuns.map((run) => run.id));
if (artifactError) throw new Error("Artifact chain missing");
assert.ok(testRuns.every((run) => artifacts.some((artifact) => artifact.test_run_id === run.id)));
assert.ok(artifacts.every((artifact) => artifact.storage_path.startsWith(`projects/${projectId}/runs/`) && /^[0-9a-f]{64}$/.test(artifact.sha256)));
assert.ok(artifacts.some((artifact) => artifact.mime_type.startsWith("image/")));
assert.ok(artifacts.some((artifact) => artifact.mime_type === "text/plain"));

const [{ data: samples }, { data: mappings }] = await Promise.all([
  client.from("blind_samples").select("id,label").eq("protocol_id", protocol.id),
  client.from("blind_mappings").select("blind_sample_id,product_id").eq("protocol_id", protocol.id),
]);
assert.equal(samples.length, productIds.length);
assert.equal(mappings.length, productIds.length);
assert.deepEqual(new Set(mappings.map((item) => item.product_id)), new Set(productIds));

const { data: judgeRuns, error: judgeRunError } = await client.from("judge_runs")
  .select("id,status,attempt,input_snapshot,input_signature,error_message").eq("protocol_id", protocol.id).order("attempt", { ascending: false });
if (judgeRunError || judgeRuns.length === 0) throw new Error("Judge chain missing");
const judge = judgeRuns.find((run) => run.status === "completed");
assert.ok(judge);
assert.ok(judgeRuns.some((run) => run.status === "failed"), "Expected preserved failed Judge attempt");
assert.match(judge.input_signature, /^[0-9a-f]{64}$/);
const blindInput = JSON.stringify(judge.input_snapshot);
for (const item of project.project_products) {
  assert.equal(blindInput.includes(item.product_id), false);
  assert.equal(blindInput.includes(item.products.name), false);
}
const [{ data: caseRuns }, { data: scores }] = await Promise.all([
  client.from("judge_case_runs").select("id,test_case_id,status,provider,model,prompt_version,input_signature").eq("judge_run_id", judge.id),
  client.from("judge_scores").select("id,judge_case_run_id,test_case_id,blind_sample_id,rubric_dimension_id,ai_score,confidence").eq("judge_run_id", judge.id),
]);
assert.equal(caseRuns.length, testCases.length);
assert.ok(caseRuns.every((run) => run.status === "completed" && /^[0-9a-f]{64}$/.test(run.input_signature)));
assert.equal(scores.length, testCases.length * samples.length * rubric.length);
for (const caseRun of caseRuns) {
  const runIds = new Set(testRuns.filter((run) => run.test_case_id === caseRun.test_case_id).map((run) => run.id));
  const caseArtifacts = artifacts.filter((artifact) => runIds.has(artifact.test_run_id));
  const expectedProvider = caseArtifacts.every((artifact) => artifact.mime_type === "text/plain") ? "deepseek" : "zhipu";
  assert.equal(caseRun.provider, expectedProvider);
  assert.ok(scores.filter((score) => score.test_case_id === caseRun.test_case_id).every((score) => score.judge_case_run_id === caseRun.id));
}

const { data: review, error: reviewError } = await client.from("review_sessions")
  .select("id,judge_run_id,status,locked_at,revealed_at").eq("project_id", projectId).single();
if (reviewError) throw new Error("Human Review chain missing");
assert.equal(review.judge_run_id, judge.id);
assert.equal(review.status, "revealed");
assert.ok(review.locked_at && review.revealed_at);
const [{ data: finalScores }, { data: reviewEvents }] = await Promise.all([
  client.from("review_final_scores").select("judge_score_id,ai_score,final_score,active_override_event_id").eq("review_session_id", review.id),
  client.from("human_review_events").select("id").eq("review_session_id", review.id),
]);
assert.equal(finalScores.length, scores.length);
assert.equal(reviewEvents.length, 0);
assert.ok(finalScores.every((score) => Number(score.final_score) === Number(score.ai_score) && score.active_override_event_id === null));
const canonical = [...finalScores].sort((a, b) => a.judge_score_id.localeCompare(b.judge_score_id))
  .map((score) => `${score.judge_score_id}:${Number(score.final_score).toFixed(1)}`).join(",");
const finalScoreSignature = createHash("sha256").update(canonical).digest("hex");

const { data: analyses, error: analysisError } = await client.from("result_analyses")
  .select("id,status,final_score_signature,output,provider,error_message").eq("review_session_id", review.id).order("attempt", { ascending: false });
if (analysisError || analyses.length === 0) throw new Error("ResultAnalysis chain missing");
const analysis = analyses.find((item) => item.status === "completed");
assert.ok(analysis);
assert.equal(analysis.final_score_signature, finalScoreSignature);
assert.equal(analysis.provider, "deepseek");
assert.ok(analysis.output?.winnerReason && analysis.output?.recommendationSummary);

const { data: reports, error: reportError } = await client.from("reports")
  .select("id,status,result_analysis_id,content,provider,error_message").eq("result_analysis_id", analysis.id).order("version", { ascending: false });
if (reportError || reports.length === 0) throw new Error("Report chain missing");
const report = reports.find((item) => item.status === "completed");
assert.ok(report);
assert.equal(report.provider, "zhipu");
assert.ok(reports.some((item) => item.status === "failed"), "Expected preserved failed Report attempt");
assert.ok(report.content?.title && report.content?.caseReviews?.length === testCases.length);
const { data: reportArtifacts } = await client.from("report_artifacts").select("artifact_id").eq("report_id", report.id);
assert.ok(reportArtifacts.length >= artifacts.length);

const { data: packs, error: packError } = await client.from("publish_packs")
  .select("id,status,report_id,content_ideas,selected_idea,community_post,discovery_provider,provider,input_signature").eq("project_id", projectId).order("version", { ascending: false });
if (packError || packs.length === 0) throw new Error("Publish chain missing");
const pack = packs.find((item) => item.status === "ready");
assert.ok(pack);
assert.equal(pack.report_id, report.id);
assert.equal(pack.discovery_provider, "deepseek");
assert.equal(pack.provider, "zhipu");
assert.ok(pack.content_ideas.length > 0 && pack.selected_idea?.id);
assert.ok(pack.community_post?.title && pack.community_post?.body && pack.community_post?.tags?.length);
assert.match(pack.input_signature, /^[0-9a-f]{64}$/);
const { data: publishLinks } = await client.from("publish_pack_artifacts")
  .select("artifact_id,display_order").eq("publish_pack_id", pack.id).order("display_order");
assert.ok(publishLinks.length > 0);
assert.deepEqual(publishLinks.map((item) => item.display_order), publishLinks.map((_, index) => index + 1));
assert.ok(publishLinks.every((link) => artifacts.some((artifact) => artifact.id === link.artifact_id && artifact.mime_type.startsWith("image/"))));

for (const [route, expected] of [["research", "可比性判断"], ["protocol", "已锁定"], ["test", "测试数据已确认"], ["review", "产品身份已揭晓"], ["results", "最终结果"], ["report", report.content.title], ["publish", pack.community_post.title]]) {
  const response = await fetch(`http://localhost:3000/projects/${projectId}/${route}`);
  assert.equal(response.ok, true, `${route} route failed`);
  assert.equal((await response.text()).includes(expected), true, `${route} route did not expose completed state`);
}

console.log(`Project: ${projectId}`);
console.log(`Dynamic matrix: ${productIds.length} products × ${testCases.length} cases × ${rubric.length} rubric dimensions`);
console.log(`Judge attempts: ${judgeRuns.length} (${judgeRuns.filter((run) => run.status === "failed").length} failed preserved)`);
console.log(`Report versions: ${reports.length} (${reports.filter((item) => item.status === "failed").length} failed preserved)`);
console.log(`Publish evidence: ${publishLinks.length} real image Artifacts`);
console.log("Create → Research → Protocol → TestRun → Judge → Review → Results → Report → Publish: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const index = value.indexOf("=");
    if (index < 1) return [];
    return [[value.slice(0, index).trim(), value.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
