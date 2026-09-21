import type { CommunityPostOutput, PublishConfig } from "./ai/schemas/publish.schemas";
import type { ExperienceFindingItem } from "./ai/schemas/findings.schemas";

export const experienceWritingRules = [
  "真实体验使用第一人称，先说结论：开头用我这次、我的感受是或实际用下来，紧接有证据的判断，不先介绍产品背景。",
  "每个功能按功能名称 → 直接判断 → 本次实际测试现象 → 使用影响组织；好用、一般、有点鸡肋、不够深、很方便等判断必须紧接具体事实。",
  "当 config.structure=好用 / 一般 / 难用时，按给定 findingSections 分类，省略空类别，结尾写个人感受；不要机械写优点/缺点/总结。",
  "禁止报告腔：总体而言、综合来看、值得注意的是、从这个角度来看、此次测评表明、该功能表现出、体现了、展现出较强、表现出较强、具有一定优势、在实际使用场景中具有较高价值、本次实验结果显示、综上所述。",
  "第一人称操作必须有真实 Test / Artifact 支持；不能把任务中的角色经历当作者经历。只测一次不能说经常失败，一个网站失败不能说非主流平台失败率高；没有竞品实测证据不能比较竞品。",
].join("\n");

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
const ratingInCopy = /(?:给|打|评分|得分|满分)[^。\n]{0,12}[\d一二三四五六七八九十]+\s*分|\d+(?:\.\d+)?\s*\/\s*(?:5|10)|官方评分|综合评分|专业得分|Benchmark Score|AI Judge Score/i;

// Applied to new generations only; legacy JSON remains readable.
export function communityExpressionIssues(post: CommunityPostOutput, config: PublishConfig, findings: ExperienceFindingItem[] = []) {
  const issues: string[] = [];
  const plan = post.editorialPlan;
  const copy = [post.title, post.body, post.interactionQuestion, ...post.tags].join("\n");
  if (!plan?.openingAngle || !plan.closingTakeaway) issues.push("补齐 openingAngle 与 closingTakeaway");
  if ((config.stylePreset === "真实体验" || config.stylePreset === "深度观察") && reportVoice.test(copy)) issues.push("删除报告腔，改为事实紧接具体判断");
  if (config.stylePreset === "真实体验") {
    if (!/我这次|我的感受是|实际用下来|我.*(?:测|试|觉得|感受)/.test(post.body.split(/\n\s*\n/)[0] ?? "")) issues.push("开头须先说个人结论");
  }
  if (config.structure === "好用 / 一般 / 难用" && findings.length) {
    const sections = buildFindingSections(findings);
    const expected = [...sections.map(s => s.heading), "个人感受"];
    let previous = -1;
    for (const heading of expected) {
      const at = post.body.indexOf(heading);
      if (at <= previous) issues.push(`按顺序保留章节：${heading}`);
      previous = at;
    }
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
