export type Product = {
  id: string;
  name: string;
  initials: string;
  positioning: string;
  capabilities: string[];
  audience: string;
  freePlan: string;
  price: string;
  features: string[];
};

export type TestCase = {
  id: string;
  title: string;
  purpose: string;
  prompt: string;
  input: string;
  focus: string[];
};

export type Rubric = {
  name: string;
  weight: number;
  standard: string;
};

export const products: Product[] = [
  {
    id: "gamma",
    name: "Gamma",
    initials: "G",
    positioning: "AI 驱动的演示文稿与网页生成工具",
    capabilities: ["文稿生成", "智能排版", "在线分享"],
    audience: "职场用户、创业者与内容创作者",
    freePlan: "400 AI credits",
    price: "$10 / 月起",
    features: ["生成速度快", "卡片式编辑", "交互式内容"],
  },
  {
    id: "canva",
    name: "Canva",
    initials: "C",
    positioning: "一站式视觉设计平台与 AI 创作套件",
    capabilities: ["Magic Design", "模板设计", "多人协作"],
    audience: "广泛职场用户与非专业设计者",
    freePlan: "基础模板与有限 AI 次数",
    price: "$15 / 月起",
    features: ["模板丰富", "素材生态完整", "编辑自由度高"],
  },
  {
    id: "beautiful",
    name: "Beautiful.ai",
    initials: "B",
    positioning: "自动遵循设计规则的智能演示工具",
    capabilities: ["Smart Slides", "自动布局", "品牌控制"],
    audience: "销售、市场与企业团队",
    freePlan: "14 天试用",
    price: "$12 / 月起",
    features: ["版式稳定", "企业模板", "品牌一致性"],
  },
];

export const projects = [
  {
    id: "demo",
    name: "AI PPT 产品横向测评",
    products: products.map((product) => product.name),
    status: "测试进行中",
    createdAt: "2026-08-12",
    progress: 67,
    completed: "8 / 12",
  },
];

export const commonCapabilities = ["内容生成", "PPT 结构", "视觉设计", "图表生成", "编辑能力"];

export const testCases: TestCase[] = [
  {
    id: "01",
    title: "商业汇报生成",
    purpose: "评估从简短业务背景生成完整商业汇报的综合能力。",
    prompt: "为一家计划进入东南亚市场的中国 SaaS 公司生成一份 10 页商业汇报，包含市场机会、竞争格局、进入策略与执行路线图。受众为公司管理层。",
    input: "公司背景、目标市场、产品核心优势（统一 Markdown 文档）",
    focus: ["叙事完整性", "商业逻辑", "页面层级", "视觉专业度"],
  },
  {
    id: "02",
    title: "长文转 PPT",
    purpose: "评估对长文本的理解、压缩和结构化表达能力。",
    prompt: "将提供的 3,000 字行业研究报告转为 8 页演示文稿，保留关键结论、数据与风险提示，避免大段文字。",
    input: "《2026 企业 AI 应用趋势》研究摘要",
    focus: ["关键信息保留", "内容压缩", "逻辑结构", "可读性"],
  },
  {
    id: "03",
    title: "数据分析 PPT",
    purpose: "评估将结构化数据转化为洞察和图表的能力。",
    prompt: "根据提供的季度营收数据生成 6 页经营分析汇报，识别增长驱动、异常变化并给出下一季度建议。",
    input: "12 个月营收、客户与渠道数据表",
    focus: ["数据准确性", "图表选择", "洞察质量", "建议可执行性"],
  },
  {
    id: "04",
    title: "极限约束测试",
    purpose: "评估在严格格式、篇幅与品牌约束下的指令遵循能力。",
    prompt: "生成 5 页产品发布演示。每页不超过 35 个汉字，仅使用黑、白、蓝三色；必须包含时间轴、对比表和结尾行动号召。",
    input: "产品发布说明与品牌规范",
    focus: ["约束遵循", "信息取舍", "版式稳定性", "异常处理"],
  },
];

