import { getHumanReviewWorkspace, lockHumanReview, revealHumanReview } from "@/lib/services/human-review.service";
import { runBlindJudge } from "@/lib/services/judge.service";
import { generateProtocol, getProtocolWorkspace, lockProtocol } from "@/lib/services/protocols.service";
import { createProject, listProjectSummaries } from "@/lib/services/projects.service";
import { discoverContentIdeas, generateCommunityPost, getPublishWorkspace } from "@/lib/services/publish.service";
import { generateReport, getReportWorkspace } from "@/lib/services/report.service";
import { executeProductResearch } from "@/lib/services/research.service";
import { generateFinalResultAnalysis, getResultsWorkspace } from "@/lib/services/result-analysis.service";
import { finalizeTestExecution, getTestExecutionWorkspace, uploadTestArtifact } from "@/lib/services/test-execution.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const runtime = "nodejs";
export const maxDuration = 1800;

const simulationDisclosure = "模拟体验数据，仅用于 AI Benchmark Studio 产品流程测试，不代表真实第三方产品实测结果。";

type DemoScenario = {
  productName: string;
  productType: string;
  officialUrl: string;
  viewpoint: string;
  intent: string;
  evidence: Array<{
    observableOutput: string;
    userObservation: string;
    concreteEvidence: string;
    signal: "strongly_positive" | "positive_with_reservations" | "mixed" | "negative";
  }>;
};

