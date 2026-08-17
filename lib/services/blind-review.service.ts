import "server-only";

import { RepositoryError } from "@/lib/repositories/repository-error";
import { blindReviewRepository } from "@/lib/repositories/blind-review.repository";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";
import type { BlindSample } from "@/lib/types/review";

export type BlindReviewWorkspace = {
  projectId: string;
  protocolId: string;
  protocolVersion: number;
  samples: BlindSample[];
  testCases: Array<{ id: string; position: number; title: string }>;
};

export class BlindReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlindReviewError";
  }
}

export async function getBlindReviewWorkspace(projectId: string): Promise<BlindReviewWorkspace | null> {
  const protocolWorkspace = await getProtocolWorkspace(projectId);
  const protocol = protocolWorkspace?.protocol;
  if (!protocolWorkspace || !protocol || protocol.status !== "locked") return null;
  try {
    await blindReviewRepository.assertProtocolSafe(projectId, protocol.id);
    await blindReviewRepository.initialize(projectId, protocol.id);
    const samples = await blindReviewRepository.listSamples(protocol.id);
    return {
      projectId,
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      samples: samples.map((sample) => ({ sampleId: sample.id, label: sample.label })),
      testCases: protocol.testCases.map((testCase, index) => ({ id: testCase.id, position: index + 1, title: testCase.title })),
    };
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new BlindReviewError("Blind Review 只能在全部原始测试结果确认后开始。");
    }
    throw error;
  }
}
