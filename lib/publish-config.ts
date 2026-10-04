import type { PublishConfig } from "@/lib/ai/schemas/publish.schemas";

export const publishChannels = ["小红书", "站内社区", "知乎", "通用社区"] as const;
export const publishGoals = ["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"] as const;
export const publishStylePresets = ["真实体验", "克制评测", "专业分析", "深度观察"] as const;
export const publishStructures = ["好用 / 一般 / 难用", "优点 / 问题 / 结论", "自由结构", "场景深度测评", "多维度测评"] as const;
export const defaultPublishConfig: PublishConfig = {
  channel: "小红书",
  goal: "分享真实体验",
  stylePreset: "真实体验",
  structure: "自由结构",
  tone: "直接、具体、自然。先说场景或有依据的结论，再讲现象和影响；不虚构个人感受。",
  length: "800 字以内，材料少则缩短",
  imageCount: 6,
  personalRatingEnabled: false,
  personalRatingScale: 5,
  interactionGoal: "有具体讨论价值时提问，否则省略互动句。",
};

export const publishWritingPresets = [
  { label: "体验清单", stylePreset: "真实体验", structure: "自由结构", length: "800 字以内，材料少则缩短", tone: "先说结论或场景；每个功能用具体发现组织，不输出好用/一般/难用分类标签。" },
  { label: "场景深度测评", stylePreset: "深度观察", structure: "场景深度测评", length: "1500–2200 字，材料少则缩短", tone: "围绕一个真实任务展开。具体场景、实际结果、工作流影响和适用边界逐层推进；不重复总结。" },
  { label: "多维度测评", stylePreset: "深度观察", structure: "多维度测评", length: "1800–2800 字，维度按证据决定", tone: "从真实测试选出有信息量的维度。每节用具体案例支撑判断，不凑维度，不推测模型原理。" },
] as const satisfies ReadonlyArray<{ label: string } & Pick<PublishConfig, "stylePreset" | "structure" | "length" | "tone">>;

export function applyWritingPreset(config: PublishConfig, preset: typeof publishWritingPresets[number]): PublishConfig {
  const { label: _label, ...writing } = preset;
  return { ...config, ...writing };
}
