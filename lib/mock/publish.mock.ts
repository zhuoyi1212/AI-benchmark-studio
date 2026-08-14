import type { BenchmarkScreenshot, CommunityPost, ContentIdea, PublishConfig } from "@/lib/types/publish";

export const mockContentIdeas: ContentIdea[] = [
  { id: "score-vs-workflow", title: "综合分最高的 AI，不一定是我最愿意长期用的", angle: "区分一次生成质量与长期工作流效率", type: "反常识", insight: "评分冠军和日常选择可以不是同一个产品。", whyInteresting: "Gamma 综合评分最高，但 Canva 在编辑和长期工作流上的优势，使“评分最高 ≠ 最适合”成为一个值得讨论的问题。", supportingEvidence: ["Gamma 综合分第一", "Canva 可编辑性得分领先"], relatedTestCases: ["01", "03"], relatedScreenshots: ["shot-gamma-01", "shot-canva-01", "shot-beautiful-01", "shot-gamma-03", "shot-canva-03", "shot-beautiful-03"], informationValue: 0.82, discussionPotential: 0.86, confidence: 0.9, recommended: true },
  { id: "structure-over-design", title: "三款 AI PPT 最大的差距，可能根本不是设计", angle: "讨论信息组织而非视觉表面", type: "核心发现", insight: "内容结构和信息组织比视觉表现更能拉开差距。", whyInteresting: "实际测试中，内容结构和信息组织带来的差距，比单纯视觉表现更明显。", supportingEvidence: ["Case 01 的结构得分差异", "Case 02 的信息保留差异"], relatedTestCases: ["01", "02"], relatedScreenshots: ["shot-gamma-01", "shot-canva-01", "shot-beautiful-01"], informationValue: 0.94, discussionPotential: 0.76, confidence: 0.88 },
  { id: "daily-choice", title: "Canva 没拿第一，但我可能反而会继续用它", angle: "从长期使用体验重新看排名", type: "真实体验", insight: "持续编辑的成本会改变最终选择。", whyInteresting: "Canva 的首次生成分数不是最高，但更自由的编辑和素材工作流可能更适合高频使用者。", supportingEvidence: ["Canva 可编辑性领先", "Case 03 图表调整空间更好"], relatedTestCases: ["01", "03"], relatedScreenshots: ["shot-canva-01", "shot-canva-03"], informationValue: 0.75, discussionPotential: 0.88, confidence: 0.82 },
  { id: "chart-failures", title: "AI PPT 做数据图表，比我预期中更容易翻车", angle: "聚焦图表准确性与洞察风险", type: "踩坑", insight: "好看的图表不一定准确传达数据。", whyInteresting: "三款产品在图表选择、标注和洞察表达上都出现过问题，视觉完成度容易掩盖数据表达风险。", supportingEvidence: ["Case 03 图表标注问题", "异常数据解释不足"], relatedTestCases: ["03"], relatedScreenshots: ["shot-gamma-03", "shot-canva-03", "shot-beautiful-03"], informationValue: 0.93, discussionPotential: 0.92, confidence: 0.91 },
];

export const mockRediscoveredContentIdeas: ContentIdea[] = [
  { id: "constraint-tradeoff", title: "限制越明确，AI PPT 的差距反而越容易看清", angle: "用极限约束观察真实指令遵循", type: "实验观察", insight: "约束测试比自由生成更容易暴露能力边界。", whyInteresting: "当页数、字数和色彩都被锁定后，产品之间的指令遵循差异变得更直接。", supportingEvidence: ["Case 04 约束遵循结果"], relatedTestCases: ["04"], relatedScreenshots: ["shot-gamma-04", "shot-canva-04", "shot-beautiful-04"], informationValue: 0.87, discussionPotential: 0.79, confidence: 0.86, recommended: true },
  { id: "first-draft-cost", title: "真正节省时间的不是生成快，而是少返工", angle: "从返工成本评估 AI 工具", type: "工作流洞察", insight: "首屏速度不等于最终交付效率。", whyInteresting: "部分输出生成更快，但结构返工和视觉调整抵消了首次生成节省的时间。", supportingEvidence: ["Case 01 内容结构", "Case 02 信息压缩"], relatedTestCases: ["01", "02"], relatedScreenshots: ["shot-gamma-02", "shot-canva-02", "shot-beautiful-02"], informationValue: 0.9, discussionPotential: 0.84, confidence: 0.85 },
  { id: "beautiful-stability", title: "没有拿高分的稳定，有时反而最适合团队", angle: "讨论组织规范与个人自由的取舍", type: "选型判断", insight: "团队场景对稳定和一致性的权重可能高于自由度。", whyInteresting: "Beautiful.ai 综合排名靠后，但稳定版式在多人协作和品牌规范中仍有明确价值。", supportingEvidence: ["版式稳定性证据", "品牌一致性表现"], relatedTestCases: ["01", "04"], relatedScreenshots: ["shot-beautiful-01", "shot-beautiful-04"], informationValue: 0.78, discussionPotential: 0.81, confidence: 0.8 },
];

