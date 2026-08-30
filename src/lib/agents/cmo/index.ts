import { generateText, NoObjectGeneratedError, Output } from "ai";
import { ZodError } from "zod";
import { analystAgent } from "@/lib/agents/analyst";
import {
  AnalystResultSchema,
  type AnalystPayload,
  type AnalystResult,
} from "@/lib/agents/analyst/schema";
import { brandAnalystAgent } from "@/lib/agents/brand-analyst";
import {
  BrandAnalystPayloadSchema,
  InformationRequestSchema,
  type BrandAnalystPayload,
  type InformationRequest,
} from "@/lib/agents/brand-analyst/schema";
import { campaignCriticAgent } from "@/lib/agents/campaign-critic";
import {
  CampaignCriticPayloadSchema,
  CampaignCriticResultSchema,
  type CampaignCriticPayload,
} from "@/lib/agents/campaign-critic/schema";
import {
  campaignDefinitionFromRecord,
  latestCampaignReview,
} from "@/lib/agents/campaign-critic/storage";
import { copywriterAgent } from "@/lib/agents/copywriter";
import type { CopywriterPayload } from "@/lib/agents/copywriter/schema";
import { strategistAgent } from "@/lib/agents/strategist";
import { saveProposedCampaign } from "@/lib/campaign/store";
import {
  buildLoopSystemPrompt,
  buildLoopUserPrompt,
  decisionProblem,
  LoopDecisionSchema,
  MAX_LOOP_STEPS,
  type LoopDecision,
  type LoopObservation,
} from "./loop";
import {
  CapabilityCallArgsSchema,
  findCapability,
} from "./registry";
import {
  StrategistResultSchema,
  type StrategistPayload,
  type StrategistResult,
} from "@/lib/agents/strategist/schema";
import { computeCost } from "@/lib/agents/cost";
import { model, MODELS } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import { runAgent } from "@/lib/agents/run";
import type { Agent, AgentInput, AgentTelemetry } from "@/lib/agents/types";
import { getDb } from "@/lib/db";
import {
  buildSystemPrompt,
  conversationalResponse,
  formatCmoResponse,
} from "./prompt";
import {
  getOrCreateCmoConversation,
  loadCmoContext,
  loadPendingClarification,
  loadPendingPlanOffer,
  saveCmoExchange,
} from "./memory";
import {
  type CmoDecision,
  type CmoPayload,
  type CmoResponse,
  type CmoResult,
} from "./schema";
import { emitCmoDevTrace } from "./dev-trace";

const MAX_DELEGATIONS = 3;

type WorkerHandoff = {
  agentId: "brand-analyst" | "copywriter" | "analyst" | "strategist" | "campaign-critic";
  status: "completed" | "needs-input" | "failed";
  summary: string;
  informationRequests: InformationRequest[];
  missingInformation: string[];
  conflicts: Array<{ field: string; question: string }>;
  detail?: unknown;
};

function basicHandoff(
  agentId: WorkerHandoff["agentId"],
  status: WorkerHandoff["status"],
  summary: string,
): WorkerHandoff {
  return {
    agentId,
    status,
    summary,
    informationRequests: [],
    missingInformation: [],
    conflicts: [],
  };
}

function strategyRequests(result: StrategistResult): InformationRequest[] {
  // Strategy exploration should not interrogate the user for every review-level
  // gap. Only a true blocker interrupts option selection; review gaps can be
  // resolved after the user chooses a direction and moves into execution.
  return result.informationRequests
    .filter((request) => request.severity === "blocking")
    .map((request, index) => ({
    id: `strategy-gap-${index + 1}`,
    field: request.field,
    severity: request.severity,
    resolution: "ask-user" as const,
    reason: request.reason,
    affects: request.affects,
    canResearch: false,
    question: request.question,
    options: [],
    }));
}

