export type ContentIdea = {
  id: string;
  title: string;
  type: "反常识" | "核心发现" | "真实体验" | "踩坑";
  summary: string;
  informationValue: string;
  discussionPotential: string;
  reason: string;
  recommended?: boolean;
};

export type PublishConfig = {
  channel: string;
  goal: string;
  tone: string;
  length: string;
  imageCount: number;
  interactionGoal: string;
};

export type CommunityPost = {
  title: string;
  body: string;
  tags: string[];
  question: string;
  evidenceBindings: Array<{
    paragraph: number;
    screenshotId: string;
    label: string;
  }>;
};

export type MockScreenshot = {
  id: string;
  image: string;
  product: "Gamma" | "Canva" | "Beautiful.ai";
  productId: "gamma" | "canva" | "beautiful";
  testCase: string;
  caseId: "01" | "02" | "03" | "04";
  caption: string;
  reason: string;
  supportsParagraph: number;
  visual: "structure" | "editor" | "chart" | "constraint";
};

export const contentIdeas: ContentIdea[] = [
  {
    id: "score-vs-workflow",
    title: "综合分最高的 AI，不一定是我最愿意长期用的",
    type: "反常识",
    summary: "把一次性生成质量和长期工作流效率分开看。",
    informationValue: "高",
    discussionPotential: "高",
    reason: "Gamma 综合评分最高，但 Canva 在编辑和长期工作流上的优势，使“评分最高 ≠ 最适合”成为一个值得讨论的问题。",
    recommended: true,
  },
  {
    id: "structure-over-design",
    title: "三款 AI PPT 最大的差距，可能根本不是设计",
    type: "核心发现",
    summary: "真正拉开差距的是内容结构和信息组织。",
    informationValue: "很高",
    discussionPotential: "中高",
    reason: "实际测试中，内容结构和信息组织带来的差距，比单纯视觉表现更明显。",
  },
  {
    id: "canva-daily-choice",
    title: "Canva 没拿第一，但我可能反而会继续用它",
    type: "真实体验",
    summary: "综合排名与个人日常选择可以同时成立。",
    informationValue: "中高",
    discussionPotential: "高",
    reason: "Canva 的首次生成分数不是最高，但更自由的编辑和素材工作流可能更适合高频使用者。",
  },
  {
    id: "chart-failures",
    title: "AI PPT 做数据图表，比我预期中更容易翻车",
    type: "踩坑",
    summary: "好看的图表不一定准确传达数据。",
    informationValue: "很高",
    discussionPotential: "很高",
    reason: "三款产品在图表选择、标注和洞察表达上都出现过问题，视觉完成度容易掩盖数据表达风险。",
  },
];

export const publishConfig: PublishConfig = {
  channel: "小红书",
  goal: "提供深度洞察",
  tone: "真实、克制、有观点，像一个真的测试过产品的人在分享，不要营销感。",
  length: "800 字左右",
  imageCount: 6,
  interactionGoal: "邀请大家分享自己实际使用 AI PPT 时最看重什么。",
};

export const publishChannels = ["小红书", "站内社区", "知乎", "通用社区"];

export const publishGoals = [
  "提供深度洞察",
  "分享真实体验",
  "帮助用户选型",
  "引发讨论",
  "分享踩坑经历",
  "提出反常识观点",
];

export const communityPost: CommunityPost = {
  title: "测完 3 款 AI PPT，我发现“评分最高”真的不等于最好用",
  body: `为了搞清楚 AI PPT 到底能不能真正进入工作流，我用同一套任务、同一份输入和完全相同的 Prompt，测试了 Gamma、Canva 和 Beautiful.ai。每个任务只生成一次，也没有做人工二次美化。

结果很明确：Gamma 综合分最高，内容完整性和结构稳定性尤其突出。如果目标是从零快速得到一份能讲清楚事情的商业汇报，它确实是三款里最省心的。

但测完以后，我发现“首次生成质量”和“长期工作流效率”其实是两件不同的事。Gamma 更像一个很会交初稿的同事；Canva 的初稿未必赢，但在视觉调整、素材替换和继续编辑上明显更自由。

比如商业汇报 Case 里，Gamma 对市场机会、竞争格局和执行路线图的组织最完整，几乎不需要重新梳理页面顺序。对比三份原始输出，它的信息层级也是最稳定的。【证据：图片 1–3】

到了数据分析 Case，差异开始变化。Gamma 能把增长驱动讲得更清楚，但 Canva 的图表样式和编辑空间更适合继续加工。Beautiful.ai 的布局很稳，却没有充分标出异常数据背后的原因。【证据：图片 4–6】

这意味着，如果你的目标是十分钟内拿到一份结构靠谱的初稿，综合分最高的 Gamma 很合理；但如果 PPT 会被反复修改、需要团队协作或严格适配品牌，Canva 可能反而更接近日常选择。

我现在的判断是：AI PPT 不该只比较“第一次生成得有多好看”，还要比较它能不能顺利进入后面的真实工作。评分可以告诉我们谁赢了一次测试，但不一定能替每个人决定谁更适合长期使用。`,
  tags: ["AI工具", "AI PPT", "产品测评", "效率工具", "真实体验"],
  question: "你实际使用 AI PPT 时，最看重一次生成质量，还是后续编辑和长期工作流？",
  evidenceBindings: [
    { paragraph: 4, screenshotId: "gamma-case-01", label: "证据：图片 1–3" },
    { paragraph: 5, screenshotId: "gamma-case-03", label: "证据：图片 4–6" },
  ],
};

