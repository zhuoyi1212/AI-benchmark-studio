import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const internalName = /^(\[E2E\](?:\s|$)|AUTO DEMO(?:\s|·|$)|快速模式复用验证(?:\s|$))/i;
const byVersion = (a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at);
const copy = post => ({ title: post.title ?? '', body: post.body, tags: post.tags ?? [], interactionQuestion: post.interactionQuestion ?? '' });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function compileProjectArticles(snapshot) {
  const t = snapshot.tables;
  const projects = t.projects.filter(p => !p.deleted_at && !internalName.test(p.name.trim())).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const result = [];
  for (const p of projects) {
    const runs = t.test_runs.filter(r => r.project_id === p.id);
    const runIds = new Set(runs.map(r => r.id));
    const artifacts = t.test_artifacts.filter(a => runIds.has(a.test_run_id));
    const packs = t.publish_packs.filter(r => r.project_id === p.id && typeof r.community_post?.body === 'string' && r.community_post.body.trim()).sort(byVersion);
    if (!artifacts.length && !packs.length) continue;
    const latestReady = packs.find(r => r.status === 'ready');
    const protocols = t.protocols.filter(r => r.project_id === p.id).sort(byVersion);
    const protocol = protocols[0];
    const findings = t.experience_findings.filter(r => r.project_id === p.id && r.human_confirmed_at).sort(byVersion)[0];
    const effectiveFindings = findings?.human_output ?? findings?.output;
    const articles = packs.map(r => {
      const article = copy(r.community_post);
      const recommendations = t.publish_pack_artifacts.filter(a => a.publish_pack_id === r.id).sort((a, b) => a.display_order - b.display_order).map(a => {
        const artifact = artifacts.find(x => x.id === a.artifact_id);
        if (!artifact) throw new Error(`Article artifact outside project: ${r.id}/${a.artifact_id}`);
        return { artifactId: a.artifact_id, fileName: artifact.file_name, kind: artifact.kind, order: a.display_order, reason: a.reason, supportsClaim: a.supports_claim, supportsParagraph: a.supports_paragraph };
      });
      return { id: r.id, version: r.version, status: r.status, isLatestReady: r.id === latestReady?.id, createdAt: r.created_at, completedAt: r.completed_at, provider: r.provider, model: r.model, promptVersion: r.prompt_version, manualEdit: Boolean(r.community_post.manualEdit), aiReviewed: r.community_post.manualEdit ? r.community_post.manualEdit.aiReviewed === true : null, contentSha256: digest(article), ...article, evidence: recommendations };
    });
    const grouped = new Map();
    for (const a of articles) {
      const group = grouped.get(a.contentSha256) ?? { representativeId: a.id, versions: [], articleIds: [] };
      group.versions.push(a.version); group.articleIds.push(a.id); grouped.set(a.contentSha256, group);
    }
    result.push({ id: p.id, name: p.name, intent: p.intent, mode: p.evaluation_mode, status: p.status, createdAt: p.created_at, updatedAt: p.updated_at, url: `https://ai-benchmark-studio-sand.vercel.app/projects/${p.id}/quick`, products: t.project_products.filter(r => r.project_id === p.id).sort((a, b) => a.display_order - b.display_order).map(r => ({ id: r.product_id, name: r.submitted_name })), protocol: protocol ? { id: protocol.id, version: protocol.version, status: protocol.status, title: protocol.title, goal: protocol.goal, cases: t.test_cases.filter(c => c.protocol_id === protocol.id).sort((a, b) => a.position - b.position).map(c => ({ id: c.id, title: c.title, objective: c.objective, prompt: c.prompt })) } : null, findings: effectiveFindings ? { version: findings.version, confirmedAt: findings.human_confirmed_at, summary: effectiveFindings.summary ?? '', limitations: effectiveFindings.limitations ?? [] } : null, artifactCount: artifacts.length, artifactKinds: [...new Set(artifacts.map(a => a.kind))].sort(), articles, contentGroups: [...grouped.values()] });
  }
  const articles = result.flatMap(p => p.articles);
  return { capturedAt: snapshot.capturedAt, scope: 'Current active non-internal projects with test evidence or saved article text; all stored article versions with a body', totals: { projects: result.length, articleVersions: articles.length, readyVersions: articles.filter(a => a.status === 'ready').length, uniqueContents: result.reduce((n, p) => n + p.contentGroups.length, 0), manualVersions: articles.filter(a => a.manualEdit).length }, projects: result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a local private snapshot path');
  const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const compiled = compileProjectArticles(snapshot);
  const folder = fileURLToPath(new URL('../docs/project-articles/', import.meta.url));
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, '项目与文章汇编数据.json'), JSON.stringify(compiled, null, 2) + '\n');
  process.stdout.write(JSON.stringify(compiled.totals) + '\n');
}
