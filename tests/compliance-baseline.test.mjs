import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('compliance baseline treats legally required AI labels as a usage condition, not a defect', () => {
  const { complianceBaselineRules, complianceBaselineVersion } = load('@/lib/compliance-baseline');
  assert.equal(complianceBaselineVersion, 'compliance-baseline.v1');
  assert.match(complianceBaselineRules, /人工智能生成合成内容标识办法/);
  assert.match(complianceBaselineRules, /不是产品缺陷/);
  assert.match(complianceBaselineRules, /发布时仍须声明/);
  assert.match(complianceBaselineRules, /不把“不得出现平台生成标识\/水印”/);
});

test('every content stage that judges or writes receives the same compliance baseline', () => {
  const story = load('@/lib/community-story-policy');
  for (const name of ['storyBriefRules', 'storyWritingRules', 'storyReviewRules', 'storyFinalAuditRules']) {
    assert.match(story[name], /合规基线/, `${name} must carry the baseline`);
  }
  assert.equal(story.storyPolicyVersion, 'community-story.v10-compliance-baseline');
  assert.match(read('lib/services/protocols.service.ts'), /\+ "\\n" \+ complianceBaselineRules/);
  assert.match(read('lib/services/findings.service.ts'), /videoEvaluationRules,\n\s*complianceBaselineRules,/);
});

test('public visitors do not see raw execution notes or internal writing plans', () => {
  assert.match(read('app/projects/[projectId]/test/page.tsx'), /run\.notes && <AdminOnly>/);
  assert.match(read('app/projects/[projectId]/publish/publish-editor.tsx'), /!quick && !readOnly && <aside/);
});
