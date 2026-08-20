import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const expectedAuthorization = "Bearer e2e-local-provider-boundary";

export async function startE2EProviderMock() {
  const requests = [];
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
      requests.push({ task: schemaName, multimodal });
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
      taskCounts: Object.fromEntries([...Map.groupBy(requests, (item) => item.task)].map(([task, items]) => [task, items.length])),
      multimodalJudgeRequests: requests.filter((item) => item.task === "JudgeCaseScores" && item.multimodal).length,
    }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function createSearchResponse(body) {
  const query = typeof body.search_query === "string" ? body.search_query : "official product docs";
  const domain = query.match(/site:([^\s]+)/)?.[1] ?? "e2e-provider.example.com";
  const suffix = createHash("sha256").update(query).digest("hex").slice(0, 12);
  return {
    search_result: [{
      title: "Official E2E product documentation",
      link: `https://${domain}/docs/${suffix}`,
      content: "Official product positioning, core capability, pricing and usage documentation for the isolated E2E run.",
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
      commonCapabilities: single ? ["核心输出质量", "真实场景完成度"] : forcedNotComparable ? [] : ["结构化内容生成", "视觉结果输出"],
      warnings: forcedNotComparable ? ["强行比较会引入任务偏差"] : [],
    };
  }
  if (schemaName === "TestProtocol") {
    const input = findJsonMessage(messages, (value) => value.project?.mode);
    const single = input.project.mode === "single";
    const caseCount = single ? 1 : 2;
    return {
      title: single ? "单产品核心能力体验方案" : "同类产品标准化横评方案",
      goal: single ? "通过真实任务和原始截图验证核心能力、使用体验与明显限制。" : "在统一输入、Prompt 与证据要求下比较同类产品表现。",
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
        title: single ? "核心场景真实体验" : `标准化比较场景 ${index + 1}`,
        objective: single ? "验证官方核心卖点在真实任务中的表现。" : "比较同一任务下的完成度和输出质量。",
        prompt: `请根据给定目标完成第 ${index + 1} 个标准化任务，并直接输出最终结果。`,
        inputDescription: null,
        inputArtifacts: [],
        expectedOutputTypes: ["image"],
        evidenceRequirements: ["上传未经裁剪或后期编辑的完整原始截图"],
        observationFocus: ["任务完成度", "信息结构", "视觉可读性"],
        executionRules: ["使用默认设置", "仅生成一次", "不人工美化"],
      })),
      rubric: [
        { position: 1, name: "任务完成度", weight: 60, description: "核心要求是否完整实现。", scoringStandard: standards("核心要求完整实现") },
        { position: 2, name: "证据可验证性", weight: 40, description: "原始结果是否清晰支持判断。", scoringStandard: standards("证据清晰且可核查") },
      ],
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
          reason: "原始截图完整呈现任务结果，核心要求清晰可核查。",
          evidence: [`Artifact ${artifactId} 展示了完整输出和可验证的视觉结构。`],
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
      methodologySummary: "先锁定 Protocol，再执行统一任务并上传未经编辑的原始截图，随后完成 Blind Judge 与人工复核。",
      caseReviews: report.experiment.protocol.testCases.map((testCase) => ({
        testCaseId: testCase.id,
        findings: "原始截图支持对任务完成度和输出结构的判断。",
        productAnalyses: report.experiment.products.map((product) => ({ productId: product.productId, analysis: "结果完整呈现核心内容，同时保留可进一步验证的限制。" })),
      })),
      finalRecommendation: single ? "建议先用自己的真实任务验证工作流匹配度，再决定是否长期使用。" : "建议结合具体场景和维度表现选择产品。",
    };
  }
  if (schemaName === "ContentIdeas") {
    const input = findJsonMessage(messages, (value) => value.imageArtifacts && value.protocol);
    return {
      ideas: [{
        id: "experience-evidence",
        title: input.projectMode === "single" ? "真实体验后，我更关注它能否进入长期工作流" : "综合得分之外，工作流差异更值得讨论",
        type: "真实体验",
        angle: "从一次生成质量与长期使用价值的差别切入。",
        insight: "看起来完成任务只是第一步，能否稳定进入日常工作流更重要。",
        whyInteresting: "这个判断同时有原始截图和评分证据支持，也给真实用户留下讨论空间。",
        supportingEvidence: ["统一任务下的原始截图完整保留了实际输出"],
        relatedTestCaseIds: [input.protocol.testCases[0].id],
        relatedArtifactIds: [input.imageArtifacts[0].artifactId],
        informationValue: 0.9,
        discussionPotential: 0.86,
        confidence: 0.92,
        recommended: true,
      }],
    };
  }
  if (schemaName === "CommunityPost") {
    const input = findJsonMessage(messages, (value) => value.selectedIdea && value.imageArtifacts);
    return {
      title: input.projectMode === "single" ? "我真实体验了这款 AI 产品之后，更在意它能否进入长期工作流" : "测完两款 AI 产品，我更在意综合分之外的工作流差异",
      body: "我用统一任务真实体验了这款 AI 产品，并保留了未经编辑的原始截图。\n\n最重要的发现是：它可以完成核心任务，但首次生成质量和长期工作流效率并不是同一个概念。具体截图能看到内容结构完整，评分证据也支持这个判断；与此同时，当前测试只覆盖一次默认生成，不能代表所有复杂场景。\n\n我的判断是，选择工具之前最好先用自己的真实任务验证，而不是只看功能列表。",
      tags: ["AI产品体验", "真实测试", "工作流"],
      interactionQuestion: "你实际使用 AI 产品时，更看重第一次生成质量，还是长期编辑效率？",
      screenshotRecommendations: [{
        artifactId: input.imageArtifacts[0].artifactId,
        reason: "支持正文中关于核心任务完成度与视觉结构的判断。",
        supportsClaim: "首次生成质量和长期工作流价值需要分开判断。",
        supportsParagraph: 2,
        order: 1,
      }],
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
    const match = text.match(/Blind Sample: ([^;]+); Artifact ID: ([0-9a-f-]{36});/i);
    if (match) result.set(match[1], match[2]);
  }
  return result;
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
  return {
    id: `e2e-${randomUUID()}`,
    choices: [{ message: { content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 100, completion_tokens: 100 },
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
