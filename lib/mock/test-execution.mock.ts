import type { TestRun } from "@/lib/types/test-run";
import { mockProjectRecord } from "@/lib/mock/project.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";

const completedRunIds = new Set(["01-gamma", "01-canva", "02-gamma", "02-canva", "02-beautiful", "03-gamma", "03-canva", "03-beautiful"]);

export const mockTestRuns: TestRun[] = mockProtocol.testCases.flatMap((testCase) =>
  mockProjectRecord.products.map((product) => {
    const id = `${testCase.id}-${product.id}`;
    const uploaded = completedRunIds.has(id);
    return {
      id,
      projectId: mockProjectRecord.id,
      protocolId: mockProtocol.id,
      testCaseId: testCase.id,
      productId: product.id,
      status: uploaded ? "uploaded" : "pending",
      retryCount: 0,
      manuallyEdited: false,
      artifacts: uploaded ? [{ id: `artifact-${id}`, kind: "pdf", fileName: `${product.id}-${testCase.id}-output.pdf`, fileType: "application/pdf", sizeBytes: 120000, fileUrl: `mock://${id}`, createdAt: "2026-08-13T08:00:00.000Z" }] : [],
    } satisfies TestRun;
  }),
);
