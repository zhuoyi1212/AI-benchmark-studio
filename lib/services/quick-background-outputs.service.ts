import "server-only";

import { generateExperienceFindings } from "@/lib/services/findings.service";
import { generateFinalResultAnalysis } from "@/lib/services/result-analysis.service";
import { generateReport } from "@/lib/services/report.service";

export async function generateQuickBackgroundOutputs(projectId: string): Promise<void> {
  const findings = generateExperienceFindings(projectId).catch((error) => {
    console.error("[QuickEvaluation] Findings generation failed", { projectId, error: safeMessage(error) });
  });
  const report = (async () => {
    try {
      await generateFinalResultAnalysis(projectId);
      await generateReport(projectId);
    } catch (error) {
      console.error("[QuickEvaluation] Professional report generation failed", { projectId, error: safeMessage(error) });
    }
  })();
  await Promise.all([findings, report]);
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