const scenarios: DemoScenario[] = [
  {
    productName: "Codex",
    productType: "Coding Agent",
    officialUrl: "https://openai.com/codex/",
    viewpoint: "核心执行能力很强，但长任务中的过程反馈仍让人不够踏实。",
    intent: "体验 Coding Agent 在陌生代码库理解、跨文件功能修改和真实 Bug 修复中的表现。请生成恰好 3 个任务，重点观察 repo 理解、文件与 Shell 工具、修改和测试；禁止写作或普通 Brainstorm。所有任务仅要求可复制的文本或代码证据，不要求图片、PDF 或视频。体验 Evidence 将使用明确标注的模拟数据，只用于验证本系统流程。",
    evidence: [
      {
        observableOutput: "输出先定位路由、服务层和仓储层，再给出一张跨文件调用关系清单，并指出状态推进发生在显式 action 中。",
        userObservation: "第一次阅读就抓住了真正的数据链，几乎不用我补充目录背景。",
        concreteEvidence: "清单具体列出 app/api、lib/services 与 lib/repositories 三层职责，并标注了两个需要继续核对的状态入口。",
        signal: "strongly_positive",
      },
      {
        observableOutput: "完成一个已有功能修改，列出变更文件、关键差异和测试命令，最终类型检查通过。",
        userObservation: "结果可靠，但执行数分钟时只有笼统的进行中提示，我难以判断它卡在检索、修改还是测试。",
        concreteEvidence: "最终记录包含 4 个文件的修改摘要和 2 条验证命令；中间日志有一段较长空档，没有说明当前步骤。",
        signal: "positive_with_reservations",
      },
      {
        observableOutput: "先复现状态回退问题，第一次修复漏掉旧页面回访场景，补充回归条件后完成第二版修复。",
        userObservation: "它能自己纠正，但首次方案过于相信当前页面状态，复杂流程仍需要人盯边界。",
        concreteEvidence: "第一次验证只覆盖正向流程；第二次新增返回 Research 后 Publish 数据仍保留的检查并通过。",
        signal: "mixed",
      },
    ],
  },
  {
    productName: "ChatGPT",
    productType: "通用 AI Assistant",
    officialUrl: "https://openai.com/chatgpt/overview/",
    viewpoint: "多步骤办公任务很顺手，但遇到需要深挖因果的分析，流畅不等于有深度。",
    intent: "体验通用 AI Assistant 的文件理解、多步骤办公分析和约束保持能力。请生成恰好 3 个真实任务：一项文件理解、一项多步骤分析、一项容易暴露遗漏或反差的任务；不要退化成普通问答。所有任务仅要求可复制的文本证据，不要求图片、PDF 或视频。体验 Evidence 将使用明确标注的模拟数据，只用于验证本系统流程。",
    evidence: [
      {
        observableOutput: "把一份混杂会议记录整理成决策、负责人、截止时间和待确认问题四类清单。",
        userObservation: "几乎不需要学习成本，第一次输出就能直接带进周会。",
        concreteEvidence: "输出识别出 6 项行动、3 位负责人和 2 个缺失截止时间，并把不确定项单独标注为待确认。",
        signal: "strongly_positive",
      },
      {
        observableOutput: "完成表格摘要、异常点识别和建议三步分析，结构完整但原因解释偏通用。",
        userObservation: "看起来很顺，真正追问为什么时，回答更多是合理猜测而不是从数据中继续验证。",
        concreteEvidence: "它指出转化下降集中在两个渠道，却没有计算渠道结构变化，后续建议因此缺少一层证据。",
        signal: "positive_with_reservations",
      },
      {
        observableOutput: "对两版方案做差异对照并生成邮件，但遗漏了‘不得承诺上线日期’这一条限制。",
        userObservation: "文案自然，约束多起来后仍要逐条复核，不能因为读起来顺就直接发送。",
        concreteEvidence: "差异表覆盖 8 项中的 7 项；邮件结尾使用了确定性排期措辞，与输入限制冲突。",
        signal: "mixed",
      },
    ],
  },
  {
    productName: "Perplexity",
    productType: "AI Search / Research",
    officialUrl: "https://www.perplexity.ai/",
    viewpoint: "引用让研究启动速度很快，但真正省时间的前提是你愿意继续检查来源质量。",
    intent: "体验 AI Search / Research 产品在真实问题调研、多来源交叉验证和来源质量判断中的表现。请生成恰好 3 个任务，要求检索真实公开资料、综合不同观点并输出可验证结论；不要设计普通写作任务。所有体验结果仅要求可复制的文本证据，不要求截图、PDF 或视频。体验 Evidence 将使用明确标注的模拟数据，只用于验证本系统流程。",
    evidence: [
      {
        observableOutput: "围绕一个政策问题快速给出结论、时间线和逐句引用，主要事实都能回到来源。",
        userObservation: "最惊喜的不是答案快，而是我能沿着引用立即判断哪些句子值得信。",
        concreteEvidence: "答案包含 7 个来源，其中 5 个是一手机构页面；关键日期与适用范围各有对应链接。",
        signal: "strongly_positive",
      },
      {
        observableOutput: "面对两份统计口径冲突的资料，主动区分样本、时间范围和指标定义，没有强行合并数字。",
        userObservation: "它在冲突处停下来解释，比给一个看似确定的结论更有价值。",
        concreteEvidence: "输出单列‘不可直接比较’段落，指出一个来源统计企业数，另一个统计使用者数。",
        signal: "strongly_positive",
      },
      {
        observableOutput: "调研较冷门问题时给出完整答案，但 4 个关键引用中有 2 个来自重复转载，官方原文没有被优先找到。",
        userObservation: "它能帮我快速搭框架，却没有替我完成最后一公里的来源筛选。",
        concreteEvidence: "两个链接正文与标题高度重复，继续追溯后发现都指向同一篇二手报道。",
        signal: "mixed",
      },
    ],
  },
  {
    productName: "Jasper",
    productType: "AI 内容 / 创作工具",
    officialUrl: "https://www.jasper.ai/",
    viewpoint: "品牌化批量创作很有价值，但优势集中在内容团队，不是所有写作者都需要这套工作流。",
    intent: "体验 AI 内容创作工具在品牌语气控制、长内容改写和多渠道复用中的表现。请生成恰好 3 个任务，重点观察风格控制、内容结构与批量创作效率；写作任务在此产品类型中是核心场景。所有任务仅要求可复制的文本证据，不要求图片、PDF 或视频。体验 Evidence 将使用明确标注的模拟数据，只用于验证本系统流程。",
    evidence: [
      {
        observableOutput: "依据给定品牌词表生成两版产品介绍，禁用词和语气要求都被保留。",
        userObservation: "对固定品牌口径的执行比自由创意更稳定，适合多人协作时减少反复校对。",
        concreteEvidence: "两版内容都使用 4 个指定关键词，避开全部 3 个禁用词，并维持克制、专业的短句风格。",
        signal: "strongly_positive",
      },
      {
        observableOutput: "把一篇长内容拆成邮件、社媒短帖和落地页摘要，结构齐全但三个渠道的开头相似。",
        userObservation: "批量产出效率很高，想要真正像不同渠道的原生内容仍需要人工再推一遍。",
        concreteEvidence: "三个版本都复用了相同问题句和利益点顺序，只有长度与结尾行动词明显变化。",
        signal: "positive_with_reservations",
      },
      {
        observableOutput: "自由散文改写遵守格式，却把原文中有个性的停顿和不完整句统一润色掉。",
        userObservation: "它更像内容团队的生产工具，不太适合把个人表达里的毛边当成风格资产的人。",
        concreteEvidence: "原文 5 处短促断句被合并为完整句，信息未丢失，但个人语气明显变平。",
        signal: "negative",
      },
    ],
  },
];

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new Response(null, { status: 404 });
  const body = await request.json().catch(() => null) as { products?: unknown; publishOnly?: unknown; rediscover?: unknown; postCount?: unknown } | null;
  const requestedProducts = Array.isArray(body?.products)
    ? new Set(body.products.filter((value): value is string => typeof value === "string"))
    : null;
  const selectedScenarios = requestedProducts?.size
    ? scenarios.filter((scenario) => requestedProducts.has(scenario.productName))
    : scenarios;
  const results = [];
  const errors = [];
  for (const scenario of selectedScenarios) {
    try {
      results.push(body?.publishOnly === true
        ? await republishExistingDemo(scenario, readPublishAttemptLimit(), body.rediscover === true, normalizePostCount(body.postCount))
        : await createOrResumeDemo(scenario));
    } catch (error) {
      errors.push({
        projectName: `AUTO DEMO · ${scenario.productName} · ${scenario.productType}`,
        error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown AUTO DEMO failure",
      });
    }
  }
  return Response.json(
    { ok: errors.length === 0, simulationDisclosure, projects: results, errors },
    { status: errors.length === 0 ? 200 : 500 },
  );
}

