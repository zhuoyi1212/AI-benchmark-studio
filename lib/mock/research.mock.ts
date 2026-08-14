import type { ResearchResponse } from "@/lib/types/research";

export const mockResearchResponse: ResearchResponse = {
  projectId: "demo",
  products: [
    {
      productId: "gamma", name: "Gamma", officialUrl: "https://gamma.app", initials: "G",
      positioning: "AI 驱动的演示文稿与网页生成工具",
      targetUsers: ["职场用户", "创业者", "内容创作者"],
      capabilities: ["文稿生成", "智能排版", "在线分享"],
      keyFeatures: ["生成速度快", "卡片式编辑", "交互式内容"],
      pricing: { summary: "$10 / 月起", freePlan: "400 AI credits", paidFrom: "10", currency: "USD" },
      sources: [{ title: "Gamma 官网", url: "https://gamma.app", sourceType: "official_website" }],
    },
    {
      productId: "canva", name: "Canva", officialUrl: "https://canva.com", initials: "C",
      positioning: "一站式视觉设计平台与 AI 创作套件",
      targetUsers: ["广泛职场用户", "非专业设计者"],
      capabilities: ["Magic Design", "模板设计", "多人协作"],
      keyFeatures: ["模板丰富", "素材生态完整", "编辑自由度高"],
      pricing: { summary: "$15 / 月起", freePlan: "基础模板与有限 AI 次数", paidFrom: "15", currency: "USD" },
      sources: [{ title: "Canva 官网", url: "https://canva.com", sourceType: "official_website" }],
    },
    {
      productId: "beautiful", name: "Beautiful.ai", officialUrl: "https://beautiful.ai", initials: "B",
      positioning: "自动遵循设计规则的智能演示工具",
      targetUsers: ["销售团队", "市场团队", "企业团队"],
      capabilities: ["Smart Slides", "自动布局", "品牌控制"],
      keyFeatures: ["版式稳定", "企业模板", "品牌一致性"],
      pricing: { summary: "$12 / 月起", freePlan: "14 天试用", paidFrom: "12", currency: "USD" },
      sources: [{ title: "Beautiful.ai 官网", url: "https://beautiful.ai", sourceType: "official_website" }],
    },
  ],
  comparability: {
    status: "comparable",
    score: 0.92,
    reason: "三款产品都支持通过 AI 快速生成演示文稿，存在明确共同任务；同时在生成逻辑、视觉表现和编辑自由度上有足够差异。",
    commonCapabilities: ["内容生成", "PPT 结构", "视觉设计", "图表生成", "编辑能力"],
  },
  generatedAt: "2026-08-12T10:00:00.000Z",
};
