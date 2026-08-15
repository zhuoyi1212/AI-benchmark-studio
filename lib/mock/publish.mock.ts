import type { BenchmarkProject } from "@/lib/types/project";
import type { BenchmarkScreenshot, CommunityPost, ContentIdea, PublishConfig } from "@/lib/types/publish";
import type { FinalProductScore } from "@/lib/types/review";
import type { FinalResultAnalysis } from "@/lib/types/results";

export const mockPublishConfig: PublishConfig = { channel: "小红书", goal: "提供深度洞察", tone: "真实、克制、有观点，像一个真的测试过产品的人在分享，不要营销感。", length: "800 字左右", imageCount: 6, interactionGoal: "邀请大家分享自己实际使用 AI 产品时最看重什么。" };
export const mockPublishChannels = ["小红书", "站内社区", "知乎", "通用社区"];
export const mockPublishGoals = ["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"];

export function createMockContentIdeas(analysis: FinalResultAnalysis, finalScores: FinalProductScore[], refreshIndex = 0): ContentIdea[] {
  const winner = finalScores[0];
  const runnerUp = finalScores[1];
  const allScreenshotIds = mockScreenshots.map((item) => item.id);
  const winnerScreenshots = mockScreenshots.filter((item) => item.productId === winner?.productId).map((item) => item.id);
  const largestGapInsight = analysis.crossProductInsights[0] ?? "不同评分维度会显著影响最终选型。";
  if (refreshIndex % 2 === 1) {
    return [
      idea("ranking-context", `排名不是答案：${winner?.productName ?? "第一名"}赢在了什么`, "评分解读", analysis.winner?.reason ?? "综合分来自多个维度的加权结果。", largestGapInsight, allScreenshotIds, 0.9, 0.82, true),
      idea("runner-up", `${runnerUp?.productName ?? "第二名"}没有第一，但仍可能更适合一部分人`, "选型判断", runnerUp ? `${runnerUp.productName} 的高分维度仍有明确使用价值。` : "综合排名之外还需要看具体维度。", analysis.recommendationSummary, mockScreenshots.filter((item) => item.productId === runnerUp?.productId).map((item) => item.id), 0.82, 0.88),
      idea("score-gap", "真正拉开产品差距的是哪一个评分维度", "核心发现", largestGapInsight, "维度差异比只看总分更能解释产品为何胜出。", allScreenshotIds, 0.93, 0.76),
    ];
  }
  return [
    idea("winner-is-contextual", `${winner?.productName ?? "综合第一"}拿了第一，但不代表所有人都该选它`, "反常识", analysis.winner?.reason ?? "综合冠军来自当前权重与任务组合。", analysis.recommendationSummary, winnerScreenshots, 0.88, 0.9, true),
    idea("dimension-gap", "这次测评最大的差距，藏在总分下面", "核心发现", largestGapInsight, "拆开维度后，产品之间的真实差异更容易被看见。", allScreenshotIds, 0.94, 0.8),
    idea("locked-score", "人工复核之后，最终排名发生了什么", "方法透明", `${finalScores.reduce((total, item) => total + item.adjustedCount, 0)} 项评分经过人工调整。`, "展示 AI Judge、人工复核与 Final Score 的关系。", allScreenshotIds, 0.84, 0.78),
  ];
}

export function createMockCommunityPost(project: BenchmarkProject, analysis: FinalResultAnalysis, finalScores: FinalProductScore[], config: PublishConfig, selectedIdea: ContentIdea): CommunityPost {
  const winner = finalScores[0];
  const runnerUp = finalScores[1];
  const selectedScreenshotIds = unique([...selectedIdea.relatedScreenshots, ...mockScreenshots.map((item) => item.id)]).slice(0, config.imageCount);
  return {
    id: `community-post-${project.id}-${analysis.generatedFrom.finalScoreSignature}-${selectedIdea.id}`,
    channel: config.channel,
    title: selectedIdea.title,
    body: `我用同一套 Test Protocol 完成了「${project.name}」，所有产品使用相同任务、输入和评分标准。AI Judge 先在 Blind 状态下评分，再由人工复核证据；只有 Final Score 锁定并揭晓身份后，才生成下面的判断。

本轮综合第一是 ${winner?.productName ?? "暂无"}，最终得分 ${winner?.finalScore.toFixed(1) ?? "-"}。${analysis.winner?.reason ?? ""}

但总分只代表当前任务与 Rubric 权重下的综合结果。${analysis.crossProductInsights.join(" ")}

具体看维度，${winner?.productName ?? "第一名"}的主要优势是 ${winner?.dimensionScores.slice().sort((a, b) => b.score - a.score).slice(0, 2).map((item) => `${item.name} ${item.score.toFixed(1)} 分`).join("、")}。${runnerUp ? `${runnerUp.productName} 以 ${runnerUp.finalScore.toFixed(1)} 分排在第二。` : ""}

这也是我认为最值得讨论的地方：${selectedIdea.insight}

我的最终判断是：${analysis.recommendationSummary}`,
    tags: ["AI工具", "产品测评", "Benchmark", "真实体验"],
    interactionQuestion: config.interactionGoal,
    screenshotRecommendations: selectedScreenshotIds.map((screenshotId, index) => ({
      screenshotId,
      reason: `支持帖子中关于最终排名与维度表现的判断。`,
      supportsClaim: selectedIdea.insight,
      supportsParagraph: index < 3 ? 2 : 4,
      order: index + 1,
    })),
  };
}

const screenshotMeta = [
  ["gamma", "01", "structure", "Gamma 对市场机会与执行路线图的结构化输出"], ["canva", "01", "editor", "Canva 的商业汇报视觉与素材编排"], ["beautiful", "01", "structure", "Beautiful.ai 的规范化商业汇报版式"],
  ["gamma", "02", "structure", "Gamma 的长文摘要与章节结构"], ["canva", "02", "editor", "Canva 的研究报告摘要页面"], ["beautiful", "02", "structure", "Beautiful.ai 的趋势报告结构页"],
  ["gamma", "03", "chart", "Gamma 对增长驱动与异常变化的归纳"], ["canva", "03", "chart", "Canva 的数据图表与编辑界面"], ["beautiful", "03", "chart", "Beautiful.ai 的经营数据概览页"],
  ["gamma", "04", "constraint", "Gamma 的极限约束执行结果"], ["canva", "04", "constraint", "Canva 的约束式产品发布页"], ["beautiful", "04", "constraint", "Beautiful.ai 的规范化发布页面"],
] as const;

export const mockScreenshots: BenchmarkScreenshot[] = screenshotMeta.map(([productId, testCaseId, previewVariant, caption]) => ({ id: `shot-${productId}-${testCaseId}`, projectId: "demo", productId, testCaseId, artifactId: `artifact-${testCaseId}-${productId}`, fileUrl: `mock://${productId}-${testCaseId}`, thumbnailUrl: `mock://${productId}-${testCaseId}-thumb`, caption, previewVariant }));

function idea(id: string, title: string, type: string, insight: string, whyInteresting: string, relatedScreenshots: string[], informationValue: number, discussionPotential: number, recommended = false): ContentIdea {
  return { id, title, angle: title, type, insight, whyInteresting, supportingEvidence: [insight], relatedTestCases: unique(mockScreenshots.filter((item) => relatedScreenshots.includes(item.id)).map((item) => item.testCaseId)), relatedScreenshots, informationValue, discussionPotential, confidence: 0.88, recommended };
}

function unique<T>(items: T[]) { return Array.from(new Set(items)); }
