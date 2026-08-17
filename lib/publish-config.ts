import type { PublishConfig } from "@/lib/ai/schemas/publish.schemas";

export const publishChannels = ["小红书", "站内社区", "知乎", "通用社区"] as const;
export const publishGoals = ["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"] as const;
export const defaultPublishConfig: PublishConfig = {
  channel: "小红书",
  goal: "提供深度洞察",
  tone: "真实、克制、有观点，像一个真的测试过产品的人在分享，不要营销感。",
  length: "800 字左右",
  imageCount: 6,
  interactionGoal: "邀请大家分享自己实际使用 AI 产品时最看重什么。",
};
