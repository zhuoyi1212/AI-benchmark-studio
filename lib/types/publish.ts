export type ContentIdea = {
  id: string;
  title: string;
  angle: string;
  type: string;
  insight: string;
  whyInteresting: string;
  supportingEvidence: string[];
  relatedTestCases: string[];
  relatedScreenshots: string[];
  informationValue: number;
  discussionPotential: number;
  confidence: number;
  recommended?: boolean;
};

export type PublishConfig = {
  channel: string;
  goal?: string;
  tone: string;
  length: string;
  imageCount: number;
  interactionGoal: string;
};

export type ScreenshotRecommendation = {
  screenshotId: string;
  reason: string;
  supportsClaim?: string;
  supportsParagraph?: number;
  order: number;
};

export type CommunityPost = {
  id: string;
  channel: string;
  title: string;
  body: string;
  tags: string[];
  interactionQuestion?: string;
  screenshotRecommendations: ScreenshotRecommendation[];
};

export type BenchmarkScreenshot = {
  id: string;
  projectId: string;
  productId: string;
  testCaseId: string;
  artifactId: string;
  fileUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  previewVariant: "structure" | "editor" | "chart" | "constraint";
};
