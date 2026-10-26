import type { CommunityPostOutput, PublishConfig } from "./ai/schemas/publish.schemas";
import type { ExperienceFindingItem } from "./ai/schemas/findings.schemas";
import { authorPerspectiveRules } from './author-perspective';

export const experienceWritingRules = [
  "真实体验先说结论或具体场景；第一人称并非必需，个人感受必须有记录，不套固定开头。",
  "段落跟着读者关心的问题组织，具体判断紧接原始细节及其对任务的影响，不逐项报备测试流程。",
  "当 config.structure=好用 / 一般 / 难用时，分类只用于内部选材；正文用具体发现组织，省略空类别，不输出分类标签。",
  "禁止报告腔：总体而言、综合来看、值得注意的是、从这个角度来看、此次测评表明、该功能表现出、体现了、展现出较强、表现出较强、具有一定优势、在实际使用场景中具有较高价值、本次实验结果显示、综上所述。",
  authorPerspectiveRules,
  "只测一次不能说经常失败，一个网站失败不能说非主流平台失败率高；没有竞品实测证据不能比较竞品。",
].join("\n");

// Editorial signals only. Never add these to a failing schema or final factual gate.
export const communityProcessPhrases = ['本轮', '首轮', '本文', '本次测试', '据此', '任务要求', '符合提示词', '素材是齐的'] as const;
export const communityConnectorPhrases = ['先说好消息', '先说结论', '问题有两个', '结论：', '结论:', '但也不是全都不能用'] as const;
const scopeSentencePattern = /没(?:有)?(?:逐条|逐一|实际)?(?:验证|核验|核实|核对)|没(?:有)?逐条[^。！？\n]{0,12}(?:核验|核实|核对|验证)|未(?:逐条|实际)?(?:验证|核验|核实|核对|测试)|(?:本次|这次)没|只测了|仅测试|没有观察到|未观察到|效果没看|还得看现场/;

export function communityVoiceMetrics(copy: { body: string; tags?: string[] }) {
  const sentences = copy.body.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [];
  const scopeSentences = sentences.filter(sentence => scopeSentencePattern.test(sentence));
  const process: string[] = communityProcessPhrases.filter(phrase => copy.body.includes(phrase));
  const connectors: string[] = communityConnectorPhrases.filter(phrase => copy.body.includes(phrase));
  if (/输入(?:了)?[^。！？\n]{0,40}画像/.test(copy.body)) process.push('输入画像');
  if (/一是[\s\S]*?二是/.test(copy.body)) connectors.push('一是…二是…');
  const dashCount = (copy.body.match(/——/g) ?? []).length;
  const citationCount = (copy.body.match(/\[\[\d+\]\]/g) ?? []).length;
  const issues = [
    ...process.map(phrase => `测试流程用语：${phrase}；改成读者关心的具体观察`),
    ...connectors.map(phrase => `固定连接词：${phrase}；按内容自然衔接`),
    ...(scopeSentences.length > 2 ? [`范围句过多：${scopeSentences.length}句；合并到一处判断中，保留不同的必要边界`] : []),
    ...(dashCount > 2 ? [`破折号密度：${dashCount}处；用句意组织长短句`] : []),
    ...(citationCount ? ['引用格式：把双层数字方括号改为单层方括号，保持编号及来源关系'] : []),
    ...((copy.tags?.length ?? 0) > 5 ? ['标签数量超过5个；程序仅保留原有标签中的前5个，不新增标签'] : []),
  ];
  return { issues, hitCount: issues.length, scopeSentenceCount: scopeSentences.length, scopeSentences, dashCount, citationCount };
}

export type ExecutionFact = { productId: string; testCaseId: string; artifactIds: string[] };

