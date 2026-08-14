import { mockBenchmarkReport } from "@/lib/mock/report.mock";
import { mockCommunityPost, mockContentIdeas, mockRediscoveredContentIdeas } from "@/lib/mock/publish.mock";
import { mockFinalResultAnalysis } from "@/lib/mock/results.mock";
import { mockResearchResponse } from "@/lib/mock/research.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";
import { mockJudgeResults } from "@/lib/mock/review.mock";
import type { CommunityPost, ContentIdea, PublishConfig } from "@/lib/types/publish";

export async function getResearchResult() { return mockResearchResponse; }
export async function generateProtocol() { return mockProtocol; }
export async function getJudgeResults() { return mockJudgeResults; }
export async function generateFinalResultAnalysis() { return mockFinalResultAnalysis; }
export async function generateReport() { return mockBenchmarkReport; }

export async function discoverContentIdeas(_projectId: string, refreshIndex = 0): Promise<ContentIdea[]> {
  return refreshIndex % 2 === 0 ? mockContentIdeas : mockRediscoveredContentIdeas;
}

export async function generateCommunityPost(_projectId: string, config: PublishConfig, _idea: ContentIdea): Promise<CommunityPost> {
  return { ...mockCommunityPost, channel: config.channel, screenshotRecommendations: mockCommunityPost.screenshotRecommendations.slice(0, config.imageCount) };
}
