import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: npm run verify:blind-layer -- <projectId>");

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

const { data: protocols, error: protocolError } = await client
  .from("protocols")
  .select("id,version,status")
  .eq("project_id", projectId)
  .order("version", { ascending: false });
if (protocolError || protocols.length === 0) throw new Error("No Protocol found");
const protocol = protocols[0];
assert.equal(protocol.status, "locked");

const response = await fetch(`http://localhost:3000/projects/${projectId}/review`);
assert.equal(response.ok, true, `Blind Review route returned ${response.status}`);
const html = await response.text();

const first = await snapshot();
assert.equal(first.samples.length, project.project_products.length);
assert.equal(first.mappings.length, project.project_products.length);
assert.deepEqual(first.samples.map((sample) => sample.label), first.samples.map((_, index) => `Sample ${String.fromCharCode(65 + index)}`));
assert.equal(new Set(first.mappings.map((mapping) => mapping.blind_sample_id)).size, first.samples.length);
assert.equal(new Set(first.mappings.map((mapping) => mapping.product_id)).size, first.samples.length);

const { error: initializeError } = await client.rpc("initialize_blind_layer", {
  p_project_id: projectId,
  p_protocol_id: protocol.id,
});
if (initializeError) throw new Error(`Blind Layer idempotency call failed (${initializeError.code})`);
const second = await snapshot();
assert.deepEqual(second.samples, first.samples, "Blind Sample IDs or labels changed after repeat initialization");
assert.deepEqual(second.mappings, first.mappings, "Blind Mapping changed after repeat initialization");

for (const link of project.project_products) {
  assert.equal(html.includes(link.product_id), false, "Product ID leaked into Blind Review HTML");
  assert.equal(html.includes(link.products.name), false, "Product name leaked into Blind Review HTML");
}
for (const sample of first.samples) assert.equal(html.includes(sample.label), true);
assert.equal(html.includes("blind_mappings"), false);
assert.equal(html.includes("product_id"), false);

console.log(`Protocol: v${protocol.version}`);
console.log(`Anonymous samples: ${first.samples.length}`);
console.log("Stable mapping: verified");
console.log("Blind Review HTML identity leakage: none");

async function snapshot() {
  const [{ data: samples, error: sampleError }, { data: mappings, error: mappingError }] = await Promise.all([
    client.from("blind_samples").select("id,label").eq("protocol_id", protocol.id).order("label"),
    client.from("blind_mappings").select("blind_sample_id,product_id").eq("protocol_id", protocol.id).order("blind_sample_id"),
  ]);
  if (sampleError || mappingError) throw new Error("Blind Layer snapshot query failed");
  return { samples, mappings };
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
