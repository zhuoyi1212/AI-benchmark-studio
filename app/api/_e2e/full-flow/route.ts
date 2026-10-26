import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from 'node:util';
import { getBlindReviewWorkspace, startProfessionalReview } from "@/lib/services/blind-review.service";
import { getHumanReviewWorkspace, lockHumanReview, revealHumanReview } from "@/lib/services/human-review.service";
import { runBlindJudge } from "@/lib/services/judge.service";
import { confirmExperienceFindings, generateExperienceFindings, getExperienceFindingsWorkspace } from "@/lib/services/findings.service";
import { generateProtocol, getProtocolWorkspace, lockProtocol, ProtocolExecutionError } from "@/lib/services/protocols.service";
import { createProject, softDeleteProject } from "@/lib/services/projects.service";
import { discoverContentIdeas, generateCommunityPost, getPublishWorkspace, saveCommunityPostEdit, enqueueCommunityPostRegeneration, refreshCommunityPostTitle } from "@/lib/services/publish.service";
import { runQuickWorker } from '@/lib/quick/worker';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { generateReport, getReportWorkspace } from "@/lib/services/report.service";
import { executeProductResearch, getResearchWorkspace } from "@/lib/services/research.service";
import { generateFinalResultAnalysis, getResultsWorkspace } from "@/lib/services/result-analysis.service";
import { finalizeTestExecution, getTestExecutionWorkspace, uploadTestArtifact, restartTestExecution, removeTestArtifact, prepareTestArtifactUpload, completeTestArtifactUpload } from "@/lib/services/test-execution.service";
import { analysisImageSchema, maxAnalysisImageBytes } from "@/lib/media/analysis-image";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const runtime = "nodejs";
export const maxDuration = 300;

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new Response(null, { status: 404 });

  const body = await request.json().catch(() => null) as { runId?: unknown; protocolOnly?: unknown; textOnlyEvidence?: unknown } | null;
  const runId = typeof body?.runId === "string" ? body.runId : "";
  const protocolOnly = body?.protocolOnly === true;
  const textOnlyEvidence = body?.textOnlyEvidence === true;
  if (!/^[a-z0-9-]{8,80}$/.test(runId)) {
    return Response.json({ ok: false, error: "Invalid E2E run ID" }, { status: 400 });
  }

  const projectIds: string[] = [];
  let result: Record<string, unknown>;
  let status = 200;
  let stage = "setup";

  try {
    stage = "single-product-flow";
    const single = await runSingleProductFlow(request, runId, projectIds, protocolOnly, textOnlyEvidence);
    stage = "comparison-regression";
    const comparison = await runComparisonRegression(runId, projectIds);
    stage = "not-comparable-gate";
    const notComparable = await runNotComparableRegression(runId, projectIds);
    result = { ok: true, runId, single, comparison, notComparable };
  } catch (error) {
    status = 500;
    result = {
      ok: false,
      runId,
      stage,
      error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown E2E failure",
      databaseCode: error instanceof Error && 'code' in error ? error.code : undefined,
      databaseDetail: error instanceof Error && error.cause && typeof error.cause === 'object' && 'message' in error.cause
        ? String(error.cause.message).replace(/https?:\/\/[^\s]+/g, '[URL redacted]').slice(0, 500) : undefined,
    };
  }

  const cleanup = await Promise.all(projectIds.map(async (projectId) => {
    try {
      return { projectId, archived: await softDeleteProject(projectId) };
    } catch (error) {
      return { projectId, archived: false, error: error instanceof Error ? error.message : "Unknown cleanup failure" };
    }
  }));
  const cleanupComplete = cleanup.length === projectIds.length && cleanup.every((item) => item.archived);
  if (!cleanupComplete && status === 200) status = 500;

  return Response.json({ ...result, cleanup: { complete: cleanupComplete, projects: cleanup } }, { status });
}

