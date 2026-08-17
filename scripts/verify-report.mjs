import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:report -- <projectId>");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client.from("projects").select("id,status,deleted_at").eq("id", projectId).single();
if (projectError || project.deleted_at || project.status !== "reported") throw new Error("Active reported verification project not found");
const { data: analysis, error: analysisError } = await client.from("result_analyses").select("id,protocol_id,review_session_id,status,final_score_signature").eq("project_id", projectId).eq("status", "completed").order("created_at", { ascending: false }).limit(1).single();
if (analysisError) throw new Error("Completed ResultAnalysis not found");
const { data: reports, error: reportsError } = await client.from("reports").select("id,status,version,result_analysis_id,content,provider,model,prompt_version,input_tokens,output_tokens,latency_ms,started_at,completed_at").eq("result_analysis_id", analysis.id).order("version", { ascending: false });
if (reportsError || reports.length === 0) throw new Error("Report not found");
const report = reports[0];
assert.equal(report.status, "completed");
assert.equal(report.result_analysis_id, analysis.id);
assert.equal(report.provider, "zhipu");
assert.match(report.prompt_version, /^report\.v\d+$/);
assert.ok(report.model && report.model !== "deepseek-chat" && report.model !== "deepseek-reasoner");
assert.ok(report.started_at && report.completed_at);
assert.ok(report.content?.title && report.content?.tldr && report.content?.methodologySummary);

const [{ data: testCases }, { data: projectProducts }, { data: evidenceLinks, error: evidenceError }] = await Promise.all([
  client.from("test_cases").select("id").eq("protocol_id", analysis.protocol_id),
  client.from("project_products").select("product_id").eq("project_id", projectId),
  client.from("report_artifacts").select("report_id,artifact_id,evidence_role,caption").eq("report_id", report.id),
]);
if (evidenceError || evidenceLinks.length === 0) throw new Error("Report Artifact evidence not found");
assert.deepEqual(new Set(report.content.caseReviews.map((item) => item.testCaseId)), new Set(testCases.map((item) => item.id)));
for (const item of report.content.caseReviews) {
  assert.deepEqual(new Set(item.productAnalyses.map((product) => product.productId)), new Set(projectProducts.map((product) => product.product_id)));
}
assert.ok(evidenceLinks.every((item) => item.evidence_role === "case_output"));

const { data: sameReportId, error: beginError } = await client.rpc("begin_report", { p_project_id: projectId, p_result_analysis_id: analysis.id });
if (beginError) throw new Error("Idempotent Report begin failed");
assert.equal(sameReportId, report.id);
const { error: immutableReportError } = await client.from("reports").update({ content: report.content }).eq("id", report.id);
assert.ok(immutableReportError, "Completed Report update unexpectedly succeeded");
const { error: immutableEvidenceError } = await client.from("report_artifacts").update({ caption: evidenceLinks[0].caption }).eq("report_id", report.id).eq("artifact_id", evidenceLinks[0].artifact_id);
assert.ok(immutableEvidenceError, "Completed Report evidence update unexpectedly succeeded");

const response = await fetch(`http://localhost:3000/projects/${projectId}/report`);
assert.equal(response.ok, true);
const html = await response.text();
assert.equal(html.includes(report.content.title), true);
assert.equal(html.includes("Raw Artifact"), true);
assert.equal(html.includes("报告已生成"), true);

console.log(`Report version: ${report.version}`);
console.log(`Route: ${report.model} · ${report.prompt_version}`);
console.log(`Linked raw Artifacts: ${evidenceLinks.length}`);
console.log("Current analysis binding, exact coverage, immutable evidence, and dynamic page: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) return [];
    return [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
