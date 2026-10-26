import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createLoader from './lib/load-typescript.cjs';
import { digest, readCurrentEvidenceStamp, requireSameEvidence, allowReadOnlyExperimentRequest } from './lib/current-evidence.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const archive = path.join(root, 'outputs/natural-voice-private/jimeng/current-images-20261026');
const out = path.join(root, 'docs/project-articles/2026-10-26即梦新图两版对照');
const read = async (dir, file) => JSON.parse(await readFile(path.join(archive, dir, file), 'utf8'));
const snapshot = await read('.', 'current-source.private.json');
const realFetch = globalThis.fetch;
const origin = new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
globalThis.fetch = (input, init) => {
  assert.equal(allowReadOnlyExperimentRequest(input, init, origin), 'source-read');
  return realFetch(input, { ...init, redirect: 'error' });
};
requireSameEvidence(snapshot.stamp, await readCurrentEvidenceStamp(createLoader(root), snapshot.stamp.projectId));
const variants = [['current', 'A · 当前规则', process.argv[2] ?? 'current-run1'], ['style-card', 'B · 加风格卡', process.argv[3] ?? 'style-card-run1']];
const hash = text => createHash('sha256').update(text).digest('hex');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const humanReview = JSON.parse(await readFile(path.join(out, '人工核查.json'), 'utf8'));
assert.ok(snapshot.stamp.artifacts.some(artifact => artifact.id === humanReview.sourceArtifactId));
const runs = [];
for (const [variant, label, dir] of variants) {
  assert.equal(path.basename(dir), dir);
  const candidate = await read(dir, 'candidate.private.json');
  const verification = await read(dir, 'verification.private.json');
  assert.equal(candidate.snapshotHash, digest(snapshot));
  assert.equal(candidate.variant, variant);
  assert.equal(verification.currentSourceVerified, true);
  requireSameEvidence(snapshot.stamp, verification.sourceStamp);
  for (const field of ['databaseWrites', 'storageWrites', 'appWrites', 'deploys']) assert.equal(verification[field], 0);
  const post = candidate.post;
  const manual = humanReview.variants[variant];
  assert.ok(manual && manual.issues.every(issue => post.body.includes(issue.quote)));
  const markdown = `# ${post.title}\n\n${post.body}\n`;
  runs.push({ variant, label, file: `${variant}.md`, title: post.title, body: post.body,
    bodySha256: hash(post.body), markdownSha256: hash(markdown), bodyCharacters: Array.from(post.body).length,
    guidanceHash: candidate.guidanceHash, generationTrace: post.generationTrace,
    articleReview: post.articleReview, stylePreservation: post.stylePreservation,
    requests: verification.requests, sourceReads: verification.sourceReads, resumedStages: verification.resumedStages, humanReview: manual,
    markdown });
}
await mkdir(out, { recursive: true });
for (const run of runs) await writeFile(path.join(out, run.file), run.markdown);
const markdown = `# 即梦新图 · 两版对照\n\n当前第${snapshot.stamp.protocolVersion}版，1张新图。\n\n${runs.map(run => `## ${run.label}\n\n> ${run.humanReview.label}\n\n${run.markdown}`).join('\n')}`;
await writeFile(path.join(out, '两版全文.md'), markdown);
const cards = runs.map(run => `<article><small>${run.label}</small><div style="color:#8c621d;font-size:13px;margin-top:10px">${escape(run.humanReview.label)}</div><h2>${escape(run.title)}</h2>${run.body.split(/\n\s*\n/).map(p => `<p>${escape(p)}</p>`).join('')}</article>`).join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>即梦新图 · 两版对照</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f6f4;color:#222;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:36px 28px}h1{font-size:26px;margin:0 0 10px}.source{color:#666;font-size:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:26px}article{background:white;border:1px solid #e4e4df;border-radius:12px;padding:28px}small{color:#526553}h2{font-size:22px;line-height:1.6;margin:20px 0}article p{font-size:17px;line-height:1.9;white-space:pre-wrap;margin:20px 0 0}@media(max-width:800px){main{padding:24px 16px}.grid{grid-template-columns:1fr}}</style><main><h1>即梦新图 · 两版对照</h1><div class="source">当前第${snapshot.stamp.protocolVersion}版 · 1张新图</div><div class="grid">${cards}</div></main></html>`;
await writeFile(path.join(out, '并排对照.html'), html);
await writeFile(path.join(out, '生成核验.json'), JSON.stringify({ date: '2026-10-26', status: 'current_source_verified_local_pair',
  sourceStamp: snapshot.stamp, snapshotHash: digest(snapshot), sourceMaterialsIdentical: true, manualCopyEdits: false,
  databaseWrites: 0, storageWrites: 0, appWrites: 0, deploys: 0,
  htmlSha256: hash(html), comparisonSha256: hash(markdown), runs: runs.map(run => Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'markdown'))) }, null, 2) + '\n');
console.log(JSON.stringify({ out, protocolVersion: snapshot.stamp.protocolVersion, artifactCount: snapshot.stamp.artifacts.length, characters: runs.map(run => run.bodyCharacters) }));
