import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, initialSchema, repository, service, actions, panel, blindService] = await Promise.all([
  read("supabase/migrations/202608170012_human_review_lifecycle.sql"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
  read("lib/repositories/human-review.repository.ts"),
  read("lib/services/human-review.service.ts"),
  read("app/projects/[projectId]/review/human-review-actions.ts"),
  read("app/projects/[projectId]/review/human-review-panel.tsx"),
  read("lib/services/blind-review.service.ts"),
]);

test("creates one ReviewSession only from the latest completed JudgeRun", () => {
  assert.match(migration, /create function public\.ensure_review_session/);
  assert.match(migration, /order by attempt desc/);
  assert.match(migration, /latest_judge_status <> 'completed'/);
  assert.match(migration, /where judge_run_id = latest_judge_run_id/);
  assert.match(migration, /'reviewing'/);
  assert.match(repository, /\.rpc\("ensure_review_session"/);
});

test("persists human corrections and reverts as append-only audit events", () => {
  assert.match(migration, /append_human_override/);
  assert.match(migration, /append_human_revert/);
  assert.match(migration, /p_override_score is null[\s\S]*p_override_score > 10/);
  assert.match(migration, /char_length\(btrim\(coalesce\(p_reason, ''\)\)\) = 0/);
  assert.match(migration, /target_event_id[\s\S]*active_override_id/);
  assert.match(initialSchema, /human_review_events_are_append_only/);
  assert.match(initialSchema, /Latest event determines whether AI score is overridden/);
  assert.doesNotMatch(repository + service + actions, /update\([\s\S]*judge_scores|\.from\("judge_scores"\)\.update/);
});

test("derives Final Score from the active override without editing Overall", () => {
  assert.match(initialSchema, /case when le\.action = 'override' then le\.override_score else js\.ai_score end as final_score/);
  assert.match(service, /finalScore: Number\(finalScore\.final_score\)/);
  assert.match(panel, /综合分由[\s\S]*Rubric 权重自动计算，不可直接修改/);
  assert.doesNotMatch(panel, /name="overall"|name="finalScore"/);
  assert.match(panel, /name="score"[\s\S]*min=\{0\}[\s\S]*max=\{10\}[\s\S]*step=\{0\.1\}/);
});

test("locks editing before reveal and never returns mapping early", () => {
  assert.match(migration, /status = 'reviewing'[\s\S]*status = 'locked'/);
  assert.match(migration, /status = 'review_locked'/);
  assert.match(migration, /status = 'revealed'/);
  assert.match(migration, /status = 'completed'/);
  assert.match(migration, /where id = p_review_session_id and status = 'revealed'/);
  assert.match(migration, /Product identity is unavailable before reveal/);
  assert.match(service, /session\.status === "revealed"[\s\S]*getRevealedMappings/);
  assert.doesNotMatch(repository, /\.from\("blind_mappings"\)/);
  assert.doesNotMatch(blindService, /productId|productName|blind_mappings/);
});

test("keeps every Human Review mutation project-scoped and service-role only", () => {
  assert.match(migration, /project_id = p_project_id[\s\S]*status = 'reviewing'/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.match(actions, /projectId: idSchema/);
  assert.match(actions, /reason: reasonSchema/);
  assert.match(actions, /Number\.isInteger\(value \* 10\)/);
});

test("real Review UI and service do not use localStorage or Mock review data", () => {
  assert.doesNotMatch(repository + service + actions + panel, /localStorage|@\/lib\/mock|mockJudge|mockReview/);
  assert.match(panel, /仅看人工修改/);
  assert.match(panel, /恢复 AI 评分/);
  assert.match(panel, /确认并锁定最终评分/);
  assert.match(panel, /揭晓产品身份/);
});