async function republishExistingDemo(scenario: DemoScenario, maxAttempts: number, rediscover: boolean, postCount: number) {
  const name = `AUTO DEMO · ${scenario.productName} · ${scenario.productType}`;
  const existing = (await listProjectSummaries()).find((project) => project.name === name);
  if (!existing) throw new Error(`${name}: existing project was not found`);
  const report = await getReportWorkspace(existing.id);
  if (!report?.report?.content || report.report.status !== "completed") {
    throw new Error(`${name}: completed Report source was not found`);
  }

  const failures: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let publish = await getPublishWorkspace(existing.id);
      if (rediscover || !publish?.pack || publish.pack.ideas.length < 5) {
        await discoverContentIdeas(existing.id);
        publish = await getPublishWorkspace(existing.id);
        rediscover = false;
      }
      const ideas = publish?.pack?.ideas ?? [];
      const selectedIdeas = [...ideas]
        .sort((left, right) => {
          const priority = (idea: typeof left) => (idea.recommended ? 1 : 0)
            + idea.informationValue + idea.discussionPotential + idea.confidence;
          return priority(right) - priority(left);
        })
        .slice(0, postCount);
      if (selectedIdeas.length < postCount) throw new Error("Content Ideas were not generated");
      const generatedPosts = [];
      for (const selectedIdea of selectedIdeas) {
        await generateCommunityPost(existing.id, {
          ideaId: selectedIdea.id,
          config: {
            channel: "通用社区",
            goal: "引发讨论",
            tone: "自然、鲜活、有态度；围绕一个普通人能复述的小事，不伪造第一人称实测",
            length: "medium",
            imageCount: 0,
            interactionGoal: "围绕核心体验矛盾提出一个具体、可反驳的问题",
          },
        });
        publish = await getPublishWorkspace(existing.id);
        if (!publish?.pack?.post || publish.pack.status !== "ready") throw new Error("Community Post was not completed");
        if (/我(?:用|试|体验|操作|遇到|跑|测)(?:了|过|一下|下来|之后)/u.test(publish.pack.post.body)) {
          throw new Error("simulated Evidence was presented as first-person experience");
        }
        generatedPosts.push({ ideaId: selectedIdea.id, ...publish.pack.post });
      }
      return {
        projectId: existing.id,
        projectName: name,
        productType: scenario.productType,
        evidenceType: "simulated",
        articleTitle: generatedPosts[0]?.title,
        articleTitles: generatedPosts.map((post) => post.title),
        contentIdeaCount: ideas.length,
        communityAngles: ideas,
        posts: generatedPosts,
        publishPath: `/projects/${existing.id}/publish`,
        regenerationAttempt: attempt,
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Unknown Publish failure");
    }
  }
  throw new Error(`${name}: Publish regeneration failed after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}: ${failures.join(" | ")}`);
}

