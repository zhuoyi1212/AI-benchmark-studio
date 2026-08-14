import { mockProject } from "@/lib/mock/project.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";
import { mockFinalResultAnalysis, mergeFinalScores } from "@/lib/mock/results.mock";
import { mockStoredReview } from "@/lib/mock/review.mock";
import { calculateCaseScore, calculateFinalProductScores } from "@/lib/review-state";
import type { BenchmarkReport } from "@/lib/types/report";
import type { ReviewScore } from "@/lib/types/review";

const caseFindings: Record<string, string> = {
  "01": "内容组织与商业叙事最能拉开差距，视觉表现并不是唯一决定因素。",
  "02": "关键信息保留普遍优于风险提示，长文压缩仍需要人工核对。",
  "03": "三款产品都能生成图表，但异常解释与数据标注质量差异明显。",
  "04": "严格约束下，指令遵循与版式稳定性之间存在取舍。",
};

const caseAnalysis: Record<string, Record<string, string>> = {
  "01": { gamma: "输出结构完整，管理层叙事最清晰。", canva: "视觉表现成熟，部分商业逻辑需要继续整理。", beautiful: "版式稳定，内容展开相对保守。" },
  "02": { gamma: "摘要与章节结构完整。", canva: "视觉层级清楚，信息压缩较激进。", beautiful: "长文转换稳定，但限制条件呈现较弱。" },
  "03": { gamma: "增长驱动解释最完整。", canva: "图表样式与编辑空间更好。", beautiful: "图表布局稳定，异常原因挖掘不足。" },
  "04": { gamma: "主要约束遵循良好。", canva: "视觉自由度与严格约束之间有取舍。", beautiful: "版式规范稳定，内容弹性较低。" },
};

export function createMockBenchmarkReport(scores: ReviewScore[]): BenchmarkReport {
  const finalScores = calculateFinalProductScores(scores, "revealed");
  const analysis = mergeFinalScores(mockFinalResultAnalysis, finalScores);
  const ranking = finalScores.map((score, index) => ({ productId: score.productId, productName: score.productName, score: score.finalScore, rank: index + 1 }));
  return {
    id: "report-demo-v1",
    projectId: mockProject.id,
    eyebrow: "AI 产品深度测评 · 2026",
    title: "Gamma、Canva、Beautiful.ai：谁才是最好用的 AI PPT？",
    subtitle: `我们用 ${mockProtocol.testCases.length} 类真实工作任务、${mockProtocol.testCases.length * mockProject.products.length} 次独立生成和统一评分框架，测试三款主流 AI 演示工具。结果比“谁更好看”复杂得多。`,
    readingTime: "18 分钟阅读",
    tldr: "如果你只想最快做出一份结构靠谱的商业汇报，选 Gamma。",
    tldrDetail: "Canva 在视觉和编辑上更强，Beautiful.ai 的企业版式最稳。没有绝对赢家，但 Gamma 在这套面向普通职场用户的综合测试中最均衡。",
    methodology: {
      summary: "AI Judge 在隐藏产品身份的情况下完成初始评分。随后由人工在同样保持 Blind 的状态下复核评分证据，仅对明显不合理的项目进行调整。",
      rules: mockProtocol.rules.slice(0, 4).map((rule) => rule.text),
    },
    ranking,
    whyTheseProducts: "三款产品都承诺让非设计专业用户快速制作演示文稿，但路径明显不同：Gamma 从内容生成出发，Canva 依托完整设计生态，Beautiful.ai 则强调智能布局规则。它们拥有足够一致的核心任务，也有值得比较的产品差异。",
    caseReviews: mockProtocol.testCases.map((testCase) => ({
      testCaseId: testCase.id,
      title: testCase.title,
      objective: testCase.objective,
      prompt: testCase.prompt,
      findings: caseFindings[testCase.id],
      productResults: finalScores.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        score: calculateCaseScore(scores, product.sampleId, testCase.id),
        analysis: caseAnalysis[testCase.id]?.[product.productId] ?? "该产品完成了本轮标准化测试。",
        artifactIds: [`artifact-${testCase.id}-${product.productId}`],
      })),
    })),
    productSummaries: analysis.products,
    finalRecommendation: analysis.recommendationSummary,
    limitations: analysis.limitations ?? [],
    generatedAt: "2026-08-14T11:00:00.000Z",
  };
}

export const mockBenchmarkReport = createMockBenchmarkReport(mockStoredReview.scores);