function strategyResponseFromHandoffs(handoffs: WorkerHandoff[]): CmoResponse | null {
  const handoff = handoffs.find((candidate) => candidate.agentId === "strategist");
  const parsed = StrategistResultSchema.safeParse(handoff?.detail);
  if (!parsed.success) return null;
  const strategy = parsed.data;
  const analystHandoff = handoffs.find((candidate) => candidate.agentId === "analyst");
  const analyst = AnalystResultSchema.safeParse(analystHandoff?.detail);
  const researchEvidence: CmoResponse["researchEvidence"] = analyst.success
    ? {
        status: analyst.data.intelligenceParts.webAdvantageResearch.status,
        searchedAt: analyst.data.generatedAt,
        summary: analyst.data.intelligenceParts.webAdvantageResearch.summary,
        report: analyst.data.digest,
        findings: analyst.data.marketSignals.slice(0, 8).map((signal) => ({
          id: signal.id,
          finding: signal.finding,
          businessMeaning: signal.implication,
          confidence: signal.confidence,
          sourceUrls: signal.sourceUrls,
        })),
        sources: analyst.data.sources.slice(0, 20).map((source) => ({
          id: source.id,
          title: source.title,
          url: source.url,
          publishedAt: source.publishedAt,
        })),
        checks: analyst.data.connectorStatus.map((check) => ({
          source: check.source,
          status: check.status,
          detail: check.detail,
        })),
        caveats: analyst.data.missingData.filter((item) =>
          /research|connector|youtube|meta|tiktok|trend|public|citation/i.test(item)),
      }
    : undefined;
  const verdictTitles = {
    strong: "This is a strong idea",
    promising: "Good idea — here are three ways to do it",
    "needs-work": "The idea needs a few changes",
    "not-recommended": "I would not run it as proposed",
  } as const;
  return {
    title: verdictTitles[strategy.ideaVerdict],
    executiveSummary: strategy.verdictReason,
    verdict: strategy.ideaVerdict,
    keyPoints: [],
    options: strategy.experiments.slice(0, 3).map((experiment) => ({
      id: experiment.id,
      title: experiment.title,
      summary: experiment.approach,
      cost: experiment.costLevel,
      risk: experiment.riskLevel,
    })),
    recommendedOptionId: strategy.recommendedExperimentId,
    executionPlan: {
      strategyId: strategy.strategyId,
      campaignName: strategy.executionPlan.campaignName,
      startDate: strategy.executionPlan.startDate,
      endDate: strategy.executionPlan.endDate,
      timezone: strategy.executionPlan.timezone,
      totalAssets: strategy.executionPlan.totalAssets,
      cadence: strategy.executionPlan.cadence,
      costLevel: strategy.executionPlan.costLevel,
      planningBasis: strategy.executionPlan.planningBasis,
      schedule: strategy.executionPlan.schedule,
      measurement: strategy.executionPlan.measurement,
    },
    researchEvidence,
    recommendation: "",
    // The plan exists now, so this turn is not offering to build one.
    planOffer: false,
    nextStep: strategy.informationRequests.find((request) => request.severity === "blocking")?.question ??
      "Pick the option you prefer, and I can have the posts and images made for it.",
  };
}

function strategyFailureResponseFromHandoffs(handoffs: WorkerHandoff[]): CmoResponse | null {
  const failure = handoffs.find((handoff) =>
    (handoff.agentId === "analyst" || handoff.agentId === "strategist") &&
    handoff.status === "failed");
  if (!failure) return null;
  return {
    title: "I couldn't finish checking the options",
    executiveSummary: failure.agentId === "analyst"
      ? "The current research did not finish, so I don't have enough information to judge the idea properly."
      : "The three options were not completed, so I can't tell you which one is best yet.",
    keyPoints: [],
    options: [],
    recommendation: "",
    planOffer: false,
    
    nextStep: "Please try again. If you are developing the app, the trace will show which step failed.",
  };
}

/** The user asking outright for the plan to be built. */
export function explicitPlanRequest(message: string): boolean {
  return /\b(?:campaign plan|content plan|marketing plan|go-to-market|gtm)\b/i.test(message) ||
    /\b(?:create|build|make|write|draw up|put together|prepare|draft|give me|show me)\b[^.?!]{0,40}\b(?:plan|strategy|campaign)\b/i.test(message);
}

