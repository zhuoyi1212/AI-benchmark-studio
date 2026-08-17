import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: node scripts/prepare-publish-e2e-fixture.mjs <projectId>");
const fixtureName = "[E2E Fixture] M6 Test Execution";
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase server environment");
const client = createClient(url, key, { auth: { persistSession: false } });

const { data: project, error: projectError } = await client.from("projects").select("id,name,status,deleted_at").eq("id", projectId).single();
if (projectError || project.name !== fixtureName || project.deleted_at) throw new Error("Refusing to modify a non-active fixture project");
const { data: run, error: runError } = await client.from("test_runs").select("id,protocol_id").eq("project_id", projectId).limit(1).single();
if (runError) throw new Error("Fixture TestRun not found");

const fileName = "publish-evidence-fixture.png";
let { data: existing } = await client.from("test_artifacts").select("id,storage_path").eq("test_run_id", run.id).eq("file_name", fileName).maybeSingle();
if (!existing) {
  const artifactId = randomUUID();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const storagePath = `projects/${projectId}/runs/${run.id}/${artifactId}.png`;
  const { error: uploadError } = await client.storage.from("benchmark-artifacts").upload(storagePath, bytes, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`Fixture image upload failed (${uploadError.message})`);
  const { error: artifactError } = await client.from("test_artifacts").insert({
    id: artifactId, test_run_id: run.id, kind: "image", bucket_id: "benchmark-artifacts", storage_path: storagePath,
    file_name: fileName, mime_type: "image/png", size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), metadata: { fixture: true, purpose: "M12 Publish screenshot evidence" },
  });
  if (artifactError) throw new Error(`Fixture TestArtifact insert failed (${artifactError.code})`);
  existing = { id: artifactId, storage_path: storagePath };
}

console.log(JSON.stringify({ projectId, imageArtifactId: existing.id }));

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("="); if (separator < 1) return [];
    return [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