function readPublishAttemptLimit() {
  const configured = Number.parseInt(process.env.AUTO_DEMO_PUBLISH_ATTEMPTS ?? "3", 10);
  return Number.isFinite(configured) ? Math.min(3, Math.max(1, configured)) : 3;
}

function normalizePostCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(2, Math.max(1, value)) : 1;
}

async function createOrResumeDemo(scenario: DemoScenario) {
  const name = `AUTO DEMO · ${scenario.productName} · ${scenario.productType}`;
  const existing = (await listProjectSummaries()).find((project) => project.name === name);
  const projectId = existing?.id ?? await createProject({
    name,
    intent: `${scenario.intent}\n目标体验观点：${scenario.viewpoint}\n事实边界：${simulationDisclosure}`,
    products: [{ name: scenario.productName, officialUrl: scenario.officialUrl }],
  });

  let workflow = await getProjectWorkflowState(projectId);
  if (!workflow?.stages.research.completed) await executeProductResearch(projectId);

  let protocol = await getProtocolWorkspace(projectId);
  if (!protocol?.protocol) {
    await generateProtocol(projectId);
    protocol = await getProtocolWorkspace(projectId);
  }
  if (!protocol?.protocol) throw new Error(`${name}: Protocol was not created`);
  if (protocol.protocol.testCases.length < 2 || protocol.protocol.testCases.length > 3) {
    throw new Error(`${name}: expected 2-3 TestCases, received ${protocol.protocol.testCases.length}`);
  }
  const unsupportedTypes = protocol.protocol.testCases.flatMap((testCase) => testCase.expectedOutputTypes)
    .filter((type) => !["text", "code", "mixed"].includes(type));
  if (unsupportedTypes.length > 0) throw new Error(`${name}: unsupported simulated Evidence types: ${unsupportedTypes.join(", ")}`);
  if (protocol.protocol.status === "draft") await lockProtocol(projectId, protocol.protocol.id);

  let tests = await getTestExecutionWorkspace(projectId);
  if (!tests) throw new Error(`${name}: Test workspace was not initialized`);
  for (const [index, run] of tests.testRuns.entries()) {
    if (run.artifacts.length > 0) continue;
    const testCase = tests.protocol.testCases.find((item) => item.id === run.testCaseId);
    if (!testCase) throw new Error(`${name}: missing TestCase for TestRun ${run.id}`);
    const evidence = scenario.evidence[index % scenario.evidence.length]!;
    const rawText = buildSimulatedEvidence(scenario, testCase, evidence);
    await uploadTestArtifact({
      projectId,
      testRunId: run.id,
      file: new File([rawText], `simulated-${scenario.productName.toLowerCase()}-${index + 1}.md`, { type: "text/markdown" }),
      metadata: {
        generationTimeSeconds: 45 + index * 18,
        retryCount: evidence.signal === "mixed" || evidence.signal === "negative" ? 1 : 0,
        manuallyEdited: false,
        notes: simulationDisclosure,
      },
    });
  }
  tests = await getTestExecutionWorkspace(projectId);
  if (!tests) throw new Error(`${name}: Test workspace disappeared`);
  if (tests.testRuns.some((run) => run.status !== "ready_for_review")) await finalizeTestExecution(projectId, tests.protocol.id);

  let review = await getHumanReviewWorkspace(projectId);
  if (!review) {
    await runBlindJudge(projectId);
    review = await getHumanReviewWorkspace(projectId);
  }
  if (!review) throw new Error(`${name}: Human Review was not initialized`);
  if (review.status === "reviewing") {
    await lockHumanReview(projectId, review.reviewSessionId);
    review = await getHumanReviewWorkspace(projectId);
  }
  if (review?.status === "locked") await revealHumanReview(projectId, review.reviewSessionId);

  let results = await getResultsWorkspace(projectId);
  if (!results?.latestAnalysis || results.latestAnalysis.status !== "completed" || results.latestAnalysis.stale) {
    await generateFinalResultAnalysis(projectId);
    results = await getResultsWorkspace(projectId);
  }
  if (!results?.latestAnalysis?.output) throw new Error(`${name}: Results analysis was not completed`);

  let report = await getReportWorkspace(projectId);
  if (!report?.report || report.report.status !== "completed") {
    await generateReport(projectId);
    report = await getReportWorkspace(projectId);
  }
  if (!report?.report?.content) throw new Error(`${name}: Report was not completed`);

  let publish = await getPublishWorkspace(projectId);
  if (!publish?.pack || publish.pack.ideas.length < 5) {
    await discoverContentIdeas(projectId);
    publish = await getPublishWorkspace(projectId);
  }
  const selectedIdea = publish?.pack?.ideas.find((idea) => idea.recommended) ?? publish?.pack?.ideas[0];
  if (!selectedIdea) throw new Error(`${name}: Content Ideas were not generated`);
  if (publish?.pack?.status !== "ready" || !publish.pack.post) {
    await generateCommunityPost(projectId, {
      ideaId: selectedIdea.id,
      config: {
        channel: "通用社区",
        goal: "引发讨论",
        tone: "自然、克制、有观点；写成产品观察，不伪造第一人称实测，也不机械披露 fixture 状态",
        length: "medium",
        imageCount: 0,
        interactionGoal: "围绕核心体验矛盾提出一个真实讨论问题",
      },
    });
    publish = await getPublishWorkspace(projectId);
  }
  if (!publish?.pack?.post) throw new Error(`${name}: Community Post was not completed`);
  if (/我(?:用|试|体验|操作|遇到|跑|测)(?:了|过|一下|下来|之后)/u.test(publish.pack.post.body)) throw new Error(`${name}: simulated Evidence was presented as first-person experience`);

  workflow = await getProjectWorkflowState(projectId);
  if (!workflow || Object.values(workflow.stages).some((stage) => !stage.completed || !stage.accessible)) {
    throw new Error(`${name}: persisted workflow is incomplete`);
  }

  const basePath = `/projects/${projectId}`;
  return {
    projectId,
    projectName: name,
    productType: scenario.productType,
    evidenceType: "simulated",
    finalViewpoint: scenario.viewpoint,
    articleTitle: publish.pack.post.title,
    contentIdeaCount: publish.pack.ideas.length,
    paths: {
      research: `${basePath}/research`,
      protocol: `${basePath}/protocol`,
      test: `${basePath}/test`,
      review: `${basePath}/review`,
      results: `${basePath}/results`,
      report: `${basePath}/report`,
      publish: `${basePath}/publish`,
    },
  };
}