/** Read only the first server-generated artifact label, never the following uploaded answer. */
export function manualTestNoteRecords(evidence: import('./ai/types').AIMessageContent, facts: ExecutionFact[]) {
  if (typeof evidence === 'string') return [];
  const seen = new Set<string>();
  const records: string[] = [];
  for (const part of evidence) {
    if (part.type !== 'text' || !part.text.startsWith('Product: ')) continue;
    const match = part.text.match(/productId: ([\w-]+); TestCase: [\s\S]*?testCaseId: ([\w-]+); (?:testRunId: [\w-]+; )?artifactId: ([\w-]+); MIME: [^;]+; TestRun notes: ([\s\S]*)$/);
    if (!match || seen.has(match[3]!) || !facts.some(fact => fact.productId === match[1] && fact.testCaseId === match[2] && fact.artifactIds.includes(match[3]!))) continue;
    seen.add(match[3]!);
    if (match[4]!.trim() && match[4]!.trim() !== 'none') records.push(match[4]!.trim());
  }
  return records;
}

/** Narrow safety check, not an NLP proof: independent source review remains required. */
export function firstPersonExperienceIssues(copy: { body: string; interactionQuestion?: string }, context: {
  executionFacts?: ExecutionFact[];
  authorPerspective?: Partial<import('./author-perspective').AuthorPerspective>;
  experienceRecords?: string[];
}) {
  // Quoted product dialogue is not the author's experience.
  const text = [copy.body, copy.interactionQuestion ?? ''].join('\n').replace(/“[^”]*”|「[^」]*」|"[^"\n]*"/g, '');
  const records = [...Object.values(context.authorPerspective ?? {}), ...(context.experienceRecords ?? [])].join('\n');
  const issues: string[] = [];
  const patterns = [
    /我(?:当时|真的|看完|用完|一下子)?(?:挺|很|特别|有点|十分)?(?:意外|惊讶|惊喜|紧张|失望|开心|兴奋|震撼|松了(?:一口)?气)/g,
    /(?:我(?:自己)?(?:花了|用了|折腾了)|花了我|耗了我)[^。！？\n]{0,24}(?:分钟|小时|秒)/g,
    /我(?:会|还会|打算|准备)?(?:继续用|长期用|一直用)/g,
    /我(?:觉得|认为)[^。！？\n]{0,16}(?:最实用|最喜欢|更喜欢|最有用|最满意)|我(?:更看重|更在意|会优先)[^。！？\n]{1,20}/g,
    /我[^。！？\n]{0,12}(?:手动|自己)(?:改|修改|调整|润色)[^。！？\n]{0,12}/g,
    /我[^。！？\n]{0,12}(?:试了|操作了|重试了|点了)\s*[\d一二三四五六七八九十]+次/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    // Free-form TestRun notes may express the same event differently. Their semantic
    // sufficiency is checked against raw evidence by both independent reviewers.
    if (!records.includes(match[0]) && !context.experienceRecords?.length) issues.push(`个人体验缺少作者输入或测试记录：“${match[0]}”`);
  }
  if (!context.executionFacts?.some(fact => fact.artifactIds.length) && /我(?:用[^。！？\n]{0,40}(?:跑|做|测)|把[^。！？\n]{0,40}(?:贴|输)|下载[^。！？\n]{0,20}(?:看|打开))/.test(text)) {
    issues.push('第一人称执行动作缺少当前任务的原始 Artifact');
  }
  return issues;
}

export const communityExpressionRules = [
  "editorialPlan 必须包含 openingAngle（有证据的开头切入角度或个人结论）、closingTakeaway（适用边界与个人感受）。",
  "personalRating 是个人主观评分建议，仅在 config.personalRatingEnabled 且存在人工确认 Findings 的充分证据时 enabled=true，填写 score、scale、reason 和支持评分的 findingIds；否则 enabled=false，省略分数。",
  "评分只能属于 Community Content，不能混入 Final Score / AI Judge，禁止官方评分、综合评分、专业得分、Benchmark Score、AI Judge Score。score 不得超过 config.personalRatingScale。",
  "正文不自行写评分句；程序在结尾渲染‘如果满分…分，我个人会给…分’和 reason。事实核对必须同时核验评分理由及 findingIds；不足则禁用。",
  "不要自己生成 (p1) 或（p1）字符串。screenshotRecommendations 使用真实 artifactId；supportsParagraph 按最终 body 的空行分段从 1 编号（含标题段），supportsClaim 必须是该段中原样出现的事实短句。无法对应则均为 null。最终核对改稿后须同步更新映射。",
].join("\n");