/** A short yes to a plan offer the previous turn made. */
export function agreesToPlanOffer(message: string): boolean {
  return /^(?:yes|yep|yeah|yup|ok|okay|sure|please|go ahead|do it|go for it|sounds good|let'?s do it|build it|make it|create it|proceed)\b/i
    .test(message.trim());
}

function campaignResponseFromHandoffs(handoffs: WorkerHandoff[]): CmoResponse | null {
  const handoff = handoffs.find((candidate) => candidate.agentId === "campaign-critic");
  if (handoff?.status === "failed") {
    return {
      title: "Campaign review needs input",
      executiveSummary: handoff.summary,
      keyPoints: [],
      options: [],
      recommendation: "",
      planOffer: false,
      nextStep: "Approve a campaign plan first, then ask me to review it.",
    };
  }
  const parsed = CampaignCriticResultSchema.safeParse(handoff?.detail);
  if (!parsed.success) return null;
  const review = parsed.data;
  if (review.mode === "preflight") {
    const verdict = review.verdict === "ready"
      ? "strong" as const
      : review.verdict === "revise"
        ? "needs-work" as const
        : "not-recommended" as const;
    return {
      title: review.verdict === "ready"
        ? `Ready to launch · ${review.readinessScore}/100`
        : review.verdict === "revise"
          ? `Revise before launch · ${review.readinessScore}/100`
          : `Hold campaign · ${review.readinessScore}/100`,
      executiveSummary: review.executiveSummary,
      verdict,
      keyPoints: review.issues.slice(0, 3).map((issue) => `${issue.severity}: ${issue.finding}`),
      options: [],
      recommendation: "",
      planOffer: false,
      nextStep: review.recommendations[0].action,
    };
  }
  const verdict = review.outcome === "met"
    ? "strong" as const
    : review.outcome === "partially-met"
      ? "promising" as const
      : review.outcome === "missed"
        ? "needs-work" as const
        : "needs-work" as const;
  return {
    title: `Campaign outcome · ${review.outcome.replace("-", " ")}`,
    executiveSummary: review.executiveSummary,
    verdict,
    keyPoints: review.diagnosis.slice(0, 3),
    options: [],
    recommendation: "",
    planOffer: false,
    nextStep: review.recommendations[0].action,
  };
}

function canonicalSelector(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Names of products actually present in the confirmed catalogue. The CMO
 * prompt only receives catalogue counts, never the names, so it readily
 * invents plausible ones ("Merdeka Intake") from the user's wording. The
 * Strategist then correctly refuses to plan against products that do not
 * exist, which turned an ordinary request into a dead end. Selectors are
 * checked here so an invented name is simply dropped, while a genuine one
 * still reaches the Strategist and its catalogue guard.
 */
function confirmedProductNames(kernelValue: unknown): string[] {
  const kernel = kernelValue && typeof kernelValue === "object" && !Array.isArray(kernelValue)
    ? kernelValue as Record<string, unknown>
    : {};
  const catalogues = Array.isArray(kernel.productCatalogues) ? kernel.productCatalogues : [];
  return catalogues.flatMap((value) => {
    const catalogue = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const products = Array.isArray(catalogue.products) ? catalogue.products : [];
    return products.flatMap((entry) => {
      const product = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return [product.name, product.sku]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    });
  });
}

/** Keeps only selectors that match a confirmed catalogue name or SKU. */
export function catalogueBackedSelectors(
  selectors: string[],
  kernel: unknown,
): string[] {
  const confirmed = confirmedProductNames(kernel).map(canonicalSelector).filter(Boolean);
  if (confirmed.length === 0) return [];
  return selectors.filter((selector) => {
    const canonical = canonicalSelector(selector);
    return canonical.length > 0 && confirmed.some((name) =>
      name === canonical || name.includes(canonical) || canonical.includes(name));
  });
}

export function explicitProductSelectors(
  instruction: string,
  selectors: string[],
): string[] {
  const canonicalInstruction = ` ${canonicalSelector(instruction)} `;
  return selectors.filter((selector) => {
    const canonical = canonicalSelector(selector);
    return canonical.length > 0 && canonicalInstruction.includes(` ${canonical} `);
  });
}

function informationRequestsFromKernel(kernel: unknown): InformationRequest[] {
  if (!kernel || typeof kernel !== "object" || Array.isArray(kernel)) return [];
  const provenance = (kernel as Record<string, unknown>).provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return [];
  }
  const parsed = InformationRequestSchema.array().safeParse(
    (provenance as Record<string, unknown>).informationRequests,
  );
  return parsed.success ? parsed.data : [];
}

function clarificationFromHandoffs(
  handoffs: WorkerHandoff[],
  resumeInstruction: string,
) {
  const severity = { blocking: 0, review: 1, optional: 2 } as const;
  const request = handoffs
    .flatMap((handoff) => handoff.informationRequests)
    .filter((item) =>
      item.severity !== "optional" && item.resolution !== "research-publicly",
    )
    .sort((left, right) => severity[left.severity] - severity[right.severity])[0];
  if (!request || request.resolution === "upload-catalogue") return null;
  return {
    id: request.id,
    field: request.field,
    severity: request.severity,
    resolution: request.resolution === "choose-conflict"
      ? "choose-conflict" as const
      : "ask-user" as const,
    reason: request.reason,
    question: request.question,
    options: request.options,
    affects: request.affects,
    resumeInstruction,
  };
}

function dateRange(
  plan: CmoDecision["delegations"][number],
  mode: AnalystPayload["mode"] = "performance",
): AnalystPayload {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 90);

  const isIsoDate = (value: string) =>
    value.length > 0 && !Number.isNaN(Date.parse(value));

  return {
    from: isIsoDate(plan.from) ? new Date(plan.from).toISOString() : from.toISOString(),
    to: isIsoDate(plan.to) ? new Date(plan.to).toISOString() : to.toISOString(),
    mode,
    objective: plan.instruction,
    topics: plan.topics,
    channels: plan.channel === "none" ? [] : [plan.channel],
    productNames: plan.products,
  };
}


