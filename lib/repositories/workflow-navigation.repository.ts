import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export type WorkflowNavigationSnapshot = {
  projectId: string;
  evaluationMode: "quick" | "professional";
  productCount: number;
  researchRuns: Array<{ id: string; version: number; status: string; comparability: Json | null }>;
  protocols: Array<{ id: string; researchRunId: string; version: number; status: string }>;
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

export const workflowNavigationRepository = {
  async load(projectId: string): Promise<WorkflowNavigationSnapshot | null> {
    const client = getSupabaseServerClient();
    const [projectResult, productsResult, researchResult, protocolsResult, testRunsResult, judgeRunsResult, reviewsResult, findingsResult, analysesResult, reportsResult, packsResult] = await Promise.all([
      client.from("projects").select("id, evaluation_mode").eq("id", projectId).is("deleted_at", null).maybeSingle(),
      client.from("project_products").select("product_id").eq("project_id", projectId),
      client.from("research_runs").select("id, version, status, comparability").eq("project_id", projectId).order("version", { ascending: false }),
      client.from("protocols").select("id, research_run_id, version, status").eq("project_id", projectId).order("version", { ascending: false }),
      client.from("test_runs").select("id, protocol_id, status").eq("project_id", projectId),
      client.from("judge_runs").select("id, protocol_id, status").eq("project_id", projectId),
      client.from("review_sessions").select("id, protocol_id, judge_run_id, status").eq("project_id", projectId),
      client.from("experience_findings").select("id, protocol_id, status, human_confirmed_at").eq("project_id", projectId),
      client.from("result_analyses").select("id, review_session_id, status").eq("project_id", projectId),
      client.from("reports").select("id, result_analysis_id, status").eq("project_id", projectId),
      client.from("publish_packs").select("id, report_id, findings_id, status").eq("project_id", projectId),
    ]);

    for (const [operation, result] of [
      ["project", projectResult], ["products", productsResult], ["research", researchResult],
      ["protocols", protocolsResult], ["testRuns", testRunsResult], ["judgeRuns", judgeRunsResult],
      ["reviews", reviewsResult], ["findings", findingsResult], ["analyses", analysesResult], ["reports", reportsResult], ["publishPacks", packsResult],
    ] as const) {
      if (result.error) throwRepositoryError(`workflowNavigation.${operation}`, result.error);
    }
    if (!projectResult.data) return null;

    const products = productsResult.data ?? [];
    const researchRuns = researchResult.data ?? [];
    const protocols = protocolsResult.data ?? [];
    const testRuns = testRunsResult.data ?? [];
    const judgeRuns = judgeRunsResult.data ?? [];
    const reviewSessions = reviewsResult.data ?? [];
    const experienceFindings = findingsResult.data ?? [];
    const resultAnalyses = analysesResult.data ?? [];
    const reports = reportsResult.data ?? [];
    const publishPacks = packsResult.data ?? [];

    const protocolIds = protocols.map((protocol) => protocol.id);
    const testRunIds = testRuns.map((run) => run.id);
    const [testCasesResult, artifactsResult] = await Promise.all([
      protocolIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : client.from("test_cases").select("id, protocol_id").in("protocol_id", protocolIds),
      testRunIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : client.from("test_artifacts").select("test_run_id").in("test_run_id", testRunIds),
    ]);
    if (testCasesResult.error) throwRepositoryError("workflowNavigation.testCases", testCasesResult.error);
    if (artifactsResult.error) throwRepositoryError("workflowNavigation.artifacts", artifactsResult.error);

    return {
      projectId,
      evaluationMode: projectResult.data.evaluation_mode,
      productCount: products.length,
      researchRuns: researchRuns.map((run) => ({ id: run.id, version: run.version, status: run.status, comparability: run.comparability })),
      protocols: protocols.map((protocol) => ({ id: protocol.id, researchRunId: protocol.research_run_id, version: protocol.version, status: protocol.status })),
      testCases: (testCasesResult.data ?? []).map((testCase) => ({ id: testCase.id, protocolId: testCase.protocol_id })),
      testRuns: testRuns.map((run) => ({ id: run.id, protocolId: run.protocol_id, status: run.status })),
      artifactRunIds: (artifactsResult.data ?? []).map((artifact) => artifact.test_run_id),
      judgeRuns: judgeRuns.map((run) => ({ id: run.id, protocolId: run.protocol_id, status: run.status })),
      reviewSessions: reviewSessions.map((review) => ({ id: review.id, protocolId: review.protocol_id, judgeRunId: review.judge_run_id, status: review.status })),
      experienceFindings: experienceFindings.map((finding) => ({ id: finding.id, protocolId: finding.protocol_id, status: finding.status, humanConfirmedAt: finding.human_confirmed_at })),
      resultAnalyses: resultAnalyses.map((analysis) => ({ id: analysis.id, reviewSessionId: analysis.review_session_id, status: analysis.status })),
      reports: reports.map((report) => ({ id: report.id, resultAnalysisId: report.result_analysis_id, status: report.status })),
      publishPacks: publishPacks.map((pack) => ({ id: pack.id, reportId: pack.report_id, findingsId: pack.findings_id, status: pack.status })),
    };
  },
};
