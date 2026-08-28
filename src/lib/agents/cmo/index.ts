import { generateText, Output } from "ai";
import { ZodError } from "zod";
import { analystAgent } from "@/lib/agents/analyst";
import type { AnalystPayload, AnalystResult } from "@/lib/agents/analyst/schema";
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
import {
  StrategistResultSchema,
  type StrategistPayload,
  type StrategistResult,
} from "@/lib/agents/strategist/schema";
import { model, MODELS } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import { runAgent } from "@/lib/agents/run";
import type { Agent, AgentInput } from "@/lib/agents/types";
import { getDb } from "@/lib/db";
import {
  buildSynthesisPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  conversationalResponse,
  formatCmoResponse,
} from "./prompt";
import {
  getOrCreateCmoConversation,
  loadCmoContext,
  loadPendingClarification,
  saveCmoExchange,
} from "./memory";
import {
  CmoDecisionSchema,
  CmoSynthesisSchema,
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
  const verdictTitles = {
    strong: "This is a strong idea",
    promising: "Good idea — refine the execution",
    "needs-work": "The idea needs tightening",
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
    recommendation: "",
    nextStep: strategy.informationRequests.find((request) => request.severity === "blocking")?.question ??
      "Choose the option you want to develop, or ask me to combine parts of them.",
  };
}

function strategyFailureResponseFromHandoffs(handoffs: WorkerHandoff[]): CmoResponse | null {
  const failure = handoffs.find((handoff) =>
    (handoff.agentId === "analyst" || handoff.agentId === "strategist") &&
    handoff.status === "failed");
  if (!failure) return null;
  return {
    title: "I couldn’t finish the comparison",
    executiveSummary: failure.agentId === "analyst"
      ? "The current evidence check did not finish, so I won’t pretend to judge the idea without it."
      : "The strategy comparison did not finish, so I can’t responsibly rank three options yet.",
    keyPoints: [],
    options: [],
    recommendation: "",
    nextStep: "Retry the request. The development trace will show which stage failed.",
  };
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
      nextStep: "Open Campaign Review, save the campaign details, and retry.",
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
    nextStep: review.recommendations[0].action,
  };
}

