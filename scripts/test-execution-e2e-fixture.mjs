import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const fixtureName = "[E2E Fixture] M6 Test Execution";
const mode = process.argv[2] ?? "setup";
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Missing Supabase server environment");
const client = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });

if (mode === "archive" || mode === "restore") {
  const projectId = process.argv[3];
  if (!projectId) throw new Error(`Usage: node scripts/test-execution-e2e-fixture.mjs ${mode} <projectId>`);
  const { data: project, error: readError } = await client.from("projects").select("id,name").eq("id", projectId).single();
  if (readError || project.name !== fixtureName) throw new Error(`Refusing to ${mode} a non-fixture project`);
  const deletedAt = mode === "archive" ? new Date().toISOString() : null;
  const { error } = await client.from("projects").update({ deleted_at: deletedAt }).eq("id", projectId);
  if (error) throw new Error(`Fixture ${mode} failed (${error.code})`);
  console.log(JSON.stringify({ [`${mode}dProjectId`]: projectId }));
} else if (mode === "setup") {
  const { data: projectId, error: projectError } = await client.rpc("create_benchmark_project", {
    p_name: fixtureName,
    p_intent: "Verify the M6 private Storage and TestArtifact persistence path without creating product benchmark evidence.",
    p_products: [{ name: "Storage Fixture Product", officialUrl: "https://example.com" }],
  });
  if (projectError) throw new Error(`Fixture project creation failed (${projectError.code})`);

  const { data: productLinks, error: productsError } = await client
    .from("project_products")
    .select("product_id")
    .eq("project_id", projectId);
  if (productsError || productLinks.length !== 1) throw new Error("Fixture ProjectProduct was not created");
  const productId = productLinks[0].product_id;

  const { data: researchRunId, error: beginError } = await client.rpc("begin_product_research", {
    p_project_id: projectId,
    p_input_snapshot: { fixture: true, purpose: "M6 Test Execution E2E" },
    p_input_signature: "fixture-m6-research-input",
  });
  if (beginError) throw new Error(`Fixture ResearchRun start failed (${beginError.code})`);

  const { error: productResearchError } = await client.from("product_research").insert({
    project_id: projectId,
    research_run_id: researchRunId,
    product_id: productId,
    positioning: "Development-only fixture product.",
    target_users: ["E2E test"],
    capabilities: ["Plain text output"],
    key_features: ["Deterministic fixture"],
    pricing: null,
    official_best_practices: [],
    limitations: ["Not a real benchmark product"],
    sources: [{
      title: "Fixture source",
      url: "https://example.com",
      sourceType: "official_website",
      snippet: "Development fixture only.",
      siteName: "Example",
      publishedAt: null,
    }],
  });
  if (productResearchError) throw new Error(`Fixture ProductResearch insert failed (${productResearchError.code})`);

  const emptyUsage = { inputTokens: null, outputTokens: null, latencyMs: 0, estimatedCost: null };
  const { error: completeError } = await client.rpc("complete_product_research", {
    p_research_run_id: researchRunId,
    p_search_provider: "zhipu",
    p_search_model: "fixture-no-provider-call",
    p_search_prompt_version: "fixture.v1",
    p_synthesis_provider: "zhipu",
    p_synthesis_model: "fixture-no-provider-call",
    p_synthesis_prompt_version: "fixture.v1",
    p_synthesis_usage: emptyUsage,
    p_comparability_provider: "deepseek",
    p_comparability_model: "fixture-no-provider-call",
    p_comparability_prompt_version: "fixture.v1",
    p_comparability_usage: emptyUsage,
    p_comparability: {
      status: "comparable",
      score: 1,
      reason: "Single development fixture validates storage transport, not product quality.",
      commonCapabilities: ["Plain text output"],
      warnings: ["Never use this fixture as benchmark evidence."],
    },
  });
  if (completeError) throw new Error(`Fixture ResearchRun completion failed (${completeError.code})`);

  const protocol = {
    title: "M6 Test Execution E2E Protocol",
    goal: "Verify real file upload, private Storage, immutable Artifact metadata, refresh persistence, and finalization.",
    testMode: "standardized",
    rules: [
      { id: "same-input", text: "Use the same fixture input." },
      { id: "same-prompt", text: "Use the exact fixture Prompt." },
      { id: "single-generation", text: "Create the fixture output once." },
      { id: "no-editing", text: "Do not edit the fixture output." },
      { id: "complete-upload", text: "Upload the complete fixture output." },
    ],
    testCases: [{
      position: 1,
      title: "Plain text Artifact transport",
      objective: "Verify the M6 evidence transport without claiming product performance.",
      prompt: "Return the exact text: M6 storage transport verified.",
      inputDescription: null,
      inputArtifacts: [],
      observationFocus: ["Exact text preservation"],
      executionRules: ["Use only the development fixture file"],
    }],
    rubric: [
      { position: 1, name: "Transport integrity", weight: 50, description: "File bytes remain intact.", scoringStandard: { excellent: "Hash matches.", good: "Readable.", acceptable: "Stored with minor metadata issue.", poor: "Missing or corrupted." } },
      { position: 2, name: "Lineage integrity", weight: 50, description: "Artifact links to its TestRun.", scoringStandard: { excellent: "Complete lineage.", good: "Lineage readable.", acceptable: "Minor metadata gap.", poor: "Lineage missing." } },
    ],
  };
  const { data: protocolId, error: protocolError } = await client.rpc("create_protocol_draft", {
    p_project_id: projectId,
    p_research_run_id: researchRunId,
    p_protocol: protocol,
    p_generation_provider: "deepseek",
    p_generation_model: "fixture-no-provider-call",
    p_prompt_version: "fixture.v1",
    p_input_signature: "fixture-m6-protocol-input",
    p_usage: emptyUsage,
  });
  if (protocolError) throw new Error(`Fixture Protocol creation failed (${protocolError.code})`);
  const { error: lockError } = await client.rpc("lock_protocol", { p_protocol_id: protocolId });
  if (lockError) throw new Error(`Fixture Protocol lock failed (${lockError.code})`);
  console.log(JSON.stringify({ projectId, protocolId }));
} else {
  throw new Error("Mode must be setup, archive, or restore");
}

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
