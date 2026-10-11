import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const expectedAuthorization = "Bearer e2e-local-provider-boundary";
const textOnlyEvidence = process.env.E2E_TEXT_ONLY_ARTIFACTS === "1";
const videoEvidence = process.env.E2E_VIDEO_FIXTURE === "1";

export async function startE2EProviderMock({ realAiTasks = [], providerApiKeys = {}, failOnceTask } = {}) {
  const requests = [];
  const realAiTaskSet = new Set(realAiTasks);
  const protocolScenario = process.env.E2E_PROTOCOL_RESPONSE_SCENARIO ?? "normal";
  const supportedProtocolScenarios = new Set(["normal", "empty-then-success", "always-empty", "truncated-then-success", "invalid-json-then-success", "schema-invalid-then-success"]);
  if (!supportedProtocolScenarios.has(protocolScenario)) throw new Error(`Unsupported E2E Protocol response scenario: ${protocolScenario}`);
  let protocolAttempt = 0;
  let injectedFailure = false;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.headers.authorization !== expectedAuthorization) {
        return send(response, 401, { error: "E2E provider boundary rejected the request" });
      }
      const body = JSON.parse(await readBody(request));
      if (request.url === "/zhipu/web_search") {
        requests.push({ task: "research_search", multimodal: false });
        return send(response, 200, createSearchResponse(body));
      }
      if (!["/zhipu/chat/completions", "/deepseek/chat/completions"].includes(request.url)) {
        return send(response, 404, { error: "Unknown E2E provider endpoint" });
      }

      const schemaName = getSchemaName(body.messages);
      const multimodal = schemaName === "JudgeCaseScores"
        && body.messages.some((message) => Array.isArray(message.content)
          && message.content.some((item) => item.type === "image_url"));
      if (schemaName === "TestProtocol" || schemaName === "ProtocolContent") {
        protocolAttempt += 1;
        const planned = createProtocolScenarioResponse(protocolScenario, protocolAttempt, schemaName, body.messages);
        requests.push({
          task: schemaName,
          multimodal,
          attempt: protocolAttempt,
          outcome: planned.outcome,
          finishReason: planned.body.choices[0].finish_reason,
          reasoning: body.thinking?.type === "enabled" ? "high" : "standard",
        });
        return send(response, 200, planned.body);
      }
      const provider = request.url.startsWith("/zhipu/") ? "zhipu" : "deepseek";
      const parts = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
      const nativeVideo = parts.some(p => p.type === "video_url" || p.type === "file_url" && /\.mp4/.test(p.file_url.url));
      if (videoEvidence && nativeVideo) throw new Error("Video fixture reached provider as raw MP4");
      if (videoEvidence && schemaName === "JudgeCaseScores" && (parts.some(p => p.type !== "text") || JSON.stringify(body.messages).includes(process.env.E2E_VIDEO_IDENTITY))) throw new Error("Video evaluator received binary or real identity");
      const trackedRequest = { task: schemaName, provider, multimodal, nativeVideo };
      requests.push(trackedRequest);
      if (videoEvidence && schemaName === "VideoFrameObservations") {
        const timestamps = parts.filter(p => p.type === "text" && p.text.startsWith("timestamp: ")).map(p => Number(p.text.slice(11)));
        if (timestamps.length > 1 || timestamps.includes(0)) return send(response, 400, { error: { message: "Injected optional bad frame" } });
        return send(response, 200, createCompletionResponse({ frames: timestamps.map(timestamp => ({ timestamp, sceneDescription: "E2E blue synthetic fixture", visibleText: [process.env.E2E_VIDEO_IDENTITY], productMention: [process.env.E2E_VIDEO_IDENTITY], uiElement: [], obviousIssue: null, relevanceToInput: "Synthetic video fixture only" })) }));
      }
      if (schemaName === failOnceTask && !injectedFailure) {
        injectedFailure = true;
        return send(response, 400, { error: { message: "Injected isolated E2E failure" } });
      }
      if (realAiTaskSet.has(schemaName)) {
        const apiKey = providerApiKeys[provider];
        if (!apiKey) return send(response, 500, { error: `Missing real AI credential for ${provider}` });
        trackedRequest.realAi = true;
        return await proxyRealProviderRequest(provider, apiKey, body, response);
      }
      return send(response, 200, createCompletionResponse(buildStructuredOutput(schemaName, body.messages)));
    } catch (error) {
      return send(response, 500, { error: error instanceof Error ? error.message : "Unknown provider mock failure" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("E2E provider mock did not bind a TCP port");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stats: () => ({
      total: requests.length,
      nativeVideoRequests: requests.filter(r => r.nativeVideo).length,
      videoEvaluatorProviders: requests.filter(r => r.task === "JudgeCaseScores").map(r => r.provider),
      taskCounts: Object.fromEntries([...Map.groupBy(requests, (item) => item.task)].map(([task, items]) => [task, items.length])),
      realAiTaskCounts: Object.fromEntries([...Map.groupBy(requests.filter((item) => item.realAi), (item) => item.task)].map(([task, items]) => [task, items.length])),
      multimodalJudgeRequests: requests.filter((item) => item.task === "JudgeCaseScores" && item.multimodal).length,
      protocolAttempts: requests.filter((item) => item.task === "TestProtocol" || item.task === "ProtocolContent"),
    }),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function proxyRealProviderRequest(provider, apiKey, body, response) {
  const endpoint = provider === "zhipu"
    ? "https://api.z.ai/api/paas/v4/chat/completions"
    : "https://api.deepseek.com/chat/completions";
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
  response.end(payload);
}

function createSearchResponse(body) {
  const query = typeof body.search_query === "string" ? body.search_query : "official product docs";
  const domain = query.match(/site:([^\s]+)/)?.[1] ?? "e2e-provider.example.com";
  const suffix = createHash("sha256").update(query).digest("hex").slice(0, 12);
  return {
    search_result: [{
      title: "Official E2E product documentation",
      link: `https://${domain}/docs/${suffix}`,
      content: `Official product positioning, core capability, pricing and usage documentation for the isolated E2E run. Search context: ${query}.`,
      media: domain,
      publish_date: "2026-08-20",
    }],
  };
}

function buildStructuredOutput(schemaName, messages) {
  if (schemaName === "ProductResearch") {
    const sources = extractSources(messages);
    return {
      positioning: "面向真实工作场景的 AI 内容生产工具。",
      targetUsers: ["需要快速验证核心能力的专业用户"],
      capabilities: ["结构化内容生成", "视觉结果输出"],
      keyFeatures: ["基于统一输入生成可留证结果"],
      pricing: { summary: "提供基础体验方案。", freePlan: "可用于有限体验", paidFrom: null, currency: null },
      officialBestPractices: ["使用明确输入并保留原始输出"],
      limitations: ["最终表现需要通过真实 Artifact 验证"],
      inputFormats: ["自然语言文本"],
      outputFormats: ["结构化文本", "图片"],
      sourceUrls: sources.map((source) => source.url),
    };
  }
  if (schemaName === "ComparabilityResult") {
    const input = findJsonMessage(messages, (value) => value.projectMode);
    const single = input.projectMode === "single";
    const forcedNotComparable = JSON.stringify(input).includes("E2E_NOT_COMPARABLE");
    return {
      status: single || forcedNotComparable ? "not_comparable" : "comparable",
      score: single ? 0.95 : forcedNotComparable ? 0.12 : 0.92,
      reason: single
        ? "单产品无需建立横向可比性，可直接验证其核心能力与真实体验。"
        : forcedNotComparable
          ? "两个产品的核心任务不同，不适合使用同一标准化 Protocol。"
          : "两个产品具有共同任务和可验证的输出，可进行标准化横向测试。",
      commonCapabilities: single ? ["核心输出质量", "真实场景完成度"] : forcedNotComparable ? ["基于自然语言输入生成内容"] : ["结构化内容生成", "视觉结果输出"],
      warnings: forcedNotComparable ? ["强行比较会引入任务偏差"] : [],
    };
  }
  if (schemaName === "TestProtocol" || schemaName === "ProtocolContent") {
    const input = findJsonMessage(messages, (value) => value.project?.mode);
    const single = input.project.mode === "single";
    const caseCount = input.requirements?.mode === "quick" ? 1 : 2;
    const protocol = {
      title: single ? "单产品核心能力体验方案" : "同类产品标准化横评方案",
      goal: single ? `通过真实任务和原始${textOnlyEvidence ? "文本证据" : "截图"}验证核心能力、使用体验与明显限制。` : "在统一输入、Prompt 与证据要求下比较同类产品表现。",
      testMode: "standardized",
      rules: [
        { id: "same-input", text: "使用相同原始输入" },
        { id: "same-prompt", text: "使用相同 Prompt" },
        { id: "single-generation", text: "每个 Prompt 只生成一次" },
        { id: "no-editing", text: "不进行人工二次编辑" },
        { id: "complete-upload", text: "完整上传原始测试结果" },
      ],
      testCases: Array.from({ length: caseCount }, (_, index) => ({
        position: index + 1,
        title: single ? `核心场景真实体验 ${index + 1}` : `标准化比较场景 ${index + 1}`,
        objective: single ? "验证官方核心卖点在真实任务中的表现。" : "比较同一任务下的完成度和输出质量。",
        prompt: `请根据给定目标完成第 ${index + 1} 个标准化任务，并直接输出最终结果。`,
        inputDescription: null,
        inputArtifacts: [],
        expectedOutputTypes: [videoEvidence ? "video" : textOnlyEvidence ? "text" : "image"],
        evidenceRequirements: [textOnlyEvidence ? "上传未经编辑的完整原始文本结果" : "上传未经裁剪或后期编辑的完整原始截图"],
        observationFocus: ["任务完成度", "信息结构", "视觉可读性"],
        executionRules: ["使用默认设置", "仅生成一次", "不人工美化"],
      })),
      rubric: [
        { position: 1, name: "任务完成度", weight: 30, description: "核心要求是否完整实现。", scoringStandard: standards("核心要求完整实现") },
        { position: 2, name: "原生能力运用", weight: 25, description: "是否有效使用产品的原生能力。", scoringStandard: standards("原生能力运用充分且有效") },
        { position: 3, name: "结果质量", weight: 25, description: "最终结果是否准确、清晰且可用。", scoringStandard: standards("结果准确清晰且可以直接使用") },
        { position: 4, name: "证据可验证性", weight: 20, description: "原始结果是否清晰支持判断。", scoringStandard: standards("证据清晰且可核查") },
      ],
    };
    if (schemaName === "ProtocolContent") {
      return {
        title: protocol.title,
        goal: protocol.goal,
        testCases: protocol.testCases.map(({ position: _position, executionRules: _executionRules, ...testCase }) => testCase),
        rubric: protocol.rubric.map(({ position: _position, ...dimension }) => dimension),
      };
    }
    return protocol;
  }
  if (schemaName === "ExperienceFindings") {
    const input = findJsonMessage(messages, (value) => value.project?.id && value.protocol?.testCases);
    const artifacts = extractFindingsArtifacts(messages);
    if (artifacts.length === 0) throw new Error("Findings mock did not receive real Artifact references");
    return {
      summary: "真实测试显示，产品能够完成主要任务，但结果的可核查性和后续人工确认仍然决定了最终使用体验。",
      findings: artifacts.slice(0, 12).map((artifact, index) => ({
        id: `e2e-finding-${index + 1}`,
        productId: artifact.productId,
        testCaseId: artifact.testCaseId,
        title: index === 0 ? "主要任务可以完成" : "原始结果保留了可核查细节",
        category: index === 0 ? "good" : "neutral",
        observation: index === 0
          ? "这次测试产生了完整的原始输出，主要任务结果可以继续检查。"
          : "原始 Artifact 保留了本次任务的具体结果，便于人工回看和判断。",
        impact: index === 0
          ? "用户可以先拿到结果，再根据实际场景决定是否继续调整。"
          : "后续复核不必依赖模型的概括，能够回到同一次真实测试证据。",
        evidenceArtifactIds: [artifact.artifactId],
        confidence: 0.9,
      })),
      limitations: ["本次 Findings 只覆盖当前锁定 Protocol、真实 TestRun 和已上传 Artifact。"],
    };
  }
  if (schemaName === "JudgeCaseScores") {
    const instruction = findJsonMessage(messages, (value) => value.blindSamples && value.rubricDimensions);
    const artifactByLabel = extractArtifactIds(messages);
    return {
      scores: instruction.blindSamples.flatMap((sample, sampleIndex) => instruction.rubricDimensions.map((dimension, dimensionIndex) => {
        const artifactId = artifactByLabel.get(sample.label);
        if (!artifactId) throw new Error(`Judge mock could not resolve an Artifact for ${sample.label}`);
        return {
          blindSampleId: sample.sampleId,
          rubricDimensionId: dimension.id,
          aiScore: Number((8.4 - sampleIndex * 0.3 - dimensionIndex * 0.2).toFixed(1)),
          reason: "原始证据完整呈现任务结果，核心要求清晰可核查。",
          evidence: [`Artifact ${artifactId} 展示了完整输出和可验证的结果结构。`],
          confidence: 0.91,
        };
      })),
    };
  }
  if (schemaName === "FinalResultAnalysis") {
    const input = findJsonMessage(messages, (value) => value.experiment?.products);
    const single = input.experiment.products.length === 1;
    return {
      winnerReason: single ? "这款产品在核心体验任务中表现稳定，原始证据支持总体判断。" : "综合得分最高的产品在主要维度上保持领先。",
      products: input.experiment.products.map((product) => ({
        productId: product.productId,
        headline: single ? "核心任务完成稳定，证据链完整。" : "在共同任务中呈现清晰的综合表现。",
        strengths: ["核心任务完成度稳定", "原始结果易于核查"],
        weaknesses: ["仅覆盖当前标准化任务"],
        bestFor: ["重视默认体验与可验证结果的用户"],
        notIdealFor: ["需要高度定制工作流的用户"],
        keyFindings: ["首次生成质量与真实工作流价值需要分开判断"],
      })),
      crossProductInsights: [single ? "官方核心卖点在本次真实任务中得到部分验证。" : "共同任务放大了信息结构差异。"],
      recommendationSummary: single ? "适合先用真实任务验证是否匹配个人工作流，再决定长期使用。" : "应根据具体维度和用户场景选择，而不是只看综合分。",
      limitations: ["测试只覆盖当前 Protocol 和一次默认生成"],
      counterintuitiveFindings: ["一次生成质量不等同于长期工作流效率"],
    };
  }
  if (schemaName === "BenchmarkReport") {
    const input = findJsonMessage(messages, (value) => value.reportSource?.experiment);
    const report = input.reportSource;
    const single = input.projectMode === "single";
    return {
      eyebrow: single ? "Single Product Experience" : "Comparison Benchmark",
      title: single ? "一款 AI 产品的真实深度体验报告" : "两款 AI 产品的标准化横向测评报告",
      subtitle: "基于锁定方案、原始 Artifact、AI Judge 与人工复核。",
      readingTimeMinutes: 6,
      tldr: single ? "核心体验任务完成稳定，但结论仅适用于当前 Protocol。" : "共同任务揭示了产品在完成度与证据质量上的差异。",
      tldrDetail: "所有判断都绑定当前 Final Score 和原始测试证据。",
      whyTheseProducts: single ? "选择这款产品是为了验证其官方核心能力是否能在真实场景成立。" : "选择这些产品是因为它们具有共同任务和可比输出。",
      methodologySummary: `先锁定 Protocol，再执行统一任务并上传未经编辑的原始${textOnlyEvidence ? "文本结果" : "截图"}，随后完成 Blind Judge 与人工复核。`,
      caseReviews: report.experiment.protocol.testCases.map((testCase) => ({
        testCaseId: testCase.id,
        findings: `原始${textOnlyEvidence ? "文本证据" : "截图"}支持对任务完成度和输出结构的判断。`,
        productAnalyses: report.experiment.products.map((product) => ({ productId: product.productId, analysis: "结果完整呈现核心内容，同时保留可进一步验证的限制。" })),
      })),
      finalRecommendation: single ? "建议先用自己的真实任务验证工作流匹配度，再决定是否长期使用。" : "建议结合具体场景和维度表现选择产品。",
    };
  }
  if (schemaName === "ContentIdeas") {
    const input = findJsonMessage(messages, (value) => value.sourceType === "confirmed_findings" || value.sourceType === "professional_report");
    const testCaseId = input.testCases[0]?.id;
    if (!testCaseId) throw new Error("Content discovery mock did not receive a TestCase");
    const artifactId = input.imageArtifacts[0]?.artifactId;
    const evidence = artifactId ? [artifactId] : [];
    return {
      ideas: [
        {
          id: "e2e-quick-angle",
          title: "先看 AI 能不能把任务做完",
          type: "具体观察",
          angle: "判断 AI 工具时，先看它能不能把一个真实任务推进到可以核对的结果。",
          insight: "一次完整的任务结果，比功能清单更能说明默认体验是否可用。",
          whyInteresting: "它把抽象的产品能力落到了用户能直接检查的结果上。",
          supportingEvidence: ["原始测试结果保留了本次任务的具体输出。"],
          relatedTestCaseIds: [testCaseId],
          relatedArtifactIds: evidence,
          informationValue: 0.92,
          discussionPotential: 0.86,
          confidence: 0.9,
          recommended: true,
        },
        {
          id: "e2e-evidence-angle",
          title: "结果出来以后还要不要人工核对",
          type: "使用边界",
          angle: "AI 做得越完整，用户越需要知道结果该如何核对。",
          insight: "省掉操作不等于省掉判断，证据是否可回看同样重要。",
          whyInteresting: "它保留了效率和可验证性之间的真实取舍。",
          supportingEvidence: ["测试 Artifact 能够回到同一次任务结果。"],
          relatedTestCaseIds: [testCaseId],
          relatedArtifactIds: evidence,
          informationValue: 0.84,
          discussionPotential: 0.8,
          confidence: 0.86,
          recommended: false,
        },
      ],
    };
  }
  if (schemaName === "CommunityStoryBrief") {
    const input = findJsonMessage(messages, v => v.selectedIdea && v.factLedger);
    const f = input.factLedger[0];
    return { readerQuestion: input.selectedIdea.angle, targetReader: "考虑使用该工具的人", spine: input.selectedIdea.insight,
      supportingPoints: [{ claim: input.selectedIdea.insight, readerValue: f.interpretation, findingIds: [f.id], evidenceArtifactIds: f.evidenceArtifactIds, detail: f.observation, role: "main" }],
      corePromiseGaps: [], scope: "只限当前任务", ending: "可用来完成这项任务，使用前仍应核对结果", avoidClaims: [], comparison: false };
  }
  if (schemaName === "CommunityPostDraft") {
    const input = findJsonMessage(messages, v => v.selectedIdea && v.config && v.sourceType);
    return { title: `${input.products[0].name}：任务输出可以核对`, body: `我用${input.products[0].name}处理这项任务。${input.factLedger[0].observation}这份输出可以作为整理材料的起点，实际采用前仍要核对具体内容。`, tags: ["AI工具"], interactionQuestion: "" };
  }
  if (schemaName === "CommunityPostReview") {
    return { articleReview: { concreteScenes: true, boundedInterpretation: true, nonRepetitive: true, usefulConclusion: false, issues: ["缺少结尾建议"] }, issues: [{ field: "body", quote: null, kind: "structure", reason: "缺少结尾建议", instruction: "增加有依据的使用建议" }] };
  }
  if (schemaName === "CommunityPostRevision") {
    const input = findJsonMessage(messages, v => v.config && v.draft);
    return { ...input.draft, body: input.draft.body + "可以先用同样的任务试一次，再决定是否继续使用。" };
  }
  if (schemaName === "EvidenceCheckedCommunityPost") {
    return {
      articleReview: { concreteScenes: true, boundedInterpretation: true, nonRepetitive: true, usefulConclusion: true, issues: [] },
      stylePreservation: { facts: true, scope: true, stance: true, experience: true, advice: true, evidence: true, issues: [] },
      screenshotRecommendations: [],
    };
  }
  if (schemaName === "MicroFindingDiscovery") {
    const input = findJsonMessage(messages, (value) => value.productContext && value.products);
    const cases = input.products.flatMap((product) => product.cases);
    const microFindings = Array.from({ length: 10 }, (_, index) => {
      const item = cases[index % cases.length];
      const number = index + 1;
      const whatHappened = `工具收到第${number}个具体要求后，先把任务里需要确认的部分找出来，再交付一个可以直接核对的结果。`;
      return {
        id: `finding-${number}`,
        observation: `它没有只给一句建议，而是完成了第${number}个可以核对的动作。`,
        rawEvidence: item.artifact.concreteEvidence ?? item.artifact.observableOutput ?? item.artifact.rawExcerpt ?? item.artifact.notes ?? `第${number}条原始任务记录。`,
        sourceContext: `${item.title}中的第${number}个可观察细节。`,
        whyInteresting: "这个小动作能区分只会回答和真的把任务往前推进。",
        possibleInterpretation: "判断 AI 工具时，可以先看它有没有减少用户补充步骤。",
        tension: "当前材料只覆盖这个任务，不能外推到所有场景。",
        confidence: 0.88,
        sourceTestCaseId: item.testCaseId,
        sourceArtifactIds: [item.artifact.artifactId],
        sourceKinds: ["raw_artifact", "task_result"],
        humanReadableMoment: {
          whatHappened,
          whyItMatters: "普通用户不必先学会告诉工具每一步怎么做，也能看懂它有没有把事情办明白。",
          technicalTruth: `The tool completed observable task step ${number} and returned a verifiable result.`,
          analogy: null,
        },
      };
    });
    const ranking = (offset) => ({ discussionValue: 0.91 - offset, novelty: 0.86 - offset, evidenceStrength: 0.94 - offset, specificity: 0.93 - offset, accessibility: 0.96 - offset, tension: 0.88 - offset });
    const angle = (id, title, contentType, coreOpinion, anchor, support, offset) => ({
      id, title, hook: title, coreOpinion, anchorFindingId: anchor, supportingFindingIds: [support],
      whyThisMatters: "它把一个抽象的产品判断落到了普通人能复述的小事上。",
      tensionOrCounterPoint: "但这个判断只适用于当前任务，更多场景仍需继续验证。",
      audience: "关心 AI 工具能否真正减少操作负担的普通用户",
      contentType, ranking: ranking(offset),
    });
    return {
      microFindings,
      ideas: [
        angle("less-instruction", "AI好不好用先看你少说多少", "contrarian_take", "AI 工具真正省事的地方，可能不是回答更快，而是用户可以少交代几步。", "finding-1", "finding-2", 0),
        angle("show-process", "AI做事要不要把过程全摊开", "debate", "直接交付和过程可见之间，没有一个适合所有人的答案。", "finding-3", "finding-4", 0.01),
        angle("verify-result", "AI交付以后人为什么更忙了", "observation", "工具做得更多以后，人的工作可能从操作变成核对。", "finding-5", "finding-6", 0.02),
        angle("new-user", "第一次用AI先看它会不会找事", "recommendation", "普通用户挑 AI 工具时，可以先看它能否自己补齐必要步骤。", "finding-7", "finding-8", 0.03),
        angle("small-action", "一个小动作比功能清单更说明问题", "opinion", "产品值不值得继续用，常常藏在一个不起眼的任务动作里。", "finding-9", "finding-10", 0.04),
      ],
    };
  }
  if (schemaName === "CommunityPost") {
    const input = findJsonMessage(messages, (value) => value.writingPacket);
    const packet = input.writingPacket;
    const rewritten = Boolean(input.critic && input.draft);
    const opening = rewritten
      ? `我现在判断 ${packet.product.name}，会先看一个很小的动作。`
      : `最近我在想，判断 ${packet.product.name} 时，可能不用先看完整功能。`;
    const body = `${opening}\n\n${packet.anchorMoment.whatHappened}\n\n这个细节不大，却把区别说得很清楚：${packet.anchorMoment.whyItMatters} 说白了，我更在意的不是它能说多少，而是用户少交代几步以后，它还能不能把事情办明白。\n\n但问题也出在这里。工具自己往前走得越多，人就越需要知道最后该怎么核对。省掉操作，不代表省掉判断；直接给结果和展示过程之间，本来就有取舍。\n\n${packet.limitation} 所以我的结论只放在这个小切口上：${packet.angle.coreOpinion}\n\n如果让你选，你更愿意少说几步直接拿结果，还是多看一点过程再放心接手？`;
    return {
      title: packet.angle.hook,
      coreOpinion: packet.angle.coreOpinion,
      contentType: packet.angle.contentType,
      body,
      tags: ["AI产品", "产品观察", "工作流"],
      interactionQuestion: "你更愿意少说几步直接拿结果，还是多看一点过程再放心接手？",
      screenshotRecommendations: [],
    };
  }
  if (schemaName === "SafeCommunityRewrite") {
    const input = findJsonMessage(messages, (value) => value.original && value.writingPacket);
    return {
      title: input.original.title,
      body: input.original.body.replace("最近我在想，判断", "判断"),
      interactionQuestion: input.original.interactionQuestion,
    };
  }
  if (schemaName === "CommunityStyleCritic") {
    const input = findJsonMessage(messages, (value) => value.draft && value.writingPacket);
    const rewritten = Boolean(input.original);
    return rewritten ? {
      meaningPreservation: { numbersPreserved: true, experiencePreserved: true, productBehaviorPreserved: true, conclusionScopePreserved: true, opinionPreserved: true, evidencePreserved: true, violations: [] },
      verdict: "通过",
      totalScore: 90,
      scores: { specificity: 22, opinionAndTradeoff: 23, evidenceAndBoundaries: 18, communityVoice: 13, discussionSpace: 9, titleAndRhythm: 5 },
      coreOpinion: input.draft.coreOpinion,
      communityStrengths: ["开头直接给出判断", "具体素材与边界清楚", "结尾问题有明确分歧"],
      styleRisks: [],
      factRisks: [],
      evidenceCritic: { pass: true, concreteEvidencePresent: true, evidenceSpecificity: 5, opinionEvidenceBinding: 5, unsupportedClaims: [] },
      jargonCritic: { pass: true, generalAudienceUnderstands: true, grandmotherTest: true, storySurvivesWithoutJargon: true, unnecessaryTerms: [] },
      styleAndVaguenessCritic: { pass: true, communityFeel: 5, liveliness: 4, antiVagueness: 5, opinionDensity: 4, reportTone: 0, vaguePhrases: [] },
      requiredChanges: [],
      recommendedStructure: "保留当前观点型结构。",
      rewriteSample: { title: input.draft.title, opening: input.draft.body.split("\n\n").slice(0, 2).join("\n\n"), ending: input.draft.interactionQuestion },
    } : {
      verdict: "小修",
      totalScore: 80,
      scores: { specificity: 18, opinionAndTradeoff: 21, evidenceAndBoundaries: 17, communityVoice: 11, discussionSpace: 9, titleAndRhythm: 4 },
      coreOpinion: input.draft.coreOpinion,
      communityStrengths: ["主观点可以提炼", "讨论问题具体"],
      styleRisks: [{ excerpt: "最近我越来越觉得", pattern: "开头偏通用", impact: "第一屏没有立刻进入具体判断" }],
      factRisks: [],
      evidenceCritic: { pass: true, concreteEvidencePresent: true, evidenceSpecificity: 4, opinionEvidenceBinding: 4, unsupportedClaims: [] },
      jargonCritic: { pass: true, generalAudienceUnderstands: true, grandmotherTest: true, storySurvivesWithoutJargon: true, unnecessaryTerms: [] },
      styleAndVaguenessCritic: { pass: false, communityFeel: 3, liveliness: 3, antiVagueness: 4, opinionDensity: 4, reportTone: 1, vaguePhrases: [] },
      requiredChanges: ["开头直接给出唯一判断", "把具体材料提前", "缩短解释性长句"],
      recommendedStructure: "观点型：判断 → 具体材料 → 取舍 → 分歧。",
      rewriteSample: { title: input.draft.title, opening: "我只先看一件事：结果能不能快速验收。", ending: input.draft.interactionQuestion },
    };
  }
  throw new Error(`Unsupported structured schema: ${schemaName}`);
}

function standards(excellent) {
  return { excellent, good: "大部分要求实现，仅有轻微问题", acceptable: "核心要求部分实现", poor: "核心要求缺失或无法验证" };
}

function extractSources(messages) {
  for (const message of messages) {
    if (typeof message.content !== "string") continue;
    const marker = "Use only these retrieved sources for product facts and preserve source URLs in the result: ";
    if (!message.content.startsWith(marker)) continue;
    const sources = JSON.parse(message.content.slice(marker.length));
    if (Array.isArray(sources) && sources.length > 0) return sources;
  }
  throw new Error("Research mock did not receive traceable search sources");
}

function extractArtifactIds(messages) {
  const result = new Map();
  for (const text of textParts(messages)) {
    try {
      const value = JSON.parse(text);
      for (const artifact of value.rawArtifacts ?? []) {
        if (artifact.sampleLabel && artifact.artifactId) result.set(artifact.sampleLabel, artifact.artifactId);
      }
    } catch {
      // Multimodal messages use human-readable Artifact headers instead.
    }
    const match = text.match(/Blind Sample: ([^;]+); Artifact ID: ([0-9a-f-]{36});/i);
    if (match) result.set(match[1], match[2]);
  }
  return result;
}

function extractFindingsArtifacts(messages) {
  const artifacts = [];
  for (const text of textParts(messages)) {
    const match = text.match(/Product: ([^;]+); productId: ([0-9a-f-]{36}); TestCase: ([^;]+); testCaseId: ([0-9a-f-]{36}); artifactId: ([0-9a-f-]{36});/i);
    if (match) artifacts.push({ productName: match[1], productId: match[2], testCaseTitle: match[3], testCaseId: match[4], artifactId: match[5] });
  }
  return artifacts;
}

function findJsonMessage(messages, predicate) {
  for (const text of textParts(messages).reverse()) {
    const candidates = [text, text.split("\n")[0]];
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(candidate);
        if (predicate(value)) return value;
      } catch {
        // Non-JSON prompt text is expected alongside structured user input.
      }
    }
  }
  throw new Error("E2E provider mock could not locate the structured task input");
}

function textParts(messages) {
  return messages.flatMap((message) => typeof message.content === "string"
    ? [message.content]
    : Array.isArray(message.content)
      ? message.content.filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text)
      : []);
}