export const rubrics: Rubric[] = [
  { name: "内容完整性", weight: 20, standard: "核心任务覆盖完整，无关键模块缺失；重要结论有充分上下文。" },
  { name: "信息准确性", weight: 20, standard: "忠实使用输入材料，无事实捏造、数据错配或结论偏移。" },
  { name: "逻辑结构", weight: 15, standard: "叙事顺序清晰，页面之间有自然递进，结论可被快速理解。" },
  { name: "视觉设计", weight: 20, standard: "版式专业一致，层级明确，可读性良好，视觉元素服务于内容。" },
  { name: "图表质量", weight: 15, standard: "图表类型匹配数据，标注完整，能准确传达关键趋势。" },
  { name: "可编辑性", weight: 10, standard: "生成内容可被方便修改，结构稳定，不依赖难以调整的扁平素材。" },
];

export const productScores = [
  { name: "Gamma", score: 8.7, values: [9.2, 8.8, 8.9, 8.7, 8.2, 8.1], color: "bg-blue-600" },
  { name: "Canva", score: 8.3, values: [8.5, 8.6, 8.1, 9.1, 7.8, 9.0], color: "bg-slate-700" },
  { name: "Beautiful.ai", score: 7.9, values: [7.8, 8.4, 8.2, 8.6, 7.2, 7.1], color: "bg-slate-400" },
];

export const blindSamples = [
  {
    sample: "Sample A",
    product: "Gamma",
    score: 8.7,
    metrics: [
      { name: "内容完整性", score: 9.2, reason: "任务要点覆盖最完整，叙事连贯。", evidence: "4 个 Case 均包含目标、结论与行动建议。", confidence: "高" },
      { name: "信息准确性", score: 8.8, reason: "数据引用基本准确，仅有轻微概括。", evidence: "Case 03 中 12 组数据均被正确映射。", confidence: "高" },
      { name: "视觉设计", score: 8.7, reason: "层级清楚，整体风格稳定。", evidence: "标题、正文、关键数字形成明确三级层次。", confidence: "中" },
      { name: "图表质量", score: 8.2, reason: "图表表达准确，类型选择合理。", evidence: "趋势用折线、构成用堆叠柱状图。", confidence: "高" },
    ],
  },
  {
    sample: "Sample B",
    product: "Beautiful.ai",
    score: 7.9,
    metrics: [
      { name: "内容完整性", score: 7.8, reason: "结构完整，但部分结论偏简略。", evidence: "Case 02 缺少限制条件总结。", confidence: "高" },
      { name: "信息准确性", score: 8.4, reason: "原始信息还原可靠。", evidence: "未发现明显事实偏差。", confidence: "中" },
      { name: "视觉设计", score: 8.6, reason: "版式规整，品牌一致性好。", evidence: "所有页面网格与边距稳定。", confidence: "高" },
      { name: "图表质量", score: 7.2, reason: "图表清晰但洞察表达有限。", evidence: "图表缺少关键异常点标注。", confidence: "中" },
    ],
  },
  {
    sample: "Sample C",
    product: "Canva",
    score: 8.3,
    metrics: [
      { name: "内容完整性", score: 8.5, reason: "关键模块覆盖充分。", evidence: "商业背景和建议部分信息密度合适。", confidence: "高" },
      { name: "信息准确性", score: 8.6, reason: "数据与输入材料一致。", evidence: "主要指标均保持原始单位与口径。", confidence: "高" },
      { name: "视觉设计", score: 9.1, reason: "视觉表现突出，素材选择丰富。", evidence: "图文比例与色彩使用最成熟。", confidence: "中" },
      { name: "图表质量", score: 7.8, reason: "呈现美观，但个别图表装饰偏多。", evidence: "Case 03 环形图降低了精确比较效率。", confidence: "中" },
    ],
  },
];

export const workflow = [
  { label: "产品调研", href: "/projects/demo/research" },
  { label: "测评方案", href: "/projects/demo/protocol" },
  { label: "测试执行", href: "/projects/demo/test" },
  { label: "盲评", href: "/projects/demo/review" },
  { label: "结果", href: "/projects/demo/results" },
  { label: "报告", href: "/projects/demo/report" },
  { label: "发布包", href: "/projects/demo/publish" },
];
