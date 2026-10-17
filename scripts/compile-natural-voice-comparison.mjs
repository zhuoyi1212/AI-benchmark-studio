/** Publish only sanitized text/metrics; private prompts and signed URLs stay in outputs/. */
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const load = require('./lib/load-typescript.cjs')(root);
const { communityVoiceMetrics } = load('@/lib/community-experience');
const { groundedDetailMetrics, originalQuoteIssues } = load('@/lib/community-detail-retention');
const prior = JSON.parse(await readFile(path.join(root, 'docs/project-articles/2026-10-17三项目新稿/生成核验记录.json'), 'utf8'));
const output = path.join(root, 'docs/project-articles/2026-10-17-v9自然表达对照');
await mkdir(output, { recursive: true });
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const projects = [];
for (const key of ['dongni', 'jimeng', 'metaso']) {
  const base = path.join(root, 'outputs/natural-voice-private', key);
  const dirs = (await readdir(base, { withFileTypes: true })).filter(e => e.isDirectory() && e.name.startsWith('run-')).map(e => e.name).sort();
  const attempts = [];
  let selected;
  for (const name of dirs) {
    const dir = path.join(base, name);
    const complete = await exists(path.join(dir, 'verification.private.json'));
    const excluded = await exists(path.join(dir, 'delivery-exclusion.private.json'));
    const failed = await exists(path.join(dir, 'failure.private.json'));
    const failureStage = failed ? JSON.parse(await readFile(path.join(dir, 'failure.private.json'), 'utf8')).message?.split('：')[0] : undefined;
    const calls = (await readdir(dir)).filter(file => /^\d+-/.test(file));
    attempts.push({ attempt: name, responses: calls.length, failureStage, status: excluded ? 'excluded-after-source-review' : failed ? 'failed' : complete ? 'completed' : 'incomplete' });
    if (complete && !excluded) selected = { name, dir };
  }
  assert.ok(selected, `${key}: no verified candidate available`);
  const candidate = JSON.parse(await readFile(path.join(selected.dir, 'candidate.private.json'), 'utf8'));
  const verification = JSON.parse(await readFile(path.join(selected.dir, 'verification.private.json'), 'utf8'));
  const input = JSON.parse(await readFile(path.join(selected.dir, 'frozen-input.private.json'), 'utf8'));
  const old = prior.projects.find(p => p.key === key);
  assert.equal(candidate.sourceHash, old.sourceHash);
  assert.equal(verification.databaseRequests, 0); assert.equal(verification.appWrites, 0);
  assert.equal(candidate.post.contentPolicyVersion, 'community-story.v9-natural-voice');
  const v9 = Object.fromEntries(['title', 'body', 'tags', 'interactionQuestion'].map(field => [field, candidate.post[field]]));
  assert.deepEqual(originalQuoteIssues(v9.body, input.frozenWriter.originalDetails), []);
  const versions = [['旧稿', old.baseline], ['现有新稿（v8本地候选）', old.final], ['v9本地候选', v9]].map(([label, copy]) => ({ label, ...copy,
    voice: communityVoiceMetrics(copy), groundedDetails: groundedDetailMetrics(copy.body, input.frozenWriter.originalDetails) }));
  const file = `${old.name}.md`;
  const markdown = `# ${v9.title}\n\n${v9.body}\n\n${v9.tags.map(t => `#${t}`).join(' ')}${v9.interactionQuestion ? '\n\n' + v9.interactionQuestion : ''}\n`;
  await writeFile(path.join(output, file), markdown);
  const events = [];
  for (const f of (await readdir(selected.dir)).filter(f => /^\d+-/.test(f)).sort()) {
    const e = JSON.parse(await readFile(path.join(selected.dir, f), 'utf8'));
    events.push({ replayed: Boolean(e.replayed), schemaName: e.schemaName, attempt: Number(f.match(/-(\d+)\.private\.json$/)[1]), provider: e.route.provider, model: e.route.model, promptVersion: e.route.promptVersion });
  }
  projects.push({ key, name: old.name, projectId: candidate.projectId, sourcePackId: candidate.sourcePackId,
    sourceHash: candidate.sourceHash, frozenRawHash: candidate.frozenRawHash, generatedAt: candidate.generatedAt,
    selectedAttempt: selected.name, attempts, versions, generationTrace: candidate.post.generationTrace,
    initialDraft: candidate.post.styleEdit.original, draftReview: candidate.post.draftReview,
    naturalVoiceAudit: candidate.post.naturalVoiceAudit,
    currentRulesAudit: await exists(path.join(selected.dir, 'current-audit.private.json')) ? JSON.parse(await readFile(path.join(selected.dir, 'current-audit.private.json'), 'utf8')) : undefined, finalArticleReview: candidate.post.articleReview,
    finalPreservation: candidate.post.stylePreservation, verification, providerResponses: events, file,
    sha256: createHash('sha256').update(markdown).digest('hex') });
}
const metaso = projects.find(p => p.key === 'metaso');
const firstPersonSentences = metaso.versions[2].body.split(/(?<=[。！？])/).filter(s => /我/.test(s));
const intro = `# v9 社区文章冻结输入对照\n\n三篇均为本地候选，未写入App、未部署、未push。旧稿、现有v8候选保持原文。App保存版本号与社区策略v9是两种版本标记。\n\n原始Artifact、已确认Findings、完整任务、配置及originalDetails逐字段保持冻结快照；新增执行事实仅从相同Artifact关联推导。即梦复用同四张原图先前的智谱读取结果，秘塔与懂你复用原始文本，未重新OCR/读图。正文和按需修订走Kimi，策划与文本复核走原DeepSeek路由；调用阶段、尝试及失败均保留。数据库/Storage请求0、App写入0。\n\n## 计数口径\n\n“门禁命中”仅统计本次六类软文风信号：每个命中的列表短语算1条，其余类型各算1条，不是出现总次数或失败率。“范围句”按句末及换行分句匹配，包含引语中的字面命中。原话/数字为正文抽取后能在同一originalDetails字面找到的去重条目，NFKC/空白/加粗规范化，双层与单层数字引用视作同号；数字带原单位，中文数字不自动换成阿拉伯数字。中文专名不计入该列；专名仍参与修订保留检查。这不是对全文语义完整性或事实准确率的评分。\n\n**这些计数只说明门禁命中和细节保留的变化，不代表自然度提升。自然度还需要读者盲评，本轮不宣称提升。**\n\n| 项目 | 版本 | 门禁命中数 | 范围句数 | 原话+数字条数（原话/数字） |\n|---|---|---:|---:|---:|\n`;
let doc = intro;
for (const p of projects) for (const v of p.versions) doc += `| ${p.name} | ${v.label} | ${v.voice.hitCount} | ${v.voice.scopeSentenceCount} | ${v.groundedDetails.count}（${v.groundedDetails.quotes}/${v.groundedDetails.numbers}） |\n`;
doc += '\n## 懂你AI两处疑点的原始核对\n\n原始文本Artifact：`546af2f4-6e0b-47e7-be97-d517c1cae32f`，同一加薪任务。两处都存在于产品原回答，并非仅见于旧/新稿。\n\n- 第6条行动清单：“拿到承诺就定时间点；拿不到就问标准——连标准都问不到，说明他不打算给，你也该有数了。”\n- 第3部分“什么时候、什么场合”的时机项：“项目热度还在的时候提，别拖。拖到下季度，功劳就贬值了。”\n\n这证明来源存在，不证明产品对老板意图的推断正确。新稿若保留，必须归于产品的建议或判断，不能写成已验证的人物心理。\n';
doc += `\n## 秘塔第一人称执行边界\n\n最终稿中的第一人称句：\n\n${firstPersonSentences.length ? firstPersonSentences.map(s => '> ' + s.trim()).join('\n\n') : '未出现。不能据此声称真实模型已验证不误拦；须另附执行句探针结果。'}\n\n该执行句在初审中未因缺少作者感受被要求删除，最终stylePreservation.experience为true；本例没有再复现旧版第一人称执行误拦，不能据此声称整体误杀率下降。初审与最终审核结果见同目录核验JSON。这类执行句在当前原始Artifact支持下合法；不能由此推到未记录的情绪、耗时或使用偏好。程序回归另覆盖有Artifact的执行句通过、无记录的情绪/耗时被标出。\n`;
doc += '\n## 全部尝试与未解决边界\n\n';
for (const p of projects) {
 doc += `- ${p.name}：${p.attempts.map(a => `${a.attempt} ${a.status}（${a.responses}份响应记录${a.failureStage ? '，' + a.failureStage : ''}）`).join('；')}。交付采用${p.selectedAttempt}。\n`;
}
doc += '\n懂你前两份候选虽通过模型终审，人工对照发现引语静默删改，已排除交付；保留原始输出并补充连续原文检查。另保留频率泛化、无记录速度及审稿定位失败；只展示当前门禁通过的候选，不把被排除稿算成功。即梦run-02终审把用途中的一张草图误判为样本数量冲突；选用已通过的run-01，并额外经当前完整规则独立复核，结果见currentRulesAudit。若verification.reusedStages非空，只复用了请求逐字段相同且重新校验的真实策划/初稿，非新模型响应；历史usage不可累加当新计费。所有失败未进入App。纯文本引语门禁不能独自判断来源归属，语义终审仍可能漏检；少量三例及重复调试不能当成独立测试集或普遍效果证明。\n';
doc += '\n阅读复核仍有具体问题：秘塔开头保留了较长任务参数清单，也出现“先说好的部分”这种未被固定词表命中的连接；懂你仍偏逐段讲解，预算回应没有完整保留旧稿的整段长引语；即梦的原话/数字计数还比现有v8少1条。修订保留检查只保护已进入初稿的细节，不能保证初始选材覆盖全部重要材料。这些是后续读者盲评和编辑判断的重点，本轮不手改API正文来美化对照。\n';
for (const p of projects) {
 doc += `\n## ${p.name}\n\n来源摘要：\`${p.sourceHash}\`。最终残留软提示：${p.naturalVoiceAudit.remainingIssues.length ? p.naturalVoiceAudit.remainingIssues.join('；') : '无'}。\n`;
 for (const v of p.versions) doc += `\n### ${v.label}\n\n**${v.title}**\n\n${v.body}\n\n标签：${v.tags.join('、')}\n\n互动：${v.interactionQuestion || '（空）'}\n`;
}
await writeFile(path.join(output, '三项目v9新旧稿对照.md'), doc);
await writeFile(path.join(output, '生成核验记录.json'), JSON.stringify({ status: 'local_candidates_not_saved_to_app', policyVersion: 'community-story.v9-natural-voice', naturalnessClaimed: false, readerBlindReview: 'pending', databaseWrites: 0, projects }, null, 2) + '\n');
console.log(JSON.stringify(projects.map(p => ({ key: p.key, attempt: p.selectedAttempt, metrics: p.versions.map(v => [v.label, v.voice.hitCount, v.voice.scopeSentenceCount, v.groundedDetails.count]) })), null, 2));
