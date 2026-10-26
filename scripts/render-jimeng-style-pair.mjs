import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const archive = path.join(root, 'outputs/natural-voice-private/jimeng');
const destination = path.join(root, 'docs/project-articles/2026-10-26即梦风格卡对照');
const prior = await readFile(path.join(destination, '生成核验.json'), 'utf8').catch(() => null);
if (prior && JSON.parse(prior).status === 'invalidated_stale_source') throw new Error('旧证据对照已失效，禁止重新展示为当前结果。');
const read = async (dir, name) => JSON.parse(await readFile(path.join(archive, dir, name), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const variants = [['current', 'A · 当前规则'], ['style-card', 'B · 当前规则＋风格卡']];
const directories = [process.argv[2] ?? 'style-pair-20261026-current-retry02', process.argv[3] ?? 'style-pair-20261026-style-card-retry02'];
const inputs = [];
const reports = [];
const copies = [];
for (const [variant, label] of variants) {
  const dir = directories[variants.findIndex(item => item[0] === variant)];
  assert.equal(path.basename(dir), dir);
  const candidate = await read(dir, 'candidate.private.json');
  const verification = await read(dir, 'verification.private.json');
  const frozen = await read(dir, 'frozen-input.private.json');
  inputs.push(frozen);
  assert.equal(candidate.variant, variant);
  assert.equal(candidate.post.contentPolicyVersion, 'community-story.v13-de-ai-flavor');
  for (const field of ['databaseRequests', 'databaseWrites', 'appWrites', 'deploys']) assert.equal(verification[field], 0);
  assert.ok((verification.resumedStages ?? []).every(item => ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview'].includes(item.stage)));
  assert.equal(verification.inputFilesUnchanged, true);
  assert.ok(candidate.post.articleReview.issues.length === 0 && candidate.post.stylePreservation.issues.length === 0);
  for (const field of ['facts', 'scope', 'stance', 'experience', 'advice', 'evidence']) assert.equal(candidate.post.stylePreservation[field], true);
  const post = candidate.post;
  const markdown = `# ${post.title}\n\n${post.body}\n`;
  copies.push({ label, post, markdown });
  reports.push({ variant, label, generatedAt: candidate.generatedAt, profileVersion: candidate.profileVersion,
    guidanceHash: candidate.guidanceHash, sourceHash: candidate.sourceHash, rawEvidenceHash: candidate.frozenRawHash,
    policyVersion: post.contentPolicyVersion, title: post.title, body: post.body, bodyCharacters: Array.from(post.body).length,
    bodySha256: hash(post.body), markdownSha256: hash(markdown), file: `${variant}.md`,
    generationTrace: post.generationTrace, articleReview: post.articleReview, stylePreservation: post.stylePreservation,
    providerRequests: verification.providerRequests, responseCount: verification.responseCount,
    resumedStages: verification.resumedStages ?? [], requestControls: verification.requests });
}
assert.deepEqual(inputs[0], inputs[1], 'All frozen source materials and author configuration must match');
assert.equal(reports[0].sourceHash, reports[1].sourceHash);
assert.equal(reports[0].rawEvidenceHash, reports[1].rawEvidenceHash);
for (const schemaName of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']) {
  const requestA = reports[0].requestControls.find(item => item.schemaName === schemaName);
  const requestB = reports[1].requestControls.find(item => item.schemaName === schemaName);
  if (requestA && requestB) {
    for (const field of ['model', 'maxTokens', 'reasoningEffort', 'thinking', 'stream']) assert.deepEqual(requestA[field], requestB[field]);
  }
}
await mkdir(destination, { recursive: true });
for (const [index, [variant]] of variants.entries()) await writeFile(path.join(destination, `${variant}.md`), copies[index].markdown);
const comparison = `# 即梦文章 · 本地规则对照\n\n同一原始材料、作者配置和模型；实际一轮四张图。两篇均为本轮真实模型输出，未经手工润色。当前规则已包含de-ai-flavor；B仅在策划、初稿与按需修订中增加候选卡，独立审核不变。\n\n${copies.map(copy => `## ${copy.label}\n\n${copy.markdown}`).join('\n')}\n这是一份材料的一次配对，不是六份评测或自然度提升结论。即梦曾用于教学例句，不声称是留出材料。线上文章、实验与默认规则未改。\n`;
await writeFile(path.join(destination, '两版全文对照.md'), comparison);
const cards = copies.map(copy => `<article><div class="label">${escape(copy.label)}</div><h2>${escape(copy.post.title)}</h2>${copy.post.body.split(/\n\s*\n/).map(p => `<p>${escape(p)}</p>`).join('')}</article>`).join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>即梦文章 · 两版对照</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f3;color:#222;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:40px 32px}h1{font-size:27px;margin:0 0 12px}header p,footer{color:#666;font-size:14px;line-height:1.8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}article{background:white;border:1px solid #e4e4df;border-radius:14px;padding:30px}.label{font-size:13px;color:#526553;margin-bottom:20px}h2{font-size:22px;line-height:1.6;margin:0 0 25px}article p{font-size:17px;line-height:1.95;margin:0 0 20px;white-space:pre-wrap}article p:last-child{margin-bottom:0}footer{margin-top:22px}@media(max-width:800px){main{padding:24px 16px}.grid{grid-template-columns:1fr}article{padding:24px}}</style><main><header><h1>即梦文章 · 两版对照</h1><p>同一原始材料 · Kimi K3 写作 · 真实生成，未手工润色 · 线上未改</p></header><div class="grid">${cards}</div><footer>两版均包含 de-ai-flavor，并沿用相同独立审核。只比较这一份材料，不代表已验证整体质量提升。</footer></main></html>`;
await writeFile(path.join(destination, '两版并排对照.html'), html);
const failedAttempts = [];
for (const [variant] of variants) {
  const dir = `style-pair-20261026-${variant}`;
  const requests = await read(dir, 'request-controls.private.json');
  const failure = await read(dir, 'failure.private.json');
  failedAttempts.push({ variant, status: variant === 'current' ? 'failed_before_draft' : 'failed_during_revision', message: failure.message,
    providerRequests: requests.length, requestControls: requests,
    note: 'Kimi过载或超时；后续严格比对原请求与输入后恢复成功阶段，仅继续未完成阶段，不添加编辑提示、不抽取新初稿。' });
}
await writeFile(path.join(destination, '生成核验.json'), JSON.stringify({ date: '2026-10-26', status: 'one_pair_generated_not_reader_evaluated',
  sourceMaterialsIdentical: true, images: 'archived observations of the original four images; no fresh image reading',
  firstCompletedPair: true, extraEditorialReminders: false, manualCopyEdits: false,
  failedAttempts,
  databaseRequests: 0, databaseWrites: 0, storageWrites: 0, appWrites: 0, deploys: 0,
  htmlSha256: hash(html), comparisonSha256: hash(comparison), runs: reports }, null, 2) + '\n');
console.log(JSON.stringify({ destination, variants: reports.map(item => ({ variant: item.variant, chars: item.bodyCharacters, calls: item.providerRequests })) }));