export function buildFindingSections(findings: ExperienceFindingItem[]) {
  const labels = { good: "好用的功能", neutral: "体验一般的功能", problem: "不能用 / 用着难受的功能" } as const;
  return (Object.keys(labels) as Array<keyof typeof labels>).flatMap(category => {
    const items = findings.filter(item => item.category === category);
    return items.length ? [{ category, heading: labels[category], findings: items }] : [];
  });
}

const reportVoice = /总体而言|综合来看|值得注意的是|从这个角度来看|此次测评表明|该功能表现出|体现了|展现出较强|表现出较强|具有一定优势|在实际使用场景中具有较高价值|本次实验结果显示|综上所述/;
const ratingInCopy = /(?:给|打|评分|得分|满分)[^。\n]{0,12}[\d一二三四五六七八九十]+\s*分(?!钟)|\d+(?:\.\d+)?\s*\/\s*(?:5|10)|官方评分|综合评分|专业得分|Benchmark Score|AI Judge Score/i;

// Applied to new generations only; legacy JSON remains readable.
export function communityExpressionIssues(post: CommunityPostOutput, config: PublishConfig, findings: ExperienceFindingItem[] = []) {
  const issues: string[] = [];
  const plan = post.editorialPlan;
  const copy = [post.title, post.body, post.interactionQuestion, ...post.tags].join("\n");
  const reportPhrase = copy.match(reportVoice)?.[0];
  if ((config.stylePreset === "真实体验" || config.stylePreset === "深度观察") && reportPhrase) issues.push(`删除报告腔“${reportPhrase}”，改为事实紧接具体判断`);
  if (findings.length) {
    for (const [category, heading] of Object.entries({ good: "好用的功能", neutral: "体验一般的功能", problem: "不能用 / 用着难受的功能" })) {
      const points = category === "good" ? plan?.highlights : category === "neutral" ? plan?.neutralPoints : plan?.painPoints;
      if (!findings.some(f => f.category === category) && (post.body.includes(heading) || points?.length)) issues.push(`不得虚构空类别：${heading}`);
    }
  }
  if (ratingInCopy.test(copy)) issues.push("评分只能通过 personalRating 结构提供，由程序渲染");
  const rating = plan?.personalRating;
  if (rating?.enabled) {
    if (!config.personalRatingEnabled || !findings.length) issues.push("当前不能生成个人评分");
    if (rating.scale !== config.personalRatingScale || rating.score == null || rating.score < 0 || rating.score > config.personalRatingScale || !rating.reason || !rating.findingIds?.length) issues.push("个人评分缺少有效分值、理由或证据");
    if (rating.findingIds?.some(id => !findings.some(f => f.id === id && f.evidenceArtifactIds.length))) issues.push("个人评分引用了未确认的 Finding");
    if (reportVoice.test(rating.reason ?? "") || ratingInCopy.test(rating.reason ?? "") || /[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(rating.reason ?? "")) issues.push("评分理由只能写具体体验原因");
  } else if (rating && (rating.score != null || rating.reason != null || rating.scale != null || rating.findingIds != null)) issues.push("禁用评分时省略分数及理由");
  if (/[（(]\s*p\d+\s*[)）]/i.test(copy)) issues.push("图片编号由 formatter 生成");
  const paragraphs = post.body.split(/\n\s*\n/).filter(p => p.trim());
  for (const ref of post.screenshotRecommendations) {
    if (ref.supportsParagraph != null && (!ref.supportsClaim || !paragraphs[ref.supportsParagraph - 1]?.includes(ref.supportsClaim))) issues.push("截图需引用最终正文中的实际段落与原文短句");
  }
  return issues;
}
