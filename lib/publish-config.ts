import type { PublishConfig } from "@/lib/ai/schemas/publish.schemas";

export const publishChannels = ["小红书", "站内社区", "知乎", "通用社区"] as const;
export const publishGoals = ["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"] as const;
export const publishStylePresets = ["真实体验", "克制评测", "专业分析"] as const;
export const publishStructures = ["好用 / 一般 / 难用", "优点 / 问题 / 结论", "自由结构"] as const;
export const defaultPublishConfig: PublishConfig = {
  channel: "小红书",
  goal: "分享真实体验",
  stylePreset: "真实体验",
  structure: "好用 / 一般 / 难用",
  tone: "第一人称、直接、短句。先说结论，再讲具体功能和真实问题；像真实测试记录，不写成媒体稿或 AI 总结。",
  length: "800 字左右",
  imageCount: 6,
  interactionGoal: "用一句自然的问题邀请读者补充自己的真实使用体验。",
};
