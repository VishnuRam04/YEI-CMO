import { generateText, Output } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { MODELS, model } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import { getDb } from "@/lib/db";
import { buildCampaignCriticSystemPrompt, buildPostflightPrompt, buildPreflightPrompt } from "./prompt";
import {
  aggregateCampaignPerformance,
  finalisePostflight,
  finalisePreflight,
  preflightRuleIssues,
} from "./scoring";
import {
  CampaignCriticPayloadSchema,
  CampaignDefinitionSchema,
  PostflightReviewResultSchema,
  PostflightModelEvaluationSchema,
  PreflightReviewResultSchema,
  PreflightModelEvaluationSchema,
  type CampaignCriticPayload,
  type CampaignCriticResult,
  type CampaignDefinition,
  type CampaignMetricSnapshot,
} from "./schema";
import {
  campaignDefinitionFromRecord,
  executionPlanWithDefinition,
  executionPlanWithReview,
  latestCampaignReview,
  storedReview,
} from "./storage";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function saveCampaign(brandId: string, campaign: CampaignDefinition) {
  const db = getDb();
  if (campaign.id) {
    const existing = await db.campaign.findFirst({
      where: { id: campaign.id, brandId },
    });
    if (existing) {
      return db.campaign.update({
        where: { id: existing.id },
        data: {
          objective: campaign.objective,
          executionPlan: executionPlanWithDefinition(existing.executionPlan, campaign),
        },
      });
    }
  }
  return db.campaign.create({
    data: {
      brandId,
      strategyId: `critic-${crypto.randomUUID()}`,
      selectedOptionId: "manual",
      objective: campaign.objective,
      status: "draft",
      strategy: jsonValue({
        source: "campaign-critic",
        strategicThesis: campaign.hypothesis,
        targetAudiences: campaign.audiences.map((audience) => audience.name),
        offerStrategy: campaign.offer.valueProposition,
        channelRoles: campaign.channels.map((channel) => ({ channel, purpose: "campaign delivery" })),
      }),
      executionPlan: executionPlanWithDefinition({
        campaignName: campaign.name,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        currency: campaign.budget.currency,
        measurement: {
          primaryMetric: campaign.primaryKpi,
          targetValue: campaign.targetValue,
          targetUnit: campaign.targetUnit,
        },
        landingPage: campaign.landingPage,
        tracking: campaign.tracking,
      }, campaign),
    },
  });
}

async function loadCampaign(brandId: string, campaignId: string) {
  const campaign = await getDb().campaign.findFirst({
    where: { id: campaignId, brandId },
  });
  if (!campaign) return null;
  return {
    row: campaign,
    definition: campaignDefinitionFromRecord(campaign),
  };
}

async function loadCampaignMetrics(
  brandId: string,
  campaignId: string,
): Promise<CampaignMetricSnapshot[]> {
  const campaign = await getDb().campaign.findFirst({
    where: { id: campaignId, brandId },
    select: { executionPlan: true },
  });
  const priorReview = latestCampaignReview(campaign?.executionPlan, "postflight");
  const priorInput = CampaignCriticPayloadSchema.safeParse(priorReview?.inputSnapshot);
  return priorInput.success && priorInput.data.mode === "postflight"
    ? priorInput.data.metrics
    : [];
}

async function persistReview(options: {
  reviewId: string;
  campaignId: string;
  mode: "preflight" | "postflight";
  verdict: string;
  score: number | null;
  traceId: string;
  input: unknown;
  result: CampaignCriticResult;
  createdAt: string;
}) {
  const db = getDb();
  const campaign = await db.campaign.findUnique({
    where: { id: options.campaignId },
    select: { executionPlan: true },
  });
  if (!campaign) throw new Error("Campaign disappeared before its review could be saved.");
  const review = storedReview({
    ...options,
    model: MODELS.judge,
  });
  await db.campaign.update({
    where: { id: options.campaignId },
    data: { executionPlan: executionPlanWithReview(campaign.executionPlan, review) },
  });
}

