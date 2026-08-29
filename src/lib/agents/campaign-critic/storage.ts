import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import {
  CampaignCriticPayloadSchema,
  CampaignCriticResultSchema,
  CampaignDefinitionSchema,
  type CampaignCriticResult,
  type CampaignDefinition,
} from "./schema";

type JsonObject = Record<string, unknown>;

export type CampaignRecord = {
  id: string;
  objective: string;
  selectedOptionId: string;
  strategy: unknown;
  executionPlan: unknown;
  createdAt?: Date | string;
};

export const StoredCampaignReviewSchema = z.object({
  id: z.string().trim().min(1),
  phase: z.enum(["preflight", "postflight"]),
  verdict: z.string().trim().min(1),
  score: z.number().int().min(0).max(100).nullable(),
  model: z.string().trim().min(1),
  traceId: z.string().trim().min(1),
  inputSnapshot: z.unknown(),
  result: CampaignCriticResultSchema,
  createdAt: z.iso.datetime(),
});

export type StoredCampaignReview = z.infer<typeof StoredCampaignReviewSchema>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function textValue(...values: unknown[]): string {
  return values.find((value) => typeof value === "string" && value.trim())?.toString().trim() ?? "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dateValue(value: unknown, fallback: Date): string {
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return fallback.toISOString().slice(0, 10);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function criticState(executionPlan: unknown): JsonObject {
  return objectValue(objectValue(executionPlan).campaignCritic);
}

export function readCampaignReviews(executionPlan: unknown): StoredCampaignReview[] {
  const reviews = criticState(executionPlan).reviews;
  if (!Array.isArray(reviews)) return [];
  return reviews.flatMap((review) => {
    const parsed = StoredCampaignReviewSchema.safeParse(review);
    return parsed.success ? [parsed.data] : [];
  });
}

export function findCampaignReview(executionPlan: unknown, reviewId: string): StoredCampaignReview | null {
  return readCampaignReviews(executionPlan).find((review) => review.id === reviewId) ?? null;
}

export function latestCampaignReview(
  executionPlan: unknown,
  phase?: "preflight" | "postflight",
): StoredCampaignReview | null {
  return readCampaignReviews(executionPlan).find((review) => !phase || review.phase === phase) ?? null;
}

export function executionPlanWithDefinition(
  executionPlan: unknown,
  definition: CampaignDefinition,
): Prisma.InputJsonValue {
  const plan = objectValue(jsonValue(executionPlan));
  const critic = criticState(plan);
  return jsonValue({
    ...plan,
    campaignName: definition.name,
    startDate: definition.startDate,
    endDate: definition.endDate,
    campaignCritic: {
      ...critic,
      definition,
      reviews: Array.isArray(critic.reviews) ? critic.reviews : [],
    },
  });
}

export function executionPlanWithReview(
  executionPlan: unknown,
  review: StoredCampaignReview,
): Prisma.InputJsonValue {
  const plan = objectValue(jsonValue(executionPlan));
  const critic = criticState(plan);
  const reviews = readCampaignReviews(plan).filter((item) => item.id !== review.id);
  return jsonValue({
    ...plan,
    campaignCritic: {
      ...critic,
      latestReviewId: review.id,
      reviews: [review, ...reviews].slice(0, 50),
    },
  });
}

function definitionFromPriorReview(record: CampaignRecord): CampaignDefinition | null {
  const prior = latestCampaignReview(record.executionPlan, "preflight");
  const payload = CampaignCriticPayloadSchema.safeParse(prior?.inputSnapshot);
  if (!payload.success || payload.data.mode !== "preflight") return null;
  return CampaignDefinitionSchema.parse({ ...payload.data.campaign, id: record.id });
}

export function campaignDefinitionFromRecord(record: CampaignRecord): CampaignDefinition {
  const executionPlan = objectValue(record.executionPlan);
  const stored = CampaignDefinitionSchema.safeParse({
    ...objectValue(criticState(executionPlan).definition),
    id: record.id,
  });
  if (stored.success) return stored.data;

  const prior = definitionFromPriorReview(record);
  if (prior) return prior;

  const strategy = objectValue(record.strategy);
  const experiments = Array.isArray(strategy.experiments)
    ? strategy.experiments.map(objectValue)
    : [];
  const selected = experiments.find((experiment) => experiment.id === record.selectedOptionId)
    ?? experiments.find((experiment) => experiment.id === strategy.recommendedExperimentId)
    ?? experiments[0]
    ?? {};
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();
  const fallbackEnd = new Date(createdAt);
  fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + 14);
  const channelRoles = Array.isArray(strategy.channelRoles) ? strategy.channelRoles.map(objectValue) : [];
  const schedule = Array.isArray(executionPlan.schedule) ? executionPlan.schedule.map(objectValue) : [];
  const channels = [...new Set([
    textValue(selected.channel),
    ...schedule.map((item) => textValue(item.channel)),
    ...channelRoles.map((role) => textValue(role.channel)),
  ].filter(Boolean))];
  const audiences = Array.isArray(strategy.targetAudiences)
    ? strategy.targetAudiences.flatMap((audience) => {
        const name = typeof audience === "string" ? audience.trim() : textValue(objectValue(audience).name);
        return name ? [{ name, need: "", targeting: "" }] : [];
      })
    : [];
  const measurement = objectValue(executionPlan.measurement);
  const tracking = objectValue(executionPlan.tracking);
  const landingPage = objectValue(executionPlan.landingPage);
  const allocation = numberValue(objectValue(strategy.constraints).budget) ?? 0;

  return CampaignDefinitionSchema.parse({
    id: record.id,
    name: textValue(executionPlan.campaignName, strategy.campaignName, `Campaign ${record.id.slice(0, 8)}`),
    objective: record.objective,
    hypothesis: textValue(selected.hypothesis, strategy.strategicThesis),
    offer: {
      name: textValue(selected.title),
      valueProposition: textValue(strategy.offerStrategy, selected.approach),
      callToAction: textValue(executionPlan.callToAction),
      proofPoints: [],
    },
    audiences,
    channels,
    budget: { amount: allocation, currency: textValue(executionPlan.currency, "MYR"), allocations: [] },
    startDate: dateValue(executionPlan.startDate, createdAt),
    endDate: dateValue(executionPlan.endDate, fallbackEnd),
    primaryKpi: textValue(measurement.primaryMetric, selected.primaryMetric),
    targetValue: numberValue(measurement.targetValue),
    targetUnit: textValue(measurement.targetUnit, "results"),
    landingPage: {
      url: typeof landingPage.url === "string" ? landingPage.url : undefined,
      headline: textValue(landingPage.headline),
      offer: textValue(landingPage.offer),
      callToAction: textValue(landingPage.callToAction),
    },
    tracking: {
      analyticsConfigured: tracking.analyticsConfigured === true,
      pixelConfigured: tracking.pixelConfigured === true,
      conversionEvent: textValue(tracking.conversionEvent),
      utmPlan: textValue(tracking.utmPlan),
    },
  });
}

export function storedReview(options: {
  reviewId: string;
  mode: "preflight" | "postflight";
  verdict: string;
  score: number | null;
  model: string;
  traceId: string;
  input: unknown;
  result: CampaignCriticResult;
  createdAt: string;
}): StoredCampaignReview {
  return StoredCampaignReviewSchema.parse({
    id: options.reviewId,
    phase: options.mode,
    verdict: options.verdict,
    score: options.score,
    model: options.model,
    traceId: options.traceId,
    inputSnapshot: options.input,
    result: options.result,
    createdAt: options.createdAt,
  });
}
