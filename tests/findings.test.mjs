import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [migration, schema, repository, service, page, editor, testPage, publishService, publishRepository] = await Promise.all([
  read("supabase/migrations/20260920060000_quick_findings_flow.sql"),
  read("lib/ai/schemas/findings.schemas.ts"),
  read("lib/repositories/findings.repository.ts"),
  read("lib/services/findings.service.ts"),
  read("app/projects/[projectId]/results/page.tsx"),
  read("app/projects/[projectId]/results/findings-editor.tsx"),
  read("app/projects/[projectId]/test/page.tsx"),
  read("lib/services/publish.service.ts"),
  read("lib/repositories/publish.repository.ts"),
]);

test("persists Findings independently from Judge, Review, Result Analysis, and Report", () => {
  assert.match(migration, /create table public\.experience_findings/);
  assert.match(migration, /protocol_id uuid not null/);
  assert.match(migration, /human_output jsonb/);
  assert.match(migration, /human_confirmed_at timestamptz/);
  assert.match(migration, /Findings requires a complete Artifact-backed TestRun matrix/);
  const findingsFunctions = migration.slice(migration.indexOf("create or replace function public.begin_experience_findings"), migration.indexOf("alter table public.publish_packs"));
  assert.doesNotMatch(findingsFunctions, /review_sessions|result_analyses|reports/);
  assert.match(migration, /Older builds initialized Blind Layer/);
});

test("Findings are evidence-backed observations rather than scores", () => {
  assert.match(schema, /z\.enum\(\["good", "neutral", "problem"\]\)/);
  assert.match(schema, /evidenceArtifactIds/);
  assert.doesNotMatch(schema, /score|ranking|winner/i);
  assert.match(service, /不是评分员/);
  assert.match(service, /不要生成分数、排名、冠军或总评等级/);
  assert.match(service, /readTextArtifact/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /type: "image_url"/);
  assert.match(service, /type: "file_url"/);
  assert.match(service, /realArtifactReferences/);
  assert.doesNotMatch(service, /getHumanReviewWorkspace|judgeRepository|resultAnalysisRepository|getReportWorkspace/);
});

test("human review confirms or edits Findings instead of changing scores", () => {
  assert.match(repository, /confirm_experience_findings/);
  assert.match(editor, /人工确认 Findings/);
  assert.match(editor, /这里不是改分数/);
  assert.match(editor, /好用/);
  assert.match(editor, /一般/);
  assert.match(editor, /问题/);
  assert.match(page, /FindingsEditor/);
});

test("real test can go directly to Findings while professional scoring stays optional", () => {
  assert.match(testPage, /提炼测评发现/);
  assert.match(testPage, /专业评分（可选）/);
  assert.match(page, /不需要先跑 AI Judge/);
  assert.match(page, /专业测评模式（可选）/);
  assert.match(page, /生成社区内容/);
});

test("PublishPack can bind either confirmed Findings or a professional Report", () => {
  assert.match(migration, /findings_id uuid/);
  assert.match(migration, /num_nonnulls\(report_id, findings_id\) = 1/);
  assert.match(migration, /begin_findings_publish_pack/);
  assert.match(migration, /PublishPack requires confirmed Findings/);
  assert.match(publishRepository, /beginFromFindings/);
  assert.match(publishRepository, /listByFindings/);
  assert.match(publishService, /source\.kind === "findings"/);
  assert.match(publishService, /humanConfirmedFindings/);
  assert.match(publishService, /优先使用真实 Case/);
  assert.match(publishService, /buildRawFindingsEvidenceContent/);
  assert.match(publishService, /完整原始 Artifact/);
});

test("new public Findings functions remain service-role only", () => {
  for (const fn of ["begin_experience_findings", "start_experience_findings", "complete_experience_findings", "confirm_experience_findings", "fail_experience_findings", "begin_findings_publish_pack", "start_professional_review"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[^;]+from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
});