export const campaignCriticAgent: Agent<CampaignCriticPayload, CampaignCriticResult> = {
  id: "campaign-critic",
  model: MODELS.judge,

  async run(input) {
    const brand = await getDb().brand.findUnique({ where: { id: input.brandId } });
    if (!brand) {
      return agentFailure({
        agentId: "campaign-critic",
        traceId: input.traceId,
        model: MODELS.judge,
        summary: "Brand memory not found",
        error: {
          code: "INPUT_ERROR",
          message: "Build Brand Memory before reviewing a campaign.",
          retryable: false,
        },
      });
    }

    const system = buildCampaignCriticSystemPrompt({
      name: brand.name,
      kernel: brand.kernel,
      voice: brand.voice,
    });
    let inputTokens = 0;
    let outputTokens = 0;

    if (input.payload.mode === "preflight") {
      const campaign = await saveCampaign(input.brandId, input.payload.campaign);
      const definition = CampaignDefinitionSchema.parse({
        ...input.payload.campaign,
        id: campaign.id,
      });
      const ruleIssues = preflightRuleIssues(definition, input.payload.assets);
      let modelEvaluation = null;
      try {
        const call = await generateText({
          model: model(MODELS.judge),
          system,
          prompt: buildPreflightPrompt({
            campaign: definition,
            assets: input.payload.assets,
            ruleIssues,
            notes: input.payload.notes,
          }),
          output: Output.object({ schema: PreflightModelEvaluationSchema }),
          maxOutputTokens: 2_400,
          maxRetries: 1,
          timeout: { totalMs: 8_000 },
          providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
        });
        modelEvaluation = PreflightModelEvaluationSchema.parse(call.output);
        inputTokens = call.usage.inputTokens ?? 0;
        outputTokens = call.usage.outputTokens ?? 0;
      } catch {
        modelEvaluation = null;
      }

      const reviewedAt = new Date().toISOString();
      const reviewId = crypto.randomUUID();
      const final = finalisePreflight({ campaign: definition, ruleIssues, modelEvaluation });
      const result = PreflightReviewResultSchema.parse({
        mode: "preflight",
        reviewId,
        campaignId: campaign.id,
        campaignName: definition.name,
        reviewedAt,
        ...final,
      });
      await persistReview({
        reviewId,
        campaignId: campaign.id,
        mode: "preflight",
        verdict: result.verdict,
        score: result.readinessScore,
        traceId: input.traceId,
        input: input.payload,
        result,
        createdAt: reviewedAt,
      });
      return agentSuccess({
        agentId: "campaign-critic",
        traceId: input.traceId,
        model: MODELS.judge,
        result,
        summary: `Pre-flight · ${result.verdict} · ${result.readinessScore}/100`,
        inputTokens,
        outputTokens,
      });
    }

    const stored = await loadCampaign(input.brandId, input.payload.campaignId);
    if (!stored) {
      return agentFailure({
        agentId: "campaign-critic",
        traceId: input.traceId,
        model: MODELS.judge,
        summary: "Campaign not found",
        error: {
          code: "INPUT_ERROR",
          message: "The selected campaign does not belong to this brand or no longer exists.",
          retryable: false,
        },
      });
    }
    const metrics = input.payload.metrics.length > 0
      ? input.payload.metrics
      : await loadCampaignMetrics(input.brandId, stored.row.id);
    if (metrics.length === 0) {
      return agentFailure({
        agentId: "campaign-critic",
        traceId: input.traceId,
        model: MODELS.judge,
        summary: "Campaign metrics required",
        error: {
          code: "INPUT_ERROR",
          message: "Import campaign metrics before requesting a post-flight review.",
          retryable: false,
        },
      });
    }

    const performance = aggregateCampaignPerformance(stored.definition, metrics);
    let modelEvaluation = null;
    try {
      const call = await generateText({
        model: model(MODELS.judge),
        system,
        prompt: buildPostflightPrompt({
          campaign: stored.definition,
          performance,
          analystFindings: input.payload.analystFindings,
          notes: input.payload.notes,
        }),
        output: Output.object({ schema: PostflightModelEvaluationSchema }),
        maxOutputTokens: 2_200,
        maxRetries: 1,
        timeout: { totalMs: 8_000 },
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      });
      modelEvaluation = PostflightModelEvaluationSchema.parse(call.output);
      inputTokens = call.usage.inputTokens ?? 0;
      outputTokens = call.usage.outputTokens ?? 0;
    } catch {
      modelEvaluation = null;
    }

    const reviewedAt = new Date().toISOString();
    const reviewId = crypto.randomUUID();
    const final = finalisePostflight({
      campaign: stored.definition,
      performance,
      modelEvaluation,
    });
    const result = PostflightReviewResultSchema.parse({
      mode: "postflight",
      reviewId,
      campaignId: stored.row.id,
      campaignName: stored.definition.name,
      reviewedAt,
      ...final,
    });
    await persistReview({
      reviewId,
      campaignId: stored.row.id,
      mode: "postflight",
      verdict: result.outcome,
      score: null,
      traceId: input.traceId,
      input: { ...input.payload, metrics },
      result,
      createdAt: reviewedAt,
    });
    return agentSuccess({
      agentId: "campaign-critic",
      traceId: input.traceId,
      model: MODELS.judge,
      result,
      summary: `Post-flight · ${result.outcome}`,
      inputTokens,
      outputTokens,
    });
  },
};

export * from "./schema";
