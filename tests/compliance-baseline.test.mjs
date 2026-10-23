import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('context baseline distinguishes visible branding from verified requirements and preserves locked criteria', () => {
  const { complianceBaselineRules: rules, complianceBaselineVersion } = load('@/lib/compliance-baseline');
  assert.equal(complianceBaselineVersion, 'compliance-baseline.v2-context');
  assert.match(rules, /不能断言它就是法定显式标识/);
  assert.match(rules, /Judge 必须遵循已锁定的 Rubric，不追溯改分/);
  assert.match(rules, /不笼统宣称/);
  assert.doesNotMatch(rules, /下载和导出的文件也要带|同样属于合规要求/);
});
test('planning, findings, writing, audits and future Judge share the contextual interpretation', () => {
  const story = load('@/lib/community-story-policy');
  for (const name of ['storyBriefRules','storyWritingRules','storyReviewRules','storyFinalAuditRules']) assert.match(story[name], /合规基线/);
  assert.equal(story.storyPolicyVersion, 'community-story.v11-context-baseline');
  assert.match(read('lib/services/protocols.service.ts'), /complianceBaselineRules/);
  assert.match(read('lib/services/findings.service.ts'), /videoEvaluationRules,\n\s*complianceBaselineRules,/);
  assert.match(read('lib/services/judge.service.ts'), /\$\{complianceBaselineRules\}/);
});
test('all portfolio visitors have one report policy while administrators retain history', () => {
  const { isReportHiddenFromVisitors } = load('@/lib/portfolio-visibility');
  for (const access of ['read-only',null,'visitor']) {
    assert.equal(isReportHiddenFromVisitors(access),true);
    assert.equal(isReportHiddenFromVisitors(null),true);
    assert.equal(isReportHiddenFromVisitors('admin'),false);
  }
  assert.match(read('app/projects/[projectId]/test/page.tsx'), /admin && run\.notes && <details/);
  const report = read('app/projects/[projectId]/report/page.tsx');
  assert.ok(report.indexOf('if (!workflowState.stages.review.completed)') < report.indexOf('const workspace = await getReportWorkspace'));
});
