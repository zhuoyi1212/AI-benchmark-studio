import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:research -- <projectId>");

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client
  .from("projects")
  .select("id,status,project_products(product_id,submitted_official_url)")
  .eq("id", projectId)
  .single();
if (projectError) throw new Error(`Project verification query failed (${projectError.code})`);
assert.equal(project.status, "research_ready");
assert.ok(project.project_products.length >= 1 && project.project_products.length <= 3);

const { data: runs, error: runsError } = await client
  .from("research_runs")
  .select("id,version,status,provider,model,prompt_version,search_provider,search_model,search_prompt_version,comparability_provider,comparability_model,comparability_prompt_version,comparability")
  .eq("project_id", projectId)
  .order("version", { ascending: false });
if (runsError) throw new Error(`ResearchRun verification query failed (${runsError.code})`);
const latestCompleted = runs.find((run) => run.status === "completed");
assert.ok(latestCompleted, "No completed ResearchRun");
assert.equal(latestCompleted.search_provider, "zhipu");
assert.equal(latestCompleted.provider, "zhipu");
assert.equal(latestCompleted.comparability_provider, "deepseek");
for (const value of [latestCompleted.search_model, latestCompleted.search_prompt_version, latestCompleted.model, latestCompleted.prompt_version, latestCompleted.comparability_model, latestCompleted.comparability_prompt_version]) {
  assert.ok(value, "Missing routed ResearchRun metadata");
}
assert.ok(["comparable", "partially_comparable", "not_comparable"].includes(latestCompleted.comparability?.status));

const { data: researchRows, error: researchError } = await client
  .from("product_research")
  .select("product_id,sources")
  .eq("research_run_id", latestCompleted.id);
if (researchError) throw new Error(`ProductResearch verification query failed (${researchError.code})`);
assert.equal(researchRows.length, project.project_products.length);

const officialDomains = new Map(project.project_products.map((item) => [item.product_id, getHostname(item.submitted_official_url)]));
for (const row of researchRows) {
  assert.ok(Array.isArray(row.sources) && row.sources.length > 0, "ProductResearch has no sources");
  const officialDomain = officialDomains.get(row.product_id);
  if (officialDomain) {
    assert.ok(row.sources.every((source) => isDomainOrSubdomain(source.url, officialDomain)), "ProductResearch contains a non-official source");
  }
}

console.log(`Project status: ${project.status}`);
console.log(`ResearchRuns: ${runs.length}`);
console.log(`Latest completed version: ${latestCompleted.version}`);
console.log(`ProductResearch rows: ${researchRows.length}`);
console.log("Source lineage: verified");

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

function getHostname(value) {
  if (!value) return null;
  return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
}

function isDomainOrSubdomain(value, domain) {
  const hostname = getHostname(value);
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
