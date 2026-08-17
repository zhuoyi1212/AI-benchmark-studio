import type { TestProtocol } from "@/lib/types/protocol";

export const PROTOCOL_STORAGE_KEY = "ai-benchmark-protocol-v3";

export const mockProtocol: TestProtocol = {
  id: "protocol-demo-v1",
  projectId: "demo",
  researchRunId: "research-demo-v1",
  version: 1,
  title: "AI PPT 横向测试",
  goal: "判断哪款 AI PPT 产品最适合普通职场用户制作商业汇报，重点关注内容质量、视觉呈现与后续编辑成本。",
  status: "draft",
  testMode: "standardized",
  rules: [
    { id: "same-input", text: "使用相同原始输入" },
    { id: "same-prompt", text: "使用相同 Prompt" },
    { id: "single-generation", text: "每个 Prompt 只生成一次" },
    { id: "no-editing", text: "不进行人工二次编辑" },
    { id: "complete-upload", text: "测试结果完整上传" },
  ],
  testCases: [
    { id: "01", title: "商业汇报生成", objective: "评估从简短业务背景生成完整商业汇报的综合能力。", prompt: "为一家计划进入东南亚市场的中国 SaaS 公司生成一份 10 页商业汇报，包含市场机会、竞争格局、进入策略与执行路线图。受众为公司管理层。", inputDescription: "公司背景、目标市场、产品核心优势（统一 Markdown 文档）", observationFocus: ["叙事完整性", "商业逻辑", "页面层级", "视觉专业度"] },
    { id: "02", title: "长文转 PPT", objective: "评估对长文本的理解、压缩和结构化表达能力。", prompt: "将提供的 3,000 字行业研究报告转为 8 页演示文稿，保留关键结论、数据与风险提示，避免大段文字。", inputDescription: "《2026 企业 AI 应用趋势》研究摘要", observationFocus: ["关键信息保留", "内容压缩", "逻辑结构", "可读性"] },
    { id: "03", title: "数据分析 PPT", objective: "评估将结构化数据转化为洞察和图表的能力。", prompt: "根据提供的季度营收数据生成 6 页经营分析汇报，识别增长驱动、异常变化并给出下一季度建议。", inputDescription: "12 个月营收、客户与渠道数据表", observationFocus: ["数据准确性", "图表选择", "洞察质量", "建议可执行性"] },
    { id: "04", title: "极限约束测试", objective: "评估在严格格式、篇幅与品牌约束下的指令遵循能力。", prompt: "生成 5 页产品发布演示。每页不超过 35 个汉字，仅使用黑、白、蓝三色；必须包含时间轴、对比表和结尾行动号召。", inputDescription: "产品发布说明与品牌规范", observationFocus: ["约束遵循", "信息取舍", "版式稳定性", "异常处理"] },
  ],
  rubric: [
    { id: "completeness", name: "内容完整性", weight: 20, scoringStandard: { excellent: "核心任务覆盖完整，无关键模块缺失；重要结论有充分上下文。", good: "覆盖主要任务，仅有少量次要信息缺失。", poor: "存在影响任务完成的关键缺失。" } },
    { id: "accuracy", name: "信息准确性", weight: 20, scoringStandard: { excellent: "忠实使用输入材料，无事实捏造、数据错配或结论偏移。", good: "事实总体准确，仅有不影响结论的轻微概括。", poor: "存在明显事实或数据错误。" } },
    { id: "structure", name: "逻辑结构", weight: 15, scoringStandard: { excellent: "叙事顺序清晰，页面之间有自然递进，结论可被快速理解。", good: "整体结构清楚，局部衔接仍可优化。", poor: "叙事跳跃，难以形成完整判断。" } },
    { id: "visual_design", name: "视觉设计", weight: 20, scoringStandard: { excellent: "版式专业一致，层级明确，可读性良好，视觉元素服务于内容。", good: "整体清晰统一，少量页面存在层级或排版问题。", poor: "视觉层级混乱并影响阅读。" } },
    { id: "chart_quality", name: "图表质量", weight: 15, scoringStandard: { excellent: "图表类型匹配数据，标注完整，能准确传达关键趋势。", good: "主要图表准确，部分标注或洞察可以加强。", poor: "图表选择或数据表达存在明显问题。" } },
    { id: "editability", name: "可编辑性", weight: 10, scoringStandard: { excellent: "生成内容可被方便修改，结构稳定，不依赖难以调整的扁平素材。", good: "常规内容可编辑，局部元素调整成本较高。", poor: "关键内容难以继续修改。" } },
  ],
  createdAt: "2026-08-12T11:00:00.000Z",
};