export const mockPublishConfig: PublishConfig = { channel: "小红书", goal: "提供深度洞察", tone: "真实、克制、有观点，像一个真的测试过产品的人在分享，不要营销感。", length: "800 字左右", imageCount: 6, interactionGoal: "邀请大家分享自己实际使用 AI PPT 时最看重什么。" };
export const mockPublishChannels = ["小红书", "站内社区", "知乎", "通用社区"];
export const mockPublishGoals = ["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"];

export const mockCommunityPost: CommunityPost = {
  id: "community-post-demo-v1",
  channel: "小红书",
  title: "测完 3 款 AI PPT，我发现“评分最高”真的不等于最好用",
  body: `为了搞清楚 AI PPT 到底能不能真正进入工作流，我用同一套任务、同一份输入和完全相同的 Prompt，测试了 Gamma、Canva 和 Beautiful.ai。每个任务只生成一次，也没有做人工二次美化。

结果很明确：Gamma 综合分最高，内容完整性和结构稳定性尤其突出。如果目标是从零快速得到一份能讲清楚事情的商业汇报，它确实是三款里最省心的。

但测完以后，我发现“首次生成质量”和“长期工作流效率”其实是两件不同的事。Gamma 更像一个很会交初稿的同事；Canva 的初稿未必赢，但在视觉调整、素材替换和继续编辑上明显更自由。

比如商业汇报 Case 里，Gamma 对市场机会、竞争格局和执行路线图的组织最完整，几乎不需要重新梳理页面顺序。对比三份原始输出，它的信息层级也是最稳定的。

到了数据分析 Case，差异开始变化。Gamma 能把增长驱动讲得更清楚，但 Canva 的图表样式和编辑空间更适合继续加工。Beautiful.ai 的布局很稳，却没有充分标出异常数据背后的原因。

这意味着，如果你的目标是十分钟内拿到一份结构靠谱的初稿，综合分最高的 Gamma 很合理；但如果 PPT 会被反复修改、需要团队协作或严格适配品牌，Canva 可能反而更接近日常选择。

我现在的判断是：AI PPT 不该只比较“第一次生成得有多好看”，还要比较它能不能顺利进入后面的真实工作。评分可以告诉我们谁赢了一次测试，但不一定能替每个人决定谁更适合长期使用。`,
  tags: ["AI工具", "AI PPT", "产品测评", "效率工具", "真实体验"],
  interactionQuestion: "你实际使用 AI PPT 时，最看重一次生成质量，还是后续编辑和长期工作流？",
  screenshotRecommendations: [
    { screenshotId: "shot-gamma-01", reason: "支持正文中“Gamma 的信息结构更完整”这一判断。", supportsClaim: "Gamma 的信息结构更完整", supportsParagraph: 4, order: 1 },
    { screenshotId: "shot-canva-01", reason: "与同 Case 输出连续展示，便于比较页面层级。", supportsParagraph: 4, order: 2 },
    { screenshotId: "shot-beautiful-01", reason: "补齐同一任务下三款产品的原始输出证据。", supportsParagraph: 4, order: 3 },
    { screenshotId: "shot-gamma-03", reason: "支持 Gamma 对增长驱动解释更完整的判断。", supportsParagraph: 5, order: 4 },
    { screenshotId: "shot-canva-03", reason: "支持 Canva 图表样式与编辑空间更自由的判断。", supportsParagraph: 5, order: 5 },
    { screenshotId: "shot-beautiful-03", reason: "用于对照布局稳定性与数据洞察深度。", supportsParagraph: 5, order: 6 },
  ],
};

const screenshotMeta = [
  ["gamma", "01", "structure", "Gamma 对市场机会与执行路线图的结构化输出"], ["canva", "01", "editor", "Canva 的商业汇报视觉与素材编排"], ["beautiful", "01", "structure", "Beautiful.ai 的规范化商业汇报版式"],
  ["gamma", "02", "structure", "Gamma 的长文摘要与章节结构"], ["canva", "02", "editor", "Canva 的研究报告摘要页面"], ["beautiful", "02", "structure", "Beautiful.ai 的趋势报告结构页"],
  ["gamma", "03", "chart", "Gamma 对增长驱动与异常变化的归纳"], ["canva", "03", "chart", "Canva 的数据图表与编辑界面"], ["beautiful", "03", "chart", "Beautiful.ai 的经营数据概览页"],
  ["gamma", "04", "constraint", "Gamma 的极限约束执行结果"], ["canva", "04", "constraint", "Canva 的约束式产品发布页"], ["beautiful", "04", "constraint", "Beautiful.ai 的规范化发布页面"],
] as const;

export const mockScreenshots: BenchmarkScreenshot[] = screenshotMeta.map(([productId, testCaseId, previewVariant, caption]) => ({
  id: `shot-${productId}-${testCaseId}`,
  projectId: "demo",
  productId,
  testCaseId,
  artifactId: `artifact-${testCaseId}-${productId}`,
  fileUrl: `mock://${productId}-${testCaseId}`,
  thumbnailUrl: `mock://${productId}-${testCaseId}-thumb`,
  caption,
  previewVariant,
}));
