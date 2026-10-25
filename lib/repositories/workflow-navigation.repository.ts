import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";
import { z } from "zod";

export type WorkflowNavigationSnapshot = {
  projectId: string;
  evaluationMode: "quick" | "professional";
  productCount: number;
  researchRuns: Array<{ id: string; version: number; status: string; comparability: Json | null }>;
  protocols: Array<{ id: string; researchRunId: string; version: number; status: string; retestOfProtocolId?: string | null }>;
  testCases: Array<{ id: string; protocolId: string }>;
  testRuns: Array<{ id: string; protocolId: string; status: string }>;
  artifactRunIds: string[];
  judgeRuns: Array<{ id: string; protocolId: string; status: string }>;
  reviewSessions: Array<{ id: string; protocolId: string; judgeRunId: string; status: string }>;
  experienceFindings: Array<{ id: string; protocolId: string; status: string; humanConfirmedAt: string | null }>;
  resultAnalyses: Array<{ id: string; reviewSessionId: string; status: string }>;
  reports: Array<{ id: string; resultAnalysisId: string; status: string }>;
  publishPacks: Array<{ id: string; reportId: string | null; findingsId: string | null; status: string }>;
};

const idSchema = z.string().uuid();
const workflowNavigationSnapshotSchema: z.ZodType<WorkflowNavigationSnapshot> = z.object({
  projectId: idSchema,
  evaluationMode: z.enum(["quick", "professional"]),
  productCount: z.number().int().nonnegative(),
  researchRuns: z.array(z.object({ id: idSchema, version: z.number().int(), status: z.string(), comparability: z.custom<Json>().nullable() })),
  protocols: z.array(z.object({ id: idSchema, researchRunId: idSchema, version: z.number().int(), status: z.string(), retestOfProtocolId: idSchema.nullable().optional() })),
  testCases: z.array(z.object({ id: idSchema, protocolId: idSchema })),
  testRuns: z.array(z.object({ id: idSchema, protocolId: idSchema, status: z.string() })),
  artifactRunIds: z.array(idSchema),
  judgeRuns: z.array(z.object({ id: idSchema, protocolId: idSchema, status: z.string() })),
  reviewSessions: z.array(z.object({ id: idSchema, protocolId: idSchema, judgeRunId: idSchema, status: z.string() })),
  experienceFindings: z.array(z.object({ id: idSchema, protocolId: idSchema, status: z.string(), humanConfirmedAt: z.string().nullable() })),
  resultAnalyses: z.array(z.object({ id: idSchema, reviewSessionId: idSchema, status: z.string() })),
  reports: z.array(z.object({ id: idSchema, resultAnalysisId: idSchema, status: z.string() })),
  publishPacks: z.array(z.object({ id: idSchema, reportId: idSchema.nullable(), findingsId: idSchema.nullable(), status: z.string() })),
});

export const workflowNavigationRepository = {
  async load(projectId: string): Promise<WorkflowNavigationSnapshot | null> {
    const { data, error } = await getSupabaseServerClient().rpc("get_workflow_navigation_snapshot", { p_project_id: projectId });
    if (error) throwRepositoryError("workflowNavigation.load", error);
    return data === null ? null : workflowNavigationSnapshotSchema.parse(data);
  },
};
