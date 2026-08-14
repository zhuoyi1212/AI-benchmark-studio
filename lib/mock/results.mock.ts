import { mockProject } from "@/lib/mock/project.mock";
import { mockRevealedReview } from "@/lib/mock/review.mock";
import { calculateFinalProductScores } from "@/lib/review-state";
import type { FinalResultAnalysis } from "@/lib/types/results";

const initialScores = calculateFinalProductScores(mockRevealedReview.scores, mockRevealedReview.status);

const productAnalysis = {
  gamma: {
    headline: "生成速度与叙事结构最均衡",
    strengths: ["内容结构完整", "首次生成质量高"],
    weaknesses: ["精细排版自由度一般"],
    bestFor: ["追求快速交付的产品、咨询与创业团队"],
    notIdealFor: ["需要像素级品牌控制的设计团队"],
    keyFindings: ["复杂信息结构更稳定", "商业汇报首次成稿率最高"],
  },
  canva: {
    headline: "视觉与编辑能力最突出",
    strengths: ["模板与素材丰富", "后期编辑灵活"],
    weaknesses: ["复杂数据洞察偏弱"],
    bestFor: ["重视视觉表现与持续编辑的市场团队"],
    notIdealFor: ["希望一次生成直接完成复杂分析的用户"],
    keyFindings: ["视觉质量领先", "更适合持续修改的长期工作流"],
  },
  beautiful: {
    headline: "版式稳定，品牌一致性可靠",
    strengths: ["智能布局稳定", "企业风格统一"],
    weaknesses: ["内容生成较保守", "编辑限制较多"],
    bestFor: ["强调规范与一致性的销售和企业团队"],
    notIdealFor: ["需要自由创作和复杂定制的用户"],
    keyFindings: ["版式规范稳定", "数据洞察深度相对有限"],
  },
};

export const mockFinalResultAnalysis: FinalResultAnalysis = {
  projectId: mockProject.id,
  winner: { productId: initialScores[0].productId, reason: "内容组织、生成速度与首次成稿质量形成了最均衡的综合表现。" },
  products: initialScores.map((score, index) => ({
    productId: score.productId,
    productName: score.productName,
    finalScore: score.finalScore,
    rank: index + 1,
    ...productAnalysis[score.productId as keyof typeof productAnalysis],
  })),
  crossProductInsights: ["首次生成质量与长期工作流效率不是同一概念。", "复杂信息组织带来的差距比单纯视觉表现更明显。"],
  recommendationSummary: "大多数普通职场用户可优先选择 Gamma；重视后续视觉编辑时选择 Canva；重视版式规范和品牌一致性时考虑 Beautiful.ai。",
  limitations: ["仅覆盖中文商业汇报场景。", "产品功能、模型与订阅方案会持续变化。"],
};

export function mergeFinalScores(analysis: FinalResultAnalysis, scores = initialScores): FinalResultAnalysis {
  const scoreByProduct = new Map(scores.map((score) => [score.productId, score]));
  const products = analysis.products.map((product) => {
    const score = scoreByProduct.get(product.productId);
    return { ...product, finalScore: score?.finalScore ?? product.finalScore };
  }).sort((a, b) => b.finalScore - a.finalScore).map((product, index) => ({ ...product, rank: index + 1 }));
  return { ...analysis, winner: products[0] ? { productId: products[0].productId, reason: analysis.winner?.reason ?? products[0].headline } : undefined, products };
}
