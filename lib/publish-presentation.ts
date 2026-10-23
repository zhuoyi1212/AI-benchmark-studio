import type { PublishWorkspace } from "./services/publish.service";

// Keep internal prompts, execution notes and source-review traces on the server.
export function publishPresentation(workspace: PublishWorkspace, admin: boolean): PublishWorkspace {
  if (admin) return workspace;
  const pack = workspace.pack;
  const post = pack?.post;
  return {
    ...workspace,
    regenerationJob: null,
    screenshots: workspace.screenshots.map(image => ({ ...image, caption: null })),
    pack: pack ? {
      ...pack, errorMessage: null, ideas: [], selectedIdea: null,
      config: { ...pack.config, authorPerspective: undefined, tone: "", interactionGoal: "" },
      post: post ? {
        title: post.title, body: post.body, tags: post.tags, interactionQuestion: post.interactionQuestion,
        screenshotRecommendations: post.screenshotRecommendations.map(image => ({ ...image, reason: "原始测试配图" })),
      } : null,
    } : null,
  };
}