/** What one CMO turn cost, across the loop and every specialist it ran. */
export interface TurnSpend {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function addSpend(spend: TurnSpend, output: { telemetry?: AgentTelemetry }): void {
  if (!output.telemetry) return;
  spend.inputTokens += output.telemetry.inputTokens || 0;
  spend.outputTokens += output.telemetry.outputTokens || 0;
  spend.costUsd += output.telemetry.costUsd || 0;
}

async function runStrategyPipeline(
  plan: CmoDecision["delegations"][number],
  input: AgentInput<CmoPayload>,
  activeDirective: string | undefined,
  kernel: unknown,
  conversationId: string,
  spend: TurnSpend,
): Promise<WorkerHandoff[]> {
  const productSelectors = catalogueBackedSelectors(
    explicitProductSelectors(plan.instruction, plan.products),
    kernel,
  );
  const intelligencePayload = {
    ...dateRange(plan, "combined"),
    productNames: productSelectors,
  };
  emitCmoDevTrace(input.traceId, {
    agentId: "analyst",
    stage: "intelligence",
    label: "Analysing owned performance and current market evidence",
    status: "working",
    detail: { input: intelligencePayload },
  });
  const intelligence = await runAgent(analystAgent, {
    ...input,
    traceId: `${input.traceId}-intel`,
    payload: intelligencePayload,
  });
  addSpend(spend, intelligence);
  if (!intelligence.ok || !intelligence.result) {
    emitCmoDevTrace(input.traceId, {
      agentId: "analyst",
      stage: "intelligence",
      label: "Analyst could not produce the intelligence snapshot",
      status: "failed",
      detail: { summary: intelligence.summary, error: intelligence.error },
    });
    return [basicHandoff(
      "analyst",
      "failed",
      intelligence.error?.message ?? intelligence.summary,
    )];
  }
  emitCmoDevTrace(input.traceId, {
    agentId: "analyst",
    stage: "intelligence",
    label: "Intelligence snapshot ready",
    status: "completed",
    detail: { summary: intelligence.summary, output: intelligence.result },
  });

  const analystHandoff: WorkerHandoff = {
    ...basicHandoff("analyst", "completed", intelligence.summary),
    detail: intelligence.result,
  };
  const strategyPayload: StrategistPayload = {
    objective: plan.instruction,
    cmoDirective: activeDirective,
    intelligence: intelligence.result as AnalystResult,
    productSelectors,
    channels: plan.channel === "none" ? [] : [plan.channel],
    horizon: plan.horizon,
    constraints: { markets: [] },
  };
  emitCmoDevTrace(input.traceId, {
    agentId: "strategist",
    stage: "strategy",
    label: "Building an evidence-led strategy",
    status: "working",
    detail: {
      input: {
        objective: strategyPayload.objective,
        cmoDirective: strategyPayload.cmoDirective,
        productSelectors: strategyPayload.productSelectors,
        channels: strategyPayload.channels,
        horizon: strategyPayload.horizon,
        constraints: strategyPayload.constraints,
        intelligenceSnapshotId: strategyPayload.intelligence.snapshotId,
      },
    },
  });
  const strategy = await runAgent(strategistAgent, {
    ...input,
    traceId: `${input.traceId}-strategy`,
    payload: strategyPayload,
  });
  addSpend(spend, strategy);
  if (!strategy.ok || !strategy.result) {
    emitCmoDevTrace(input.traceId, {
      agentId: "strategist",
      stage: "strategy",
      label: "Strategist could not complete the plan",
      status: "failed",
      detail: { summary: strategy.summary, error: strategy.error },
    });
    return [
      analystHandoff,
      basicHandoff("strategist", "failed", strategy.error?.message ?? strategy.summary),
    ];
  }
  emitCmoDevTrace(input.traceId, {
    agentId: "strategist",
    stage: "strategy",
    label: "Strategy and experiments ready",
    status: "completed",
    detail: { summary: strategy.summary, output: strategy.result },
  });
  // The plan has to outlive the chat message it arrived in so the user can
  // choose an option and open it on the plan page. A storage failure must not
  // lose the strategy the user is about to read, so it is logged, not thrown.
  try {
    await saveProposedCampaign({
      brandId: input.brandId,
      conversationId,
      strategy: strategy.result as StrategistResult,
    });
  } catch (error) {
    console.error(
      `[cmo] could not persist campaign for trace ${input.traceId}.`,
      error,
    );
  }
  const requests = strategyRequests(strategy.result);
  return [
    analystHandoff,
    {
      ...basicHandoff(
        "strategist",
        requests.some((request) => request.severity !== "optional")
          ? "needs-input"
          : "completed",
        strategy.summary,
      ),
      informationRequests: requests,
      detail: strategy.result,
    },
  ];
}

async function delegate(
  plan: CmoDecision["delegations"][number],
  input: AgentInput<CmoPayload>,
  brandUrl: string,
  spend: TurnSpend,
): Promise<WorkerHandoff> {
  if (plan.agentId === "brand-analyst") {
    const url = plan.url || brandUrl;
    const payload: BrandAnalystPayload = {
      url,
      sources: [
        {
          kind: "website",
          label: "official-website",
          authority: "official-public",
          url,
        },
      ],
      forceRefresh: true,
    };
    emitCmoDevTrace(input.traceId, {
      agentId: "brand-analyst",
      stage: "brand-memory",
      label: "Refreshing confirmed Brand Memory",
      status: "working",
      detail: { input: payload },
    });
    const output = await runAgent(brandAnalystAgent, { ...input, payload });
  addSpend(spend, output);
    if (!output.ok || !output.result) {
      emitCmoDevTrace(input.traceId, {
        agentId: "brand-analyst",
        stage: "brand-memory",
        label: "Brand Analyst could not refresh Brand Memory",
        status: "failed",
        detail: { summary: output.summary, error: output.error },
      });
      return basicHandoff("brand-analyst", "failed", output.error?.message ?? output.summary);
    }
    emitCmoDevTrace(input.traceId, {
      agentId: "brand-analyst",
      stage: "brand-memory",
      label: "Brand Memory refresh complete",
      status: "completed",
      detail: { summary: output.summary, output: output.result },
    });
    return {
      agentId: "brand-analyst",
      status: output.result.informationRequests.length > 0
        ? "needs-input"
        : "completed",
      summary: output.summary,
      informationRequests: output.result.informationRequests,
      missingInformation: output.result.missingInformation,
      conflicts: output.result.conflicts.map((conflict) => ({
        field: conflict.field,
        question: conflict.question,
      })),
    };
  }

  if (plan.agentId === "copywriter") {
    const payload: CopywriterPayload = {
      channel: plan.channel === "none" ? "linkedin" : plan.channel,
      brief: plan.instruction,
      usedKernel: true,
    };
    emitCmoDevTrace(input.traceId, {
      agentId: "copywriter",
      stage: "content",
      label: "Drafting content from the approved brand context",
      status: "working",
      detail: { input: payload },
    });
    const output = await runAgent(copywriterAgent, { ...input, payload });
  addSpend(spend, output);
    emitCmoDevTrace(input.traceId, {
      agentId: "copywriter",
      stage: "content",
      label: output.ok ? "Content draft ready" : "Copywriter could not complete the draft",
      status: output.ok ? "completed" : "failed",
      detail: output.ok
        ? { summary: output.summary, output: output.result }
        : { summary: output.summary, error: output.error },
    });
    return basicHandoff(
      "copywriter",
      output.ok ? "completed" : "failed",
      output.ok ? output.summary : output.error?.message ?? output.summary,
    );
  }

  if (plan.agentId === "strategist") {
    return basicHandoff("strategist", "failed", "Strategy pipeline was not initialized.");
  }

  if (plan.agentId === "campaign-critic") {
    const db = getDb();
    const campaign = await db.campaign.findFirst({
      where: {
        brandId: input.brandId,
        ...(plan.campaignId ? { id: plan.campaignId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!campaign) {
      return basicHandoff("campaign-critic", "failed", "No saved campaign is available to review.");
    }
    const definition = campaignDefinitionFromRecord(campaign);
    const previousReview = latestCampaignReview(campaign.executionPlan, "preflight");
    const previous = CampaignCriticPayloadSchema.safeParse(previousReview?.inputSnapshot);
    const assets = previous.success && previous.data.mode === "preflight"
      ? previous.data.assets
      : [];
    if (plan.reviewMode === "postflight" && !latestCampaignReview(campaign.executionPlan, "postflight")) {
      return basicHandoff(
        "campaign-critic",
        "failed",
        "No result data is stored for this campaign. Import your metrics first.",
      );
    }
    const payload: CampaignCriticPayload = plan.reviewMode === "postflight"
      ? { mode: "postflight", campaignId: campaign.id, metrics: [], analystFindings: [], notes: plan.instruction }
      : { mode: "preflight", campaign: definition, assets, notes: plan.instruction };
    emitCmoDevTrace(input.traceId, {
      agentId: "campaign-critic",
      stage: plan.reviewMode,
      label: plan.reviewMode === "preflight" ? "Checking campaign readiness before spend" : "Comparing campaign results with the hypothesis",
      status: "working",
      detail: { campaignId: campaign.id, mode: plan.reviewMode },
    });
    const output = await runAgent(campaignCriticAgent, {
      ...input,
      traceId: `${input.traceId}-critic`,
      payload,
    });
  addSpend(spend, output);
    emitCmoDevTrace(input.traceId, {
      agentId: "campaign-critic",
      stage: plan.reviewMode,
      label: output.ok ? "Campaign Critic verdict ready" : "Campaign Critic could not complete the review",
      status: output.ok ? "completed" : "failed",
      detail: output.ok
        ? { summary: output.summary, output: output.result }
        : { summary: output.summary, error: output.error },
    });
    return {
      ...basicHandoff(
        "campaign-critic",
        output.ok ? "completed" : "failed",
        output.ok ? output.summary : output.error?.message ?? output.summary,
      ),
      detail: output.result,
    };
  }

  const payload: AnalystPayload = dateRange(plan);
  emitCmoDevTrace(input.traceId, {
    agentId: "analyst",
    stage: "performance",
    label: "Analysing owned performance",
    status: "working",
    detail: { input: payload },
  });
  const output = await runAgent(analystAgent, { ...input, payload });
  addSpend(spend, output);
  emitCmoDevTrace(input.traceId, {
    agentId: "analyst",
    stage: "performance",
    label: output.ok ? "Performance analysis ready" : "Analyst could not complete the analysis",
    status: output.ok ? "completed" : "failed",
    detail: output.ok
      ? { summary: output.summary, output: output.result }
      : { summary: output.summary, error: output.error },
  });
  return {
    ...basicHandoff(
    "analyst",
    output.ok ? "completed" : "failed",
    output.ok ? output.summary : output.error?.message ?? output.summary,
    ),
    detail: output.result,
  };
}

export const cmoAgent: Agent<CmoPayload, CmoResult> = {
  id: "cmo",
  model: MODELS.cmo,

  async run(input) {
    try {
      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "context",
        label: "Loading Brand Memory and conversation context",
        status: "working",
        detail: { brandId: input.brandId },
      });
      let brand = await getDb().brand.findUnique({
        where: { id: input.brandId },
        include: {
          directives: {
            where: { active: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });

      if (!brand) {
        emitCmoDevTrace(input.traceId, {
          agentId: "cmo",
          stage: "context",
          label: "Brand context was not found",
          status: "failed",
          detail: { brandId: input.brandId },
        });
        return agentFailure({
          agentId: "cmo",
          traceId: input.traceId,
          model: MODELS.cmo,
          summary: "Brand not found",
          error: {
            code: "INPUT_ERROR",
            message: "Set up this brand before asking the CMO to act.",
            retryable: false,
          },
        });
      }

      const conversationId = await getOrCreateCmoConversation(
        input.brandId,
        input.payload.conversationId,
      );
      const storedActivity = await loadCmoContext(conversationId);
      const recentActivity = storedActivity.length > 0
        ? storedActivity
        : input.payload.recentActivity;
      const pendingClarification = await loadPendingClarification(conversationId);
      // The Strategist only runs on the user's say-so: either they asked for
      // the plan outright, or they agreed to the offer made last turn.
      const planOfferPending = await loadPendingPlanOffer(conversationId);
      const planApproved = explicitPlanRequest(input.payload.message) ||
        (planOfferPending && agreesToPlanOffer(input.payload.message));
      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "context",
        label: "Brand and conversation context loaded",
        status: "completed",
        detail: {
          brand: { id: brand.id, name: brand.name, url: brand.url },
          activeDirective: brand.directives[0]?.statement ?? null,
          recentActivityCount: recentActivity.length,
          hasPendingClarification: Boolean(pendingClarification),
        },
      });
      const workerHandoffs: WorkerHandoff[] = [];
      // Every model call this turn adds to one running total.
      const spend: TurnSpend = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      let effectiveMessage = input.payload.message;
      const skippedClarification = Boolean(
        pendingClarification &&
        /^(?:skip|skip this|not now|cancel|i don['’]?t know)[.!\s]*$/i.test(
          input.payload.message.trim(),
        ),
      );
      const clarificationFollowUp = Boolean(
        pendingClarification &&
        !skippedClarification &&
        (/\?\s*$/.test(input.payload.message) ||
          /^(?:what|why|how|where|when|who|can you explain|could you explain)\b/i.test(
            input.payload.message.trim(),
          )),
      );
      const changedTopic = Boolean(
        pendingClarification &&
        /^(?:new request|change topic)\s*:/i.test(input.payload.message.trim()),
      );

      if (pendingClarification) {
        if (changedTopic) {
          effectiveMessage = input.payload.message.replace(
            /^(?:new request|change topic)\s*:/i,
            "",
          ).trim();
        } else if (skippedClarification) {
          effectiveMessage = `Resume this original request: ${pendingClarification.resumeInstruction}\nThe user chose to skip the unresolved ${pendingClarification.field} question. Continue only where safe and keep the field incomplete.`;
        } else if (clarificationFollowUp) {
          effectiveMessage = `The user is asking a follow-up about this unresolved question. Explain why it matters without treating their message as the answer, then ask the question again.\nPending question: ${pendingClarification.question}\nReason: ${pendingClarification.reason}\nUser follow-up: ${input.payload.message}`;
        } else {
          const clarificationPayload = BrandAnalystPayloadSchema.parse({
            clarification: {
              requestId: pendingClarification.id,
              field: pendingClarification.field,
              question: pendingClarification.question,
              answer: input.payload.message,
              conversationId,
            },
          });
          const confirmation = await runAgent(brandAnalystAgent, {
            ...input,
            payload: clarificationPayload,
          });
  addSpend(spend, confirmation);
          if (!confirmation.ok) {
            return agentFailure({
              agentId: "cmo",
              traceId: input.traceId,
              model: MODELS.cmo,
              summary: "Clarification could not be applied",
              error: confirmation.error ?? {
                code: "UNKNOWN",
                message: "The confirmed information could not be saved.",
                retryable: true,
              },
            });
          }
          workerHandoffs.push(
            basicHandoff("brand-analyst", "completed", confirmation.summary),
          );
          effectiveMessage = `Resume this original request: ${pendingClarification.resumeInstruction}\nThe user confirmed ${pendingClarification.field}: ${input.payload.message}`;
          brand = await getDb().brand.findUnique({
            where: { id: input.brandId },
            include: {
              directives: {
                where: { active: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
            },
          });
          if (!brand) throw new Error("Brand disappeared after clarification.");
        }
      }

      const conversational = conversationalResponse(
        input.payload.message,
        brand.name,
      );
      if (conversational && !pendingClarification && !planApproved) {
        await saveCmoExchange({
          conversationId,
          userMessage: input.payload.message,
          assistantText: conversational.executiveSummary,
          presentation: "conversation",
          response: conversational,
          delegations: [],
        });
        emitCmoDevTrace(input.traceId, {
          agentId: "cmo",
          stage: "response",
          label: "Direct CMO response ready",
          status: "completed",
          detail: { intent: "chat", response: conversational },
        });

        return agentSuccess({
          agentId: "cmo",
          traceId: input.traceId,
          model: MODELS.cmo,
          result: {
            reply: conversational.executiveSummary,
            response: conversational,
            conversationId,
            presentation: "conversation",
            intent: "chat",
            delegations: [],
            // A canned greeting makes no model call, so it costs nothing.
            spend: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          },
          summary: "chat",
          inputTokens: 0,
          outputTokens: 0,
        });
      }

      const system = buildSystemPrompt({
        name: brand.name,
        url: brand.url,
        kernel: brand.kernel,
        voice: brand.voice,
        strategicDirective: brand.directives[0]?.statement,
        planApproved,
      });

      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "routing",
        label: "Deciding which specialist workflow is needed",
        status: "working",
        detail: { message: effectiveMessage },
      });
      // The CMO acts one step at a time: decide, run, observe, decide again.
      // Nothing is committed up front, so an empty research result or a
      // refused call changes what happens next instead of being ignored.
      const loopSystem = buildLoopSystemPrompt(system);
      const observations: LoopObservation[] = [];
      const used: string[] = [];
      let response: CmoResponse | null = null;
      let askedQuestion = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let intent: CmoDecision["intent"] = "chat";

      for (let step = 1; step <= MAX_LOOP_STEPS + 2; step += 1) {
        const stepsLeft = MAX_LOOP_STEPS - used.length;
        let decision: LoopDecision;
        try {
          const call = await generateText({
            model: model(MODELS.cmo),
            system: loopSystem,
            prompt: buildLoopUserPrompt({
              message: effectiveMessage,
              recentActivity,
              observations,
              stepsLeft,
            }),
            output: Output.object({ schema: LoopDecisionSchema }),
            maxOutputTokens: 3_000,
            providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
          });
          inputTokens += call.usage.inputTokens ?? 0;
          outputTokens += call.usage.outputTokens ?? 0;
          decision = LoopDecisionSchema.parse(call.output);
        } catch (error) {
          // A malformed decision is something the loop can recover from: tell
          // the model what went wrong and let it decide again.
          console.error(
            `[cmo] step ${step} decision did not parse.`,
            NoObjectGeneratedError.isInstance(error)
              ? { text: error.text, cause: error.cause }
              : error,
          );
          observations.push({
            step,
            capability: "(decision)",
            outcome: "denied",
            summary: "Your last output did not match the required shape. Return exactly one action, and when responding include every required field of the response.",
          });
          continue;
        }

        // The instruction for a capability is the user's request unless the
        // model narrowed it, so a missing one is filled rather than refused.
        if (decision.action === "use" && !decision.args?.instruction) {
          decision = {
            ...decision,
            args: { ...(decision.args ?? {}), instruction: effectiveMessage },
          } as LoopDecision;
        }
        const malformed = decisionProblem(decision);
        if (malformed) {
          observations.push({ step, capability: "(decision)", outcome: "denied", summary: malformed });
          continue;
        }

        if (decision.action === "respond") {
          response = decision.response as CmoResponse;
          break;
        }
        if (decision.action === "ask") {
          askedQuestion = decision.question ?? "";
          intent = "clarify";
          break;
        }

        const capability = findCapability(decision.capability ?? "");
        const args = CapabilityCallArgsSchema.parse(decision.args ?? {});
        emitCmoDevTrace(input.traceId, {
          agentId: "cmo",
          stage: "routing",
          label: `Step ${step}: ${capability?.title ?? decision.capability}`,
          status: "working",
          detail: { reasoning: decision.reasoning, capability: decision.capability, args },
        });

        // A refusal is handed back as an observation, so the model can pick a
        // different action rather than having its intent silently dropped.
        const denial = !capability
          ? `There is no capability called "${decision.capability}".`
          : stepsLeft <= 0
            ? "No specialist calls remain this turn; ask or respond now."
            : capability.guard?.({ planApproved, used, args }) ?? null;
        if (denial) {
          observations.push({
            step,
            capability: decision.capability ?? "(unknown)",
            outcome: "denied",
            summary: denial,
          });
          emitCmoDevTrace(input.traceId, {
            agentId: "cmo",
            stage: "routing",
            label: `Step ${step} refused: ${denial}`,
            status: "failed",
            detail: { capability: decision.capability },
          });
          continue;
        }

        const plan = {
          agentId: capability!.id as WorkerHandoff["agentId"],
          instruction: args.instruction,
          url: args.url,
          channel: args.channel,
          from: args.from,
          to: args.to,
          products: args.products,
          topics: args.topics,
          horizon: args.horizon,
          campaignId: args.campaignId,
          reviewMode: args.reviewMode,
        } as CmoDecision["delegations"][number];

        const before = workerHandoffs.length;
        if (capability!.id === "strategist") {
          intent = "strategize";
          workerHandoffs.push(...await runStrategyPipeline(
            plan,
            input,
            brand.directives[0]?.statement,
            brand.kernel,
            conversationId,
            spend,
          ));
        } else {
          if (capability!.id === "campaign-critic") intent = "review-campaign";
          workerHandoffs.push(await delegate(plan, input, brand.url, spend));
        }
        used.push(capability!.id);

        const produced = workerHandoffs.slice(before);
        const worst = produced.find((handoff) => handoff.status === "failed")
          ?? produced.find((handoff) => handoff.status === "needs-input")
          ?? produced[produced.length - 1];
        observations.push({
          step,
          capability: capability!.id,
          outcome: worst?.status ?? "completed",
          summary: produced.map((handoff) => `${handoff.agentId}: ${handoff.summary}`).join(" | "),
        });
      }

      const hasStrategy = used.includes("strategist");
      if (!response) {
        // The loop ran out of steps without answering, or asked a question.
        response = {
          title: askedQuestion ? "One thing before I continue" : "Here is where I got to",
          executiveSummary: askedQuestion
            ? "I need one detail from you before I can go further."
            : observations.map((observation) => observation.summary).join(" ").slice(0, 900)
              || "I could not complete this request.",
          keyPoints: [],
          options: [],
          recommendation: "",
          planOffer: false,
          nextStep: askedQuestion || "Tell me how you would like to proceed.",
        };
      }

      // Special renderings only. There is no synthesis step any more: the
      // model already saw every observation before it chose to respond, so
      // re-summarising its own answer would only overwrite it.
      if (workerHandoffs.length > 0) {
        if (hasStrategy) {
          response = strategyResponseFromHandoffs(workerHandoffs)
            ?? strategyFailureResponseFromHandoffs(workerHandoffs)
            ?? response;
        } else if (intent === "review-campaign") {
          response = campaignResponseFromHandoffs(workerHandoffs) ?? response;
        }
      }

      const clarificationHandoffs = intent === "clarify" &&
        !workerHandoffs.some((handoff) => handoff.informationRequests.length > 0)
        ? [{
            ...basicHandoff("brand-analyst", "needs-input", "Open brand question"),
            informationRequests: informationRequestsFromKernel(brand.kernel),
          }]
        : workerHandoffs;
      const clarification = clarificationFromHandoffs(
        clarificationHandoffs,
        pendingClarification?.resumeInstruction ?? input.payload.message,
      );
      const catalogueRequest = clarificationHandoffs
        .flatMap((handoff) => handoff.informationRequests)
        .find((request) => request.resolution === "upload-catalogue");
      if (clarification) {
        response = {
          ...response,
          nextStep: clarification.options.length
            ? `${clarification.question} Options: ${clarification.options.join("; ")}.`
            : clarification.question,
          clarification,
        };
      } else if (catalogueRequest) {
        response = {
          ...response,
          nextStep: catalogueRequest.question,
          clarification: null,
        };
      } else if (pendingClarification && (skippedClarification || changedTopic)) {
        response = { ...response, clarification: null };
      } else if (response.clarification) {
        response = {
          ...response,
          clarification: {
            ...response.clarification,
            resumeInstruction:
              pendingClarification?.resumeInstruction ?? input.payload.message,
          },
        };
      } else if (pendingClarification && clarificationFollowUp) {
        response = {
          ...response,
          nextStep: pendingClarification.options.length
            ? `${pendingClarification.question} Options: ${pendingClarification.options.join("; ")}.`
            : pendingClarification.question,
          clarification: pendingClarification,
        };
      }

      const reply = formatCmoResponse(response);
      const pendingDelegation = pendingClarification && !skippedClarification &&
          !clarificationFollowUp && !changedTopic
        ? ["brand-analyst" as const]
        : [];
      const delegations = (hasStrategy
        ? Array.from(new Set([
            ...workerHandoffs.map((handoff) => handoff.agentId),
            ...pendingDelegation,
          ]))
        : [...workerHandoffs.map((handoff) => handoff.agentId), ...pendingDelegation]
      ).slice(0, MAX_DELEGATIONS);
      await saveCmoExchange({
        conversationId,
        userMessage: input.payload.message,
        assistantText: reply,
        presentation: "brief",
        response,
        delegations,
      });
      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "response",
        label: "CMO response ready",
        status: "completed",
        detail: {
          intent,
          delegations,
          response,
          steps: observations,
        },
      });

      return agentSuccess({
        agentId: "cmo",
        traceId: input.traceId,
        model: MODELS.cmo,
        result: {
          reply,
          response,
          conversationId,
          presentation: "brief",
          intent,
          delegations,
          spend: {
            inputTokens: spend.inputTokens + inputTokens,
            outputTokens: spend.outputTokens + outputTokens,
            costUsd: spend.costUsd + computeCost(MODELS.cmo, inputTokens, outputTokens),
          },
        },
        summary: used.length > 0
          ? `${used.length} step${used.length === 1 ? "" : "s"}: ${used.join(" -> ")}`
          : intent,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      const validationFailure = error instanceof ZodError;
      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "response",
        label: validationFailure
          ? "CMO received invalid structured output"
          : "CMO orchestration failed",
        status: "failed",
        detail: {
          code: validationFailure ? "VALIDATION_ERROR" : "MODEL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return agentFailure({
        agentId: "cmo",
        traceId: input.traceId,
        model: MODELS.cmo,
        summary: "CMO could not respond",
        error: {
          code: validationFailure ? "VALIDATION_ERROR" : "MODEL_ERROR",
          message: validationFailure
            ? "The CMO returned an invalid orchestration plan. Please retry."
            : "The CMO could not complete this request. Please retry.",
          detail: error instanceof Error ? error.stack : String(error),
          retryable: !validationFailure,
        },
      });
    }
  },
};