export const screenshots: MockScreenshot[] = [
  { id: "gamma-case-01", image: "mock://gamma-case-01", product: "Gamma", productId: "gamma", testCase: "Case 01 · 商业汇报生成", caseId: "01", caption: "Gamma 对市场机会与执行路线图的结构化输出", reason: "支持正文中“Gamma 的信息结构更完整”这一判断。", supportsParagraph: 4, visual: "structure" },
  { id: "canva-case-01", image: "mock://canva-case-01", product: "Canva", productId: "canva", testCase: "Case 01 · 商业汇报生成", caseId: "01", caption: "Canva 的商业汇报视觉与素材编排", reason: "与 Gamma 同 Case 连续展示，便于直观比较页面层级。", supportsParagraph: 4, visual: "editor" },
  { id: "beautiful-case-01", image: "mock://beautiful-case-01", product: "Beautiful.ai", productId: "beautiful", testCase: "Case 01 · 商业汇报生成", caseId: "01", caption: "Beautiful.ai 的规范化商业汇报版式", reason: "补齐同一任务下三款产品的原始输出证据。", supportsParagraph: 4, visual: "structure" },
  { id: "gamma-case-03", image: "mock://gamma-case-03", product: "Gamma", productId: "gamma", testCase: "Case 03 · 数据分析 PPT", caseId: "03", caption: "Gamma 对增长驱动与异常变化的归纳", reason: "支持正文中“Gamma 能把增长驱动讲得更清楚”的判断。", supportsParagraph: 5, visual: "chart" },
  { id: "canva-case-03", image: "mock://canva-case-03", product: "Canva", productId: "canva", testCase: "Case 03 · 数据分析 PPT", caseId: "03", caption: "Canva 的数据图表与编辑界面", reason: "支持正文中“Canva 图表样式与编辑空间更自由”的判断。", supportsParagraph: 5, visual: "chart" },
  { id: "beautiful-case-03", image: "mock://beautiful-case-03", product: "Beautiful.ai", productId: "beautiful", testCase: "Case 03 · 数据分析 PPT", caseId: "03", caption: "Beautiful.ai 的经营数据概览页", reason: "用于对照布局稳定性与数据洞察深度。", supportsParagraph: 5, visual: "chart" },
  { id: "gamma-case-02", image: "mock://gamma-case-02", product: "Gamma", productId: "gamma", testCase: "Case 02 · 长文转 PPT", caseId: "02", caption: "Gamma 的长文摘要与章节结构", reason: "适合补充内容压缩与信息保留能力的证据。", supportsParagraph: 3, visual: "structure" },
  { id: "canva-case-02", image: "mock://canva-case-02", product: "Canva", productId: "canva", testCase: "Case 02 · 长文转 PPT", caseId: "02", caption: "Canva 的研究报告摘要页面", reason: "可替换为视觉表达与信息压缩的对照图。", supportsParagraph: 3, visual: "editor" },
  { id: "beautiful-case-02", image: "mock://beautiful-case-02", product: "Beautiful.ai", productId: "beautiful", testCase: "Case 02 · 长文转 PPT", caseId: "02", caption: "Beautiful.ai 的趋势报告结构页", reason: "展示智能布局在长文转换任务中的稳定表现。", supportsParagraph: 3, visual: "structure" },
  { id: "gamma-case-04", image: "mock://gamma-case-04", product: "Gamma", productId: "gamma", testCase: "Case 04 · 极限约束测试", caseId: "04", caption: "Gamma 的极限约束执行结果", reason: "适合讨论字数、色彩和页面结构约束的遵循程度。", supportsParagraph: 6, visual: "constraint" },
  { id: "canva-case-04", image: "mock://canva-case-04", product: "Canva", productId: "canva", testCase: "Case 04 · 极限约束测试", caseId: "04", caption: "Canva 的约束式产品发布页", reason: "展示视觉自由度与严格约束之间的取舍。", supportsParagraph: 6, visual: "constraint" },
  { id: "beautiful-case-04", image: "mock://beautiful-case-04", product: "Beautiful.ai", productId: "beautiful", testCase: "Case 04 · 极限约束测试", caseId: "04", caption: "Beautiful.ai 的规范化发布页面", reason: "适合对比三款产品的指令遵循与版式稳定性。", supportsParagraph: 6, visual: "constraint" },
];

export const selectedScreenshots = [
  "gamma-case-01",
  "canva-case-01",
  "beautiful-case-01",
  "gamma-case-03",
  "canva-case-03",
  "beautiful-case-03",
];