async function runSingleProductFlow(request: Request, runId: string, projectIds: string[], protocolOnly: boolean, textOnlyEvidence: boolean) {
  const projectId = await createProject({
    name: `[E2E] Single Product Flow ${runId}`,
    intent: "验证单产品体验从真实研究、证据评分到社区内容的完整数据链。",
    products: [{ name: `验证工具${runId.slice(-8)}`, officialUrl: `https://${runId}.single-e2e.example.com` }],
  });
  projectIds.push(projectId);

  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Single Research workspace missing");
  assert(research.completedResult?.comparability.status === "not_comparable", "Single Research must prove comparability does not gate the flow");
  assert(research.project.products.length === 1, "Single Project must contain exactly one Product");

  const protocolId = await generateProtocol(projectId);
  let protocolWorkspace = requireValue(await getProtocolWorkspace(projectId), "Single Protocol workspace missing");
  assert(protocolWorkspace.protocol?.id === protocolId, "Generated Protocol was not persisted");
  assert(protocolWorkspace.protocol.status === "draft", "Generated Protocol must begin as draft");
  assert(protocolWorkspace.protocol.testCases.length === 1, "Quick single-product Protocol must contain exactly one TestCase");
  assert(protocolWorkspace.protocol.testCases.every((item) => item.expectedOutputTypes.includes(textOnlyEvidence ? "text" : "image")), "Expected output types were not persisted");
  assert(protocolWorkspace.protocol.testCases.every((item) => item.evidenceRequirements.length > 0), "Evidence requirements were not persisted");

  await lockProtocol(projectId, protocolId);
  protocolWorkspace = requireValue(await getProtocolWorkspace(projectId), "Locked Protocol workspace missing");
  assert(protocolWorkspace.protocol?.status === "locked", "Protocol did not enter locked state");

  if (protocolOnly) {
    return {
      projectId,
      comparabilityStatus: research.completedResult.comparability.status,
      protocolId,
      protocolOnly: true,
      testCases: protocolWorkspace.protocol.testCases.map((item) => ({ id: item.id, expectedOutputTypes: item.expectedOutputTypes, evidenceRequirements: item.evidenceRequirements })),
      rubricCount: protocolWorkspace.protocol.rubric.length,
    };
  }

  let testWorkspace = requireValue(await getTestExecutionWorkspace(projectId), "Single Test Execution workspace missing");
  assert(testWorkspace.testRuns.length === protocolWorkspace.protocol.testCases.length, "Single TestRun matrix must be 1 Product x N TestCases");
  const expectedTextByRun = new Map<string, string>();
  for (const [index, run] of testWorkspace.testRuns.entries()) {
    const rawText = `  # Raw Test Result\n\nRun ${run.id} completed the requested task with traceable output.\n  `;
    if (textOnlyEvidence && index === 0) {
      await uploadTestArtifact({
        projectId,
        testRunId: run.id,
        file: new File([rawText], "pasted-raw-output.txt", { type: "text/plain" }),
        metadata: { generationTimeSeconds: 7, retryCount: 0, manuallyEdited: false, notes: `Self-contained E2E pasted raw Artifact ${runId}` },
      });
      expectedTextByRun.set(run.id, rawText);
      continue;
    }
    const imageBytes = index === 0 ? Buffer.concat([onePixelPng, Buffer.alloc(5 * 1024 * 1024)]) : onePixelPng;
    const artifact = textOnlyEvidence
      ? new File([rawText], `e2e-${run.id}.md`, { type: "application/octet-stream" })
      : new File([imageBytes], `e2e-${run.id}.png`, { type: "image/png" });
    const metadata = { generationTimeSeconds: 7, retryCount: 0, manuallyEdited: false, notes: `Self-contained E2E raw Artifact ${runId}` };
    if (!textOnlyEvidence && index === 0) {
      const file = { name: artifact.name, size: artifact.size, type: artifact.type, lastModified: null };
      const prepared = await prepareTestArtifactUpload({ projectId, testRunId: run.id, file });
      const form = new FormData(); form.append('cacheControl', '3600'); form.append('', artifact);
      const response = await fetch(prepared.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
      assert(response.ok, 'Direct Storage image upload failed');
      await completeTestArtifactUpload({ projectId, testRunId: run.id, ...prepared, file, sha256: createHash('sha256').update(imageBytes).digest('hex'), metadata });
      const { data: stored } = await getSupabaseServerClient().from('test_artifacts').select('metadata,sha256,size_bytes').eq('id', prepared.artifactId).single();
      const data = stored?.metadata;
      assert(data && typeof data === 'object' && !Array.isArray(data), 'Image provenance missing');
      const manifest = analysisImageSchema.parse(data.analysisImage);
      assert(stored.size_bytes === imageBytes.length && stored.sha256 === manifest.sourceSha256, 'Raw image identity changed');
      assert(manifest.sizeBytes <= maxAnalysisImageBytes && manifest.encoding === 'lossless', 'Automatic lossless compression did not run');
      const compressed = await getSupabaseServerClient().storage.from('benchmark-artifacts').download(manifest.storagePath);
      assert(compressed.data && createHash('sha256').update(Buffer.from(await compressed.data.arrayBuffer())).digest('hex') === manifest.sha256, 'Stored compressed image integrity failed');
    } else await uploadTestArtifact({
      projectId,
      testRunId: run.id,
      file: artifact,
      metadata,
    });
    if (textOnlyEvidence) expectedTextByRun.set(run.id, rawText);
  }
  testWorkspace = requireValue(await getTestExecutionWorkspace(projectId), "Uploaded Test Execution workspace missing");
  if (textOnlyEvidence) {
    for (const run of testWorkspace.testRuns) {
      assert(run.artifacts[0]?.fileType === "text/plain" || run.artifacts[0]?.fileType === "text/markdown", "Text MIME normalization failed");
      const response = await fetch(requireValue(run.artifacts[0]?.fileUrl, "Text Artifact URL missing"));
      assert(response.ok, "Stored text Artifact could not be read");
      assert(await response.text() === expectedTextByRun.get(run.id), "Raw pasted/uploaded text must be preserved byte-for-byte");
    }
  }
  const artifactIds = testWorkspace.testRuns.flatMap((run) => run.artifacts.map((artifact) => artifact.id));
  assert(artifactIds.length === testWorkspace.testRuns.length, "Every TestRun must retain one raw Artifact");
  assert(testWorkspace.testRuns.every((run) => run.projectId === projectId && run.protocolId === protocolId), "Artifact lineage left the current Project or Protocol");
  await finalizeTestExecution(projectId, protocolId);

  await startProfessionalReview(projectId, protocolId);
  const blind = requireValue(await getBlindReviewWorkspace(projectId), "Single Blind workspace missing");
  assert(blind.samples.length === 1, "Single Project must retain one anonymous Sample");
  await runBlindJudge(projectId);
  let review = requireValue(await getHumanReviewWorkspace(projectId), "Single Human Review workspace missing");
  assert(review.scores.length > 0, "Judge score matrix is empty");
  assert(review.scores.every((score) => score.evidence.some((entry) => artifactIds.some((id) => entry.includes(id)))), "Judge Evidence must reference current Artifact IDs");
  await lockHumanReview(projectId, review.reviewSessionId);
  review = requireValue(await getHumanReviewWorkspace(projectId), "Locked Human Review workspace missing");
  assert(review.status === "locked", "Human Review did not lock Final Scores");
  await revealHumanReview(projectId, review.reviewSessionId);
  review = requireValue(await getHumanReviewWorkspace(projectId), "Revealed Human Review workspace missing");
  assert(review.status === "revealed" && review.revealedMappings?.length === 1, "Single identity reveal failed");

  const findingsId = await generateExperienceFindings(projectId);
  let findings = requireValue(await getExperienceFindingsWorkspace(projectId), "Quick Findings workspace missing");
  assert(findings.latest?.id === findingsId && findings.latest.status === "completed", "Quick Findings did not complete");
  assert(!findings.latest?.humanConfirmedAt, "Quick Findings must remain unconfirmed before the human confirmation step");

  const workflowBeforeConfirmation = requireValue(await getProjectWorkflowState(projectId), "Workflow state missing before Findings confirmation");
  assert(workflowBeforeConfirmation.stages.review.completed, "Quick Findings requires completed Blind Review");
  assert(workflowBeforeConfirmation.stages.results.accessible, "Quick Findings must be accessible after Blind Review");

  const generatedFindings = requireValue(findings.latest?.effectiveOutput, "Generated Findings output missing");
  const authorPerspective = { goal: '整理这次测试里可以复用的建议', focus: '建议有没有给到具体步骤', tradeoff: '可以接受表达普通，不能接受没有依据的承诺', verdict: '把回答当准备清单，实际效果还要自己验证' };
  await confirmExperienceFindings(projectId, findingsId, { ...generatedFindings, authorPerspective });
  findings = requireValue(await getExperienceFindingsWorkspace(projectId), "Confirmed Quick Findings workspace missing");
  assert(findings.latest?.id === findingsId && findings.latest.humanConfirmedAt, "Quick Findings confirmation was not persisted");
  assert(findings.latest.effectiveOutput?.authorPerspective?.focus === authorPerspective.focus && !('authorPerspective' in (findings.latest.aiOutput ?? {})), 'Author perspective must persist only as human input');
  const workflowAfterConfirmation = requireValue(await getProjectWorkflowState(projectId), "Workflow state missing after Findings confirmation");
  assert(workflowAfterConfirmation.stages.results.completed, "Confirmed Findings did not complete the Results stage");
  assert(workflowAfterConfirmation.stages.publish.accessible, "Confirmed Findings did not unlock Publish");

  await discoverContentIdeas(projectId);
  let quickPublish = requireValue(await getPublishWorkspace(projectId), "Quick Publish workspace missing");
  assert(quickPublish.sourceType === "findings" && quickPublish.findingsId === findingsId && quickPublish.reportId === null, "Quick Publish did not bind confirmed Findings");
  const quickSelectedIdea = quickPublish.pack?.ideas.find((idea) => idea.recommended) ?? quickPublish.pack?.ideas[0];
  assert(Boolean(quickSelectedIdea), "Quick Content Discovery did not return an idea");
  await generateCommunityPost(projectId, {
    ideaId: quickSelectedIdea!.id,
    config: {
      channel: "通用社区",
      goal: "分享真实体验",
      tone: "真实、克制、有观点，严格基于测试证据。",
      length: "600 字左右",
      imageCount: 1,
      interactionGoal: "邀请读者分享最看重的真实使用体验。",
    },
  });
  quickPublish = requireValue(await getPublishWorkspace(projectId), "Completed Quick Publish workspace missing");
  const quickPublishPack = requireValue(quickPublish.pack, "Completed Quick Publish pack missing");
  assert(quickPublish.sourceType === "findings" && quickPublishPack.status === "ready", "Quick Findings Publish did not complete");
  assert(quickPublishPack.config.authorPerspective?.tradeoff === authorPerspective.tradeoff, 'Writing did not inherit confirmed author perspective');
  const quickPublishPost = requireValue(quickPublishPack.post, "Completed Quick Publish post missing");
  assert(quickPublishPost.storyBrief?.supportingPoints.some(point => point.role === "main"), "Quick Publish must persist the evidence-bound Story Brief");
  assert(quickPublishPost.draftReview?.issues.length === 1, "Quick Publish must persist the actionable read-only review");
  assert(quickPublishPost.body === quickPublishPost.styleEdit?.edited.body && quickPublishPost.styleEdit.changed, "Quick Publish must persist the revised copy that was audited");
  assert(quickPublishPost.generationTrace?.length === 5, "Quick Publish must record all five stages when revision was needed");
  assert(quickPublishPost.storyBrief?.supportingPoints.every(point => point.findingIds.every(id => generatedFindings.findings.some(finding => finding.id === id))), "Story Brief must only reference confirmed findings");
  assert(quickPublishPost.screenshotRecommendations.every((item) => artifactIds.includes(item.artifactId)), "Quick Publish must only reference current Artifacts");
  assert(!textOnlyEvidence || quickPublishPost.screenshotRecommendations.length === 0, "Text-only Quick Publish must not fabricate screenshot recommendations");

  await generateFinalResultAnalysis(projectId);
  const results = requireValue(await getResultsWorkspace(projectId), "Single Results workspace missing");
  assert(results.projectMode === "single" && results.productScores.length === 1, "Results did not retain single-product mode");
  assert(results.latestAnalysis?.status === "completed" && Boolean(results.latestAnalysis.output), "Final Result Analysis did not complete");

  await generateReport(projectId);
  const report = requireValue(await getReportWorkspace(projectId), "Single Report workspace missing");
  assert(report.projectMode === "single" && report.report?.status === "completed", "Single experience Report did not complete");
  assert(report.report.content?.title.includes("体验"), "Single Report title must use experience semantics");
  assert(new Set(report.evidence.map((item) => item.artifactId)).size === artifactIds.length, "Report evidence must retain the current Artifact lineage");

  const publish = { ...quickPublish, pack: quickPublishPack };

  const routeChecks = await verifySingleRoutes(new URL(request.url).origin, projectId, report.report.content!.title, quickPublishPost.title);
  // Exercise actual persistence and durable worker checkpoints using only this
  // isolated fixture. No real project or live provider is involved.
  const editedBody = quickPublishPost.body + '\n\n这段内容由测试者保存，用于验证重新打开后仍能读到修改。';
  const editedId = await saveCommunityPostEdit(projectId, quickPublishPack.id, {
    title: quickPublishPost.title, body: editedBody, tags: quickPublishPost.tags,
    interactionQuestion: quickPublishPost.interactionQuestion,
    imageIds: quickPublishPost.screenshotRecommendations.map(s => s.artifactId),
  });
  const reopened = requireValue(await getPublishWorkspace(projectId), 'Edited article disappeared');
  assert(reopened.pack?.id === editedId && reopened.pack.post?.body === editedBody && reopened.pack.post.manualEdit?.aiReviewed === false, 'Manual edit did not persist as an explicitly human-authored version');
  const { data: originalPack } = await getSupabaseServerClient().from('publish_packs').select('community_post').eq('id', quickPublishPack.id).single();
  assert(originalPack?.community_post && typeof originalPack.community_post === 'object' && !Array.isArray(originalPack.community_post) && originalPack.community_post.body === quickPublishPost.body, 'Source version overwritten');
  const reloadedPage = await fetch(`${new URL(request.url).origin}/projects/${projectId}/publish`);
  assert(reloadedPage.ok && (await reloadedPage.text()).includes('这段内容由测试者保存'), 'Saved copy missing on a new page request');
  for (const invalid of [{ authorPerspective: { focus: 12 } }, { authorPerspective: { verdict: '长'.repeat(601) } }, { authorPerspective: { model: 'override' } }, { body: '不能借作者判断重写正文' }]) {
    const { error } = await getSupabaseServerClient().rpc('create_publish_revision', { p_project_id: projectId, p_source_pack_id: editedId, p_mode: 'regenerate', p_copy: invalid });
    assert(error, 'Database accepted invalid author input');
    const unchanged = requireValue(await getPublishWorkspace(projectId), 'Invalid regeneration damaged source');
    assert(unchanged.pack?.id === editedId && unchanged.pack.status === 'ready', 'Invalid author input created a partial revision');
  }
  const revisedPerspective = { ...authorPerspective, verdict: '我更愿意先把具体步骤整理好，再决定是否复用这份建议' };
  const regeneratedId = await enqueueCommunityPostRegeneration(projectId, editedId, revisedPerspective);
  for (let turn = 0; turn < 7; turn++) {
    await runQuickWorker(projectId, 1);
    const current = requireValue(await getPublishWorkspace(projectId), 'Regeneration workspace missing');
    if (current.pack?.id === regeneratedId && current.pack.status === 'ready') break;
  }
  const regenerated = requireValue(await getPublishWorkspace(projectId), 'Regenerated article missing');
  assert(regenerated.pack?.id === regeneratedId && regenerated.pack.status === 'ready' && !regenerated.pack.post?.manualEdit, 'Background regeneration did not finish or inherited stale human-edit audit');
  assert(regenerated.pack.post?.generationTrace?.length === 5, 'Regeneration bypassed independent checks');
  assert(regenerated.pack.config.authorPerspective?.verdict === revisedPerspective.verdict, 'Regeneration lost the new author perspective');
  const { data: priorCopy } = await getSupabaseServerClient().from('publish_packs').select('config,community_post').eq('id', editedId).single();
  assert(priorCopy?.config && typeof priorCopy.config === 'object' && !Array.isArray(priorCopy.config) && isDeepStrictEqual(priorCopy.config.authorPerspective, reopened.pack?.config.authorPerspective), 'Regeneration rewrote previous author perspective');
  const refreshed = await refreshCommunityPostTitle(projectId, regeneratedId);
  const titled = requireValue(await getPublishWorkspace(projectId), 'Refreshed Kimi title disappeared');
  assert(titled.pack?.id === refreshed.packId && titled.pack.status === 'ready' && titled.pack.post?.title === refreshed.title, 'Kimi title refresh did not persist');
  assert(titled.pack.post.body === regenerated.pack.post?.body, 'Title refresh rewrote the body');
  const { data: kimiPack, error: kimiError } = await getSupabaseServerClient().from('publish_packs').select('provider,model').eq('id', refreshed.packId).single();
  assert(!kimiError && kimiPack?.provider === 'moonshot' && kimiPack.model === 'kimi-k3', 'Kimi provider metadata was not retained');
  const db = getSupabaseServerClient();
  const { data: historyBefore, error: historyError } = await db.from('test_artifacts').select('*').in('id', artifactIds);
  assert(!historyError && historyBefore?.length === artifactIds.length, 'Original artifact snapshot missing');
  const newProtocolId = await restartTestExecution(projectId, protocolId);
  assert(await restartTestExecution(projectId, protocolId) === newProtocolId, 'Retry created an extra upload round');
  const freshTest = requireValue(await getTestExecutionWorkspace(projectId), 'Replacement upload page missing');
  assert(freshTest.protocol.id === newProtocolId && freshTest.protocol.retestOfProtocolId === protocolId, 'Missing replacement lineage');
  assert(freshTest.testRuns.every(run => run.status === 'pending' && run.artifacts.length === 0), 'Old files reused in new round');
  const taskContent = (item: typeof freshTest.protocol.testCases[number]) => ({ ...item, id: undefined, inputArtifacts: item.inputArtifacts?.map(artifact => ({ ...artifact, id: undefined, downloadUrl: undefined })) });
  assert(isDeepStrictEqual(freshTest.protocol.testCases.map(taskContent), protocolWorkspace.protocol.testCases.map(taskContent)), 'Replacement changed the test tasks');
  const freshState = requireValue(await getProjectWorkflowState(projectId), 'Replacement navigation missing');
  assert(!freshState.stages.test.completed && !freshState.stages.results.completed && !freshState.stages.publish.completed, 'Historical analysis leaked into replacement workflow');
  const freshPage = await fetch(`${new URL(request.url).origin}/projects/${projectId}/test`);
  const freshHtml = await freshPage.text();
  assert(freshPage.ok && freshHtml.includes('测试执行') && !freshHtml.includes('poster-output-'), 'Replacement HTTP page did not load');
  for (const run of freshTest.testRuns) {
    await uploadTestArtifact({ projectId, testRunId: run.id, file: new File(['Replacement raw evidence for the same locked task.'], 'replacement-output.txt', { type: 'text/plain' }), metadata: { generationTimeSeconds: null, retryCount: 0, manuallyEdited: false, notes: null } });
    await uploadTestArtifact({ projectId, testRunId: run.id, file: new File(['Surviving original evidence.'], 'survivor.txt', { type: 'text/plain' }), metadata: { generationTimeSeconds: 7, retryCount: 1, manuallyEdited: false, notes: 'Surviving execution metadata' } });
  }
  const reuploaded = requireValue(await getTestExecutionWorkspace(projectId), 'Replacement upload not persisted');
  assert(reuploaded.testRuns.every(run => run.artifacts.length === 2 && run.artifacts.some(a => a.fileName === 'replacement-output.txt')), 'Replacement evidence was not saved');
  await finalizeTestExecution(projectId, newProtocolId);
  await startProfessionalReview(projectId, newProtocolId);
  await runBlindJudge(projectId);
  const newReview = requireValue(await getHumanReviewWorkspace(projectId), 'New round has no review');
  assert(newReview.protocolId === newProtocolId && newReview.scores.length > 0, 'Old Judge reused instead of reanalysis');
  const selected = requireValue(reuploaded.testRuns[0]?.artifacts.find(a => a.fileName === 'replacement-output.txt'), 'Delete source missing');
  const { data: selectedRow } = await db.from('test_artifacts').select('storage_path').eq('id', selected.id).single();
  assert(selectedRow, 'Delete object path missing');
  await removeTestArtifact(projectId, newProtocolId, selected.id);
  let afterDelete = requireValue(await getTestExecutionWorkspace(projectId), 'Post-delete workspace missing');
  assert(afterDelete.protocol.id !== newProtocolId && afterDelete.testRuns.every(run => run.status !== 'ready_for_review'), 'Deletion reused analyzed evidence state');
  assert(afterDelete.testRuns[0]?.artifacts.length === 1 && afterDelete.testRuns[0].artifacts[0]?.fileName === 'survivor.txt', 'Per-file delete removed surviving files');
  assert(afterDelete.testRuns[0]?.generationTimeSeconds === 7 && afterDelete.testRuns[0]?.retryCount === 1, 'Surviving execution metadata lost');
  const survivor = requireValue(afterDelete.testRuns[0]?.artifacts[0], 'Survivor missing');
  const response = await fetch(requireValue(survivor.fileUrl, 'Survivor URL missing'));
  assert(response.ok && await response.text() === 'Surviving original evidence.', 'Surviving Storage object changed');
  const removed = await db.storage.from('benchmark-artifacts').info(selectedRow.storage_path);
  assert(removed.error, 'Deleted binary is still stored');
  await removeTestArtifact(projectId, newProtocolId, selected.id);
  assert((await getTestExecutionWorkspace(projectId))?.protocol.id === afterDelete.protocol.id, 'Delete retry created another round');
  const deletedState = requireValue(await getProjectWorkflowState(projectId), 'Post-delete navigation missing');
  assert(!deletedState.stages.test.completed && !deletedState.stages.publish.completed, 'Old analysis still marked current');
  await removeTestArtifact(projectId, afterDelete.protocol.id, survivor.id);
  afterDelete = requireValue(await getTestExecutionWorkspace(projectId), 'Empty upload workspace missing');
  assert(afterDelete.testRuns[0]?.status === 'pending' && afterDelete.testRuns[0].artifacts.length === 0, 'Last-file deletion did not reopen upload');
  assert(afterDelete.pendingDeletions?.length === 0, 'Storage cleanup left pending receipts');
  await uploadTestArtifact({ projectId, testRunId: requireValue(afterDelete.testRuns[0], 'Run missing').id, file: new File(['New evidence after individual file removal.'], 'new-upload.txt', { type: 'text/plain' }), metadata: { generationTimeSeconds: null, retryCount: 0, manuallyEdited: false, notes: null } });
  await finalizeTestExecution(projectId, afterDelete.protocol.id);
  await startProfessionalReview(projectId, afterDelete.protocol.id);
  await runBlindJudge(projectId);
  const deletedReview = requireValue(await getHumanReviewWorkspace(projectId), 'Reanalysis missing');
  assert(deletedReview.protocolId === afterDelete.protocol.id && deletedReview.scores.length > 0, 'New upload did not get fresh analysis');
  const { data: historyAfter, error: afterError } = await db.from('test_artifacts').select('*').in('id', artifactIds);
  assert(!afterError && isDeepStrictEqual(historyAfter, historyBefore), 'Reupload mutated historical artifacts');
  const { data: oldArticle } = await db.from('publish_packs').select('community_post').eq('id', refreshed.packId).single();
  assert(oldArticle?.community_post && typeof oldArticle.community_post === 'object' && !Array.isArray(oldArticle.community_post) && oldArticle.community_post.body === titled.pack.post.body, 'Reupload rewrote the previous article');
  return {
    projectId,
    comparabilityStatus: research.completedResult.comparability.status,
    protocolId,
    testCases: protocolWorkspace.protocol.testCases.map((item) => ({ id: item.id, expectedOutputTypes: item.expectedOutputTypes, evidenceRequirements: item.evidenceRequirements })),
    testRunCount: testWorkspace.testRuns.length,
    artifactIds,
    findingsId,
    findingsConfirmed: Boolean(findings.latest?.humanConfirmedAt),
    blindSampleCount: blind.samples.length,
    judgeScoreCount: review.scores.length,
    resultMode: results.projectMode,
    reportMode: report.projectMode,
    publishMode: publish.projectMode,
    quickPublishSourceType: publish.sourceType,
    quickPublishReady: publish.pack?.status === "ready",
    publishScreenshotCount: publish.pack.post?.screenshotRecommendations.length ?? 0,
    routeChecks,
    articleRevisionsVerified: true,
    authorPerspectiveVerified: true,
    reuploadVerified: true,
    individualDeletionVerified: true,
  };
}

async function runComparisonRegression(runId: string, projectIds: string[]) {
  const projectId = await createProject({
    name: `[E2E] Comparison Protocol ${runId}`,
    intent: "验证两个同类产品仍可执行标准化横向测评。",
    products: [
      { name: `E2E Compare A ${runId}`, officialUrl: `https://${runId}.compare-a.example.com` },
      { name: `E2E Compare B ${runId}`, officialUrl: `https://${runId}.compare-b.example.com` },
    ],
  });
  projectIds.push(projectId);
  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Comparison Research workspace missing");
  assert(research.completedResult?.comparability.status === "comparable", "Comparable regression did not produce comparable Research");
  const protocolId = await generateProtocol(projectId);
  const workspace = requireValue(await getProtocolWorkspace(projectId), "Comparison Protocol workspace missing");
  assert(workspace.protocol?.id === protocolId && workspace.protocol.testCases.length === 1, "Quick comparison Protocol must contain exactly one TestCase");
  await lockProtocol(projectId, protocolId);
  return { projectId, productCount: research.project.products.length, comparabilityStatus: research.completedResult.comparability.status, protocolId, testCaseCount: workspace.protocol.testCases.length };
}

async function runNotComparableRegression(runId: string, projectIds: string[]) {
  const projectId = await createProject({
    name: `[E2E] Not Comparable Gate ${runId}`,
    intent: "E2E_NOT_COMPARABLE：验证两个不同类别产品不能生成横评 Protocol。",
    products: [
      { name: `E2E Writer ${runId}`, officialUrl: `https://${runId}.writer.example.com` },
      { name: `E2E Video ${runId}`, officialUrl: `https://${runId}.video.example.com` },
    ],
  });
  projectIds.push(projectId);
  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Not-comparable Research workspace missing");
  assert(research.completedResult?.comparability.status === "not_comparable", "Not-comparable regression did not retain its status");
  let blocked = false;
  try {
    await generateProtocol(projectId);
  } catch (error) {
    blocked = error instanceof ProtocolExecutionError && error.message.includes("不能生成 Protocol");
  }
  assert(blocked, "Two-product not_comparable Research must block Protocol generation");
  const workspace = requireValue(await getProtocolWorkspace(projectId), "Not-comparable Protocol workspace missing");
  assert(workspace.protocol === null, "Blocked comparison must not persist a Protocol");
  return { projectId, productCount: research.project.products.length, comparabilityStatus: research.completedResult.comparability.status, protocolBlocked: blocked };
}

async function verifySingleRoutes(origin: string, projectId: string, reportTitle: string, postTitle: string) {
  const checks = [
    ["research", ["体验范围判断", "核心体验能力"], []],
    ["protocol", ["已锁定"], []],
    ["test", ["测试数据已确认"], []],
    ["review", ["产品身份已揭晓"], []],
    ["results", ["测评发现", "专业报告（后台生成）"], ["产品体验结果", "综合体验得分", "证据化 Case 素材"]],
    ["report", ["体验报告已生成", reportTitle], ["综合冠军", "最终排名", "第一名"]],
    ["publish", ["社区文章", postTitle], ["综合冠军", "最终排名", "第一名"]],
  ] as const;
  const verified: string[] = [];
  const authorization = `Basic ${Buffer.from(`${process.env.APP_ACCESS_USERNAME || "studio"}:${process.env.APP_ACCESS_PASSWORD}`).toString("base64")}`;
  for (const [route, required, forbidden] of checks) {
    const response = await fetch(`${origin}/projects/${projectId}/${route}`, { cache: "no-store", headers: { authorization } });
    assert(response.ok, `${route} route returned ${response.status}`);
    const html = await response.text();
    for (const text of required) assert(html.includes(text), `${route} route did not render ${text}`);
    for (const text of forbidden) assert(!html.includes(text), `${route} route exposed comparison-only copy: ${text}`);
    verified.push(route);
  }
  const publicResults = await fetch(`${origin}/projects/${projectId}/results`, { cache: "no-store" });
  const resultsHtml = await publicResults.text();
  assert(publicResults.ok && resultsHtml.includes("测评发现") && !resultsHtml.includes("专业报告（后台生成）"), "Public Findings must use the portfolio view");
  const publicReport = await fetch(`${origin}/projects/${projectId}/report`, { cache: "no-store", redirect: "manual" });
  const redirectHtml = await publicReport.text();
  const redirectsInHeaders = publicReport.status === 307 && publicReport.headers.get("location")?.endsWith(`/projects/${projectId}/results`);
  const redirectsInStream = publicReport.status === 200 && redirectHtml.includes('http-equiv="refresh"') && redirectHtml.includes(`url=/projects/${projectId}/results`);
  assert(redirectsInHeaders || redirectsInStream, "Public report must redirect to Findings");
  const publicPost = await fetch(`${origin}/projects/${projectId}/publish`, { cache: "no-store" });
  const publicHtml = await publicPost.text();
  assert(publicPost.ok && publicHtml.includes(postTitle) && publicHtml.includes("社区文章") && !publicHtml.includes("保存修改") && !publicHtml.includes('"generationTrace"'), "Public article must omit editor/source-audit controls");
  return verified;
}

function isAuthorized(request: Request) {
  const token = process.env.E2E_TEST_TOKEN;
  return process.env.NODE_ENV !== "production"
    && process.env.E2E_TEST_MODE === "1"
    && Boolean(token)
    && request.headers.get("x-e2e-token") === token;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
