import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../docs/research/turingscat-20261026/', import.meta.url);
const readJson = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));

test('imported research remains byte-identical to the supplied package manifest', async () => {
  const manifest = await readJson('import-manifest.json');
  assert.equal(manifest.origin, 'user_provided_research_package');
  assert.equal(manifest.files.length, 7);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, 7);
  for (const file of manifest.files) {
    assert.equal(file.path.includes('/'), false);
    const data = await readFile(new URL(file.path, root));
    assert.equal(data.length, file.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
  }
  assert.equal(manifest.verification.independently_refetched_subtitles, false);
  assert.equal(manifest.verification.independently_reviewed_audio_or_video, false);
});

test('candidate rules resolve to cross-source observations within recorded time windows', async () => {
  const { videos } = await readJson('sources.json');
  const sourceRules = await readJson('writing-rules.json');
  const profile = await readJson('style-profile.json');
  assert.deepEqual(profile.rules.map(rule => rule.id), sourceRules.rules.map(rule => rule.id));
  for (const rule of profile.rules) {
    const original = sourceRules.rules.find(item => item.id === rule.id);
    assert.equal(rule.instruction, original.instruction);
    assert.ok(new Set(rule.evidence_refs.map(ref => ref.source_id)).size >= 2);
    for (const ref of rule.evidence_refs) {
      const video = videos.find(item => item.id === ref.source_id);
      assert.ok(video && original.references.includes(video.id));
      assert.ok(video.rule_ids.includes(rule.id));
      const marker = video.evidence_markers[ref.marker_index];
      assert.ok(marker && marker.start_seconds >= 0 && marker.end_seconds > marker.start_seconds);
      assert.ok(marker.end_seconds <= video.duration_seconds);
      assert.ok(marker.start_seconds >= video.first_segment_from - 0.1);
      assert.ok(marker.end_seconds <= video.last_segment_to + 0.1);
      assert.equal(video.subtitle_gaps_over_10_seconds.some(gap => marker.start_seconds < gap.end_seconds && marker.end_seconds > gap.start_seconds), false);
      const url = new URL(marker.url);
      assert.equal(url.hostname, 'www.bilibili.com');
      assert.ok(url.pathname.includes(video.bvid));
    }
  }
});

test('the profile preserves uncertainty rather than inventing language statistics or author experience', async () => {
  const profile = await readJson('style-profile.json');
  const { videos } = await readJson('sources.json');
  assert.equal(profile.status, 'research_candidate_not_evaluated');
  assert.equal(profile.runtime_enabled, false);
  assert.equal(profile.claims.creator_identity_imitation, false);
  for (const field of ['lexical_fingerprint', 'sentence_length_statistics', 'catchphrases', 'naturalness_improvement']) assert.equal(profile.claims[field], null);
  assert.ok(videos.every(video => !video.full_speech_verified && !video.visual_and_audio_fact_checked && !video.provided_full_transcript));
  const reversal = profile.rules.find(rule => rule.id === 'R04');
  assert.equal(reversal.support, 'limited_indirect');
  assert.match(reversal.evidence_note, /不能直接证明/);
  for (const ref of reversal.evidence_refs) assert.ok(videos.find(video => video.id === ref.source_id).subtitle_timeline_coverage_ratio < 0.6);
  assert.equal(profile.application_contract.production_default_changed, false);
  assert.match(profile.application_contract.priority, /事实.*JSON.*终审/);
  assert.ok(profile.application_contract.forbidden_transfers.some(item => /博主身份.*经历/.test(item)));
});

test('research totals reconcile without treating timing coverage as transcription accuracy', async () => {
  const { totals, videos, scope } = await readJson('sources.json');
  assert.equal(totals.videos, videos.length);
  for (const [total, field] of [['duration_seconds', 'duration_seconds'], ['subtitle_segments', 'segment_count'], ['subtitle_characters', 'subtitle_character_count']]) {
    assert.equal(totals[total], videos.reduce((sum, video) => sum + video[field], 0));
  }
  assert.match(scope, /not ASR accuracy/);
  for (const video of videos) assert.match(video.subtitle_sha256, /^[a-f0-9]{64}$/);
});

test('the paired plan compares the current Skill baseline and retains empty unrun results', async () => {
  const profile = await readJson('style-profile.json');
  const plan = await readJson('evaluation-plan.json');
  assert.equal(plan.profile_id, profile.id);
  assert.equal(plan.profile_version, profile.version);
  assert.equal(plan.status, 'not_run');
  assert.match(plan.baseline, /v13-de-ai-flavor/);
  assert.equal(plan.provider_calls, 0);
  assert.equal(plan.production_writes, 0);
  assert.deepEqual(plan.runs, []);
  assert.equal(plan.results, null);
  assert.equal(new Set(plan.cases.map(item => item.id)).size, 6);
  assert.ok(plan.controls.some(item => /失败.*保留.*不重复抽稿/.test(item)));
  assert.match(plan.video_holdout, /10条都已参与分析/);
  const card = await readFile(new URL('05-候选风格卡.md', root), 'utf8');
  assert.match(card, /教学片段.*不是视频原文.*模型实跑结果/);
  assert.match(card, /尚未评测或接入生成/);
});