function buildSimulatedEvidence(
  scenario: DemoScenario,
  testCase: { title: string; objective: string; prompt: string; observationFocus: string[] },
  evidence: DemoScenario["evidence"][number],
) {
  return [
    "# AI Benchmark Studio 模拟体验 Evidence",
    "",
    `> ${simulationDisclosure}`,
    "",
    `- 产品：${scenario.productName}`,
    `- 产品类型：${scenario.productType}`,
    `- 体验任务：${testCase.title}`,
    `- 任务目标：${testCase.objective}`,
    `- 输入 Prompt：${testCase.prompt}`,
    "",
    "## Observable output",
    evidence.observableOutput,
    "",
    "## User observation",
    evidence.userObservation,
    "",
    "## Concrete evidence",
    evidence.concreteEvidence,
    "",
    "## Signal",
    evidence.signal,
    "",
    "## Observation focus",
    ...testCase.observationFocus.map((item) => `- ${item}`),
    "",
    "该记录为模拟测试日志，不应被改写为产品真实实测事实。",
  ].join("\n");
}

function isAuthorized(request: Request) {
  const token = process.env.AUTO_DEMO_TOKEN;
  return process.env.NODE_ENV !== "production"
    && process.env.AUTO_DEMO_MODE === "1"
    && Boolean(token)
    && request.headers.get("x-auto-demo-token") === token;
}
