import { z } from "zod";
import { renderProtocolInputArtifact, safeArtifactFileName } from "@/lib/protocol-input-artifacts";
import { protocolsRepository } from "@/lib/repositories/protocols.repository";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";

export const runtime = "nodejs";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  artifactNumber: z.coerce.number().int().positive().max(12),
});

const storedArtifactSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["application/pdf", "text/plain", "text/csv"]),
  description: z.string().trim().min(1),
  content: z.string().min(1),
});

type RouteProps = { params: Promise<{ projectId: string; testCaseId: string; artifactNumber: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response("Invalid input artifact", { status: 400 });

  const workspace = await getProtocolWorkspace(parsed.data.projectId);
  const protocol = workspace?.protocol;
  if (!protocol || !protocol.testCases.some((testCase) => testCase.id === parsed.data.testCaseId)) {
    return new Response("Input artifact not found", { status: 404 });
  }

  const rows = await protocolsRepository.listTestCases(protocol.id);
  const row = rows.find((testCase) => testCase.id === parsed.data.testCaseId);
  const artifacts = z.array(storedArtifactSchema).safeParse(row?.input_artifacts);
  const artifact = artifacts.success ? artifacts.data[parsed.data.artifactNumber - 1] : undefined;
  if (!artifact) return new Response("Input artifact not found", { status: 404 });

  const body = await renderProtocolInputArtifact(artifact);
  const fileName = safeArtifactFileName(artifact.name, artifact.type);
  return new Response(new Uint8Array(body), {
    headers: {
      "Cache-Control": protocol.status === "locked" ? "private, max-age=3600" : "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(body.byteLength),
      "Content-Type": artifact.type === "text/plain" ? "text/plain; charset=utf-8" : artifact.type === "text/csv" ? "text/csv; charset=utf-8" : artifact.type,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