function getSchemaName(messages) {
  const first = messages?.[0]?.content;
  const match = typeof first === "string" ? first.match(/schema ([A-Za-z]+)/) : null;
  if (!match) throw new Error("Structured task schema name is missing");
  return match[1];
}

function createCompletionResponse(value) {
  return createCompletionResponseFromContent(JSON.stringify(value), "stop");
}

function createProtocolScenarioResponse(scenario, attempt, schemaName, messages) {
  if ((scenario === "empty-then-success" && attempt === 1) || scenario === "always-empty") {
    if (attempt > 1) requireRepairInstruction(messages, "Previous response was empty");
    return { outcome: "empty_response", body: createCompletionResponseFromContent("", "stop", 110, 0) };
  }
  if (scenario === "empty-then-success" && attempt === 2) requireRepairInstruction(messages, "Previous response was empty");
  if (scenario === "truncated-then-success" && attempt === 1) {
    return { outcome: "truncated_response", body: createCompletionResponseFromContent('{"title":"truncated"', "length", 120, 10_000) };
  }
  if (scenario === "truncated-then-success" && attempt === 2) requireRepairInstruction(messages, "Previous response was truncated");
  if (scenario === "invalid-json-then-success" && attempt === 1) {
    return { outcome: "invalid_json", body: createCompletionResponseFromContent('{"title":', "stop", 115, 8) };
  }
  if (scenario === "invalid-json-then-success" && attempt === 2) requireRepairInstruction(messages, "Previous response was not valid JSON");
  if (scenario === "schema-invalid-then-success" && attempt === 1) {
    const invalid = buildStructuredOutput(schemaName, messages);
    invalid.rubric[0].description = "";
    return { outcome: "schema_validation", body: createCompletionResponse(invalid) };
  }
  if (scenario === "schema-invalid-then-success" && attempt === 2) requireRepairInstruction(messages, "rubric");
  return { outcome: "success", body: createCompletionResponse(buildStructuredOutput(schemaName, messages)) };
}

function requireRepairInstruction(messages, expected) {
  if (!textParts(messages).some((text) => text.includes(expected))) {
    throw new Error(`Protocol repair request did not include: ${expected}`);
  }
}

function createCompletionResponseFromContent(content, finishReason, promptTokens = 100, completionTokens = 100) {
  return {
    id: `e2e-${randomUUID()}`,
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
