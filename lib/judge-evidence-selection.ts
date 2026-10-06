import type { ExpectedOutputType } from "@/lib/types/protocol";

type EvidenceFamily = "video" | "document" | "image" | "text";

export type JudgeEvidenceInput = {
  blind_sample_id: string;
  artifact_id: string;
  mime_type: string;
};

export class JudgeEvidenceSelectionError extends Error {
  constructor() {
    super("各匿名 Sample 没有共同可评分的证据格式；请为每个产品补充同一种截图、文档、视频或文本后重试。");
    this.name = "JudgeEvidenceSelectionError";
  }
}

export function selectJudgeEvidenceInputs<Input extends JudgeEvidenceInput>(
  inputs: Input[],
  expectedOutputTypes: ExpectedOutputType[],
) {
  const sampleIds = [...new Set(inputs.map(input => input.blind_sample_id))];
  const expectedFamilies = expectedOutputTypes
    .map(expectedOutputFamily)
    .filter((family): family is EvidenceFamily => family !== null);
  const protocolPreference = expectedFamilies.length > 0
    ? [...expectedFamilies.filter(family => family !== "text"), ...expectedFamilies.filter(family => family === "text")]
    : [];
  const preferredFamilies = [...new Set([
    ...protocolPreference,
    "video" as const,
    "document" as const,
    "image" as const,
    "text" as const,
  ])];
  const selectedFamily = preferredFamilies.find(family => sampleIds.every(sampleId =>
    inputs.some(input => input.blind_sample_id === sampleId && evidenceFamily(input.mime_type) === family),
  ));
  if (!selectedFamily) throw new JudgeEvidenceSelectionError();

  const selected = inputs.filter(input => {
    const family = evidenceFamily(input.mime_type);
    return family === selectedFamily || (selectedFamily !== "text" && family === "text");
  });
  const selectedIds = new Set(selected.map(input => input.artifact_id));
  return {
    selected,
    selectedFamily,
    omittedArtifactIds: inputs.filter(input => !selectedIds.has(input.artifact_id)).map(input => input.artifact_id),
    policyVersion: "single-media-family.v1",
  };
}

function evidenceFamily(mimeType: string): EvidenceFamily {
  const normalized = mimeType.toLowerCase();
  if (["text/plain", "text/markdown", "application/json", "text/csv"].includes(normalized)) return "text";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  return "document";
}

function expectedOutputFamily(type: ExpectedOutputType): EvidenceFamily | null {
  if (type === "video") return "video";
  if (type === "document") return "document";
  if (type === "image") return "image";
  if (type === "text" || type === "code") return "text";
  return null;
}
