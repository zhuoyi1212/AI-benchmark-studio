export const analysisImagePolicyVersion = "analysis-image.v1";

export function analysisImagePaths(sourcePath: string): string[] {
  if (!/^projects\/[a-f0-9-]+\/runs\/[a-f0-9-]+\/[a-f0-9-]+\.(png|jpg|webp)$/.test(sourcePath)) return [];
  return ["png", "jpg"].map(extension => `${sourcePath}.${analysisImagePolicyVersion}.${extension}`);
}
