import type { Json } from '@/lib/types/database';

export const quickJobKinds = ['research', 'protocol', 'evaluate', 'findings', 'discovery', 'publish', 'analysis', 'report'] as const;
export type QuickJobKind = typeof quickJobKinds[number];
export type QuickJob = {
  id: string; project_id: string; kind: QuickJobKind; scope: string; payload: Json;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number; lease_token: string | null; lease_until: string | null;
  available_at: string; stage: string | null; error_message: string | null; result: Json;
  created_at: string; updated_at: string;
};
export type NextQuickJob = { kind: QuickJobKind; scope: string; payload?: Json };
export const quickStageLabels: Record<string, string> = {
  research: '准备产品资料', protocol: '生成测试方案', evaluate: '匿名分析结果', findings: '提炼测评发现',
  discovery: '选择文章主题', publish: '生成文章', analysis: '整理专业分析', report: '生成专业报告',
  PublicationVideoObservations: '读取视频细节', CommunityStoryBrief: '确定文章主线', CommunityPostReview: '核验初稿', CommunityPostRevision: '修订已发现的问题', CommunityPostDraft: '撰写初稿', ReviewedCommunityPost: '核验初稿', HumanizedCommunityPost: '调整语言', EvidenceCheckedCommunityPost: '最终保真检查',
};