function deterministicCampaignReviewDecision(message: string): CmoDecision | null {
  const explicitReview = /\b(?:review|audit|critique|critic|readiness check|pre[ -]?flight|post[ -]?flight|assess)\b/i.test(message) &&
    /\bcampaign\b/i.test(message);
  if (!explicitReview) return null;
  const reviewMode = /\b(?:post[ -]?flight|results?|performance|after launch|completed|ended)\b/i.test(message)
    ? "postflight" as const
    : "preflight" as const;
  const campaignId = message.match(/\bcampaign(?:\s+id)?\s*[:#]\s*([a-zA-Z0-9_-]{8,160})\b/i)?.[1] ?? "";
  return CmoDecisionSchema.parse({
    intent: "review-campaign",
    response: {
      title: reviewMode === "preflight" ? "Campaign review in progress" : "Campaign results review in progress",
      executiveSummary: reviewMode === "preflight"
        ? "I’m checking the latest saved campaign for launch blockers."
        : "I’m comparing the latest saved campaign results with its original hypothesis.",
      keyPoints: [],
      options: [],
      recommendation: "",
      nextStep: "Review the Campaign Critic verdict and highest-priority action.",
    },
    delegations: [{
      agentId: "campaign-critic",
      instruction: message,
      url: "",
      channel: "none",
      from: "",
      to: "",
      products: [],
      topics: [],
      horizon: "sprint",
      campaignId,
      reviewMode,
    }],
  });
}

function deterministicStrategyDecision(message: string): CmoDecision | null {
  const explicitStrategy = /\b(?:strategy|strategic plan|go-to-market|gtm|campaign plan|content plan)\b/i.test(message);
  const promotionAdvice = /\b(?:promotion|offer|campaign|marketing idea)\b/i.test(message) &&
    /\b(?:thinking of|plan|create|recommend|suggest|what do you think|should we|how should)\b/i.test(message);
  if (!explicitStrategy && !promotionAdvice) {
    return null;
  }
  const channel = ["linkedin", "instagram", "email"].find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(message)) ?? "none";
  return CmoDecisionSchema.parse({
    intent: "strategize",
    response: {
      title: "Strategy in progress",
      executiveSummary: "I’m refreshing the evidence before setting the strategic direction.",
      keyPoints: [],
      options: [],
      recommendation: "",
      nextStep: "Review the proposed sprint before content production begins.",
    },
    delegations: [{
      agentId: "strategist",
      instruction: message,
      url: "",
      channel,
      from: "",
      to: "",
      products: [],
      topics: [],
      horizon: /\b(?:quarter|quarterly|90[ -]?day)\b/i.test(message)
        ? "quarter"
        : "sprint",
    }],
  });
}

function canonicalSelector(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

async function runStrategyPipeline(
  plan: CmoDecision["delegations"][number],
  input: AgentInput<CmoPayload>,
  activeDirective: string | undefined,
): Promise<WorkerHandoff[]> {
  const productSelectors = explicitProductSelectors(plan.instruction, plan.products);
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
    detail: {
      snapshotId: intelligence.result.snapshotId,
      generatedAt: intelligence.result.generatedAt,
      dataThrough: intelligence.result.dataThrough,
      digest: intelligence.result.digest,
      missingData: intelligence.result.missingData,
    },
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
        "No result data is stored for this campaign. Import metrics in Campaign Review first.",
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
      if (conversational && !pendingClarification) {
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
      });

      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "routing",
        label: "Deciding which specialist workflow is needed",
        status: "working",
        detail: { message: effectiveMessage },
      });
      const deterministicDecision = pendingClarification
        ? null
        : deterministicCampaignReviewDecision(effectiveMessage) ??
          deterministicStrategyDecision(effectiveMessage);
      const decisionCall = deterministicDecision
        ? null
        : await generateText({
            model: model(MODELS.cmo),
            system,
            prompt: buildUserPrompt(effectiveMessage, recentActivity),
            output: Output.object({ schema: CmoDecisionSchema }),
            maxOutputTokens: 1_200,
            providerOptions: {
              google: { thinkingConfig: { thinkingLevel: "low" } },
            },
          });
      const decision = deterministicDecision ?? CmoDecisionSchema.parse(decisionCall?.output);
      emitCmoDevTrace(input.traceId, {
        agentId: "cmo",
        stage: "routing",
        label: "Specialist route selected",
        status: "completed",
        detail: {
          intent: decision.intent,
          deterministic: Boolean(deterministicDecision),
          delegations: decision.delegations,
        },
      });
      const requestedPlans = decision.delegations.slice(0, MAX_DELEGATIONS);
      const hasStrategy = requestedPlans.some((plan) => plan.agentId === "strategist");
      const plans = hasStrategy
        ? requestedPlans.filter((plan) => plan.agentId !== "analyst" && plan.agentId !== "copywriter")
        : requestedPlans;

      let response: CmoResponse = decision.response;
      let inputTokens = decisionCall?.usage.inputTokens ?? 0;
      let outputTokens = decisionCall?.usage.outputTokens ?? 0;

      if (plans.length > 0) {
        for (const plan of plans) {
          if (plan.agentId === "strategist") {
            workerHandoffs.push(...await runStrategyPipeline(
              plan,
              input,
              brand.directives[0]?.statement,
            ));
          } else {
            workerHandoffs.push(await delegate(plan, input, brand.url));
          }
        }
      }

      if (workerHandoffs.length > 0) {
        const strategyResponse = hasStrategy
          ? strategyResponseFromHandoffs(workerHandoffs)
          : null;
        if (strategyResponse) {
          response = strategyResponse;
        } else if (hasStrategy) {
          response = strategyFailureResponseFromHandoffs(workerHandoffs) ?? response;
        } else if (decision.intent === "review-campaign") {
          response = campaignResponseFromHandoffs(workerHandoffs) ?? response;
        } else {
          emitCmoDevTrace(input.traceId, {
            agentId: "cmo",
            stage: "synthesis",
            label: "Synthesising specialist handoffs into a CMO briefing",
            status: "working",
            detail: {
              handoffs: workerHandoffs.map((handoff) => ({
                agentId: handoff.agentId,
                status: handoff.status,
                summary: handoff.summary,
              })),
            },
          });
          const synthesisCall = await generateText({
            model: model(MODELS.cmo),
            system,
            prompt: buildSynthesisPrompt(
              effectiveMessage,
              decision.response,
              workerHandoffs,
            ),
            output: Output.object({ schema: CmoSynthesisSchema }),
            maxOutputTokens: 1_200,
            providerOptions: {
              google: { thinkingConfig: { thinkingLevel: "low" } },
            },
          });
          response = CmoSynthesisSchema.parse(synthesisCall.output).response;
          inputTokens += synthesisCall.usage.inputTokens ?? 0;
          outputTokens += synthesisCall.usage.outputTokens ?? 0;
          emitCmoDevTrace(input.traceId, {
            agentId: "cmo",
            stage: "synthesis",
            label: "CMO briefing synthesised",
            status: "completed",
            detail: { response },
          });
        }
      }

      const clarificationHandoffs = decision.intent === "clarify" &&
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
        : [...plans.map((plan) => plan.agentId), ...pendingDelegation]
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
          intent: decision.intent,
          delegations,
          response,
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
          intent: decision.intent,
          delegations,
        },
        summary: plans.length > 0 ? `${plans.length} delegation${plans.length === 1 ? "" : "s"}` : decision.intent,
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
